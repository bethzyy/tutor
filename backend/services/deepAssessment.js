/**
 * Deep Assessment Service — Stage 2: AI-driven follow-up questions.
 *
 * Based on: CBT case conceptualization, Motivational Interviewing,
 * Big Five aspect model, Self-Determination Theory.
 *
 * Supports two modes:
 * - Legacy: 3 rounds of batch Q&A
 * - Chat: Conversational mode — AI responds dynamically to each message
 */

import db from '../db.js';
import ai from '../ai.js';
import { unlockBadge } from '../routes/achievements.js';

const TOTAL_ROUNDS = 3;
const MAX_CHAT_TURNS = 12;

/**
 * Rebuild a deep assessment session from DB.
 */
function getDeepSession(sessionId) {
  const session = db.get('SELECT * FROM deep_assessment_sessions WHERE id = ? AND status = ?', [sessionId, 'in_progress']);
  if (!session) return null;

  const scaleSummary = JSON.parse(session.scale_summary || '{}');
  const weaknesses = scaleSummary.weaknesses || [];
  const scaleScores = scaleSummary.scaleScores || {};

  // Rebuild QA history from DB
  const qaRows = db.all(
    'SELECT * FROM deep_assessment_qa WHERE session_id = ? ORDER BY id',
    [sessionId]
  );
  const qaHistory = [];
  const byRound = {};
  for (const row of qaRows) {
    if (!byRound[row.round]) byRound[row.round] = { questions: [], answers: [], analysis: null };
    byRound[row.round].questions.push({ question: row.question, focus: row.question_focus });
    byRound[row.round].answers.push(row.answer || '');
    if (row.ai_analysis) byRound[row.round].analysis = row.ai_analysis;
  }
  for (const [round, data] of Object.entries(byRound)) {
    qaHistory.push({
      round: parseInt(round),
      questions: data.questions,
      answers: data.answers,
      analysis: data.analysis || '',
    });
  }

  return {
    id: sessionId,
    userId: session.user_id,
    assessmentSessionId: session.assessment_session_id,
    weaknesses,
    scaleScores,
    currentRound: session.current_round || 0,
    mode: session.mode || 'legacy',
    qaHistory,
  };
}

/**
 * Rebuild chat messages from DB for conversational mode.
 */
function getChatHistory(sessionId) {
  const rows = db.all(
    `SELECT * FROM deep_assessment_qa WHERE session_id = ? AND role IN ('user', 'assistant') ORDER BY id`,
    [sessionId]
  );
  return rows.map(r => ({
    role: r.role,
    content: r.role === 'user' ? r.answer : r.question,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
  }));
}

/**
 * Get all explored patterns from chat history metadata.
 */
function getExploredPatterns(sessionId) {
  const rows = db.all(
    `SELECT metadata FROM deep_assessment_qa WHERE session_id = ? AND role = 'assistant' AND metadata IS NOT NULL`,
    [sessionId]
  );
  const patterns = new Set();
  for (const row of rows) {
    try {
      const meta = JSON.parse(row.metadata);
      if (meta.patterns_found) {
        for (const p of meta.patterns_found) patterns.add(p);
      }
    } catch {}
  }
  return [...patterns];
}

/**
 * Count chat turns (user messages only).
 */
function getChatTurnCount(sessionId) {
  const row = db.get(
    `SELECT COUNT(*) as count FROM deep_assessment_qa WHERE session_id = ? AND role = 'user'`,
    [sessionId]
  );
  return row?.count || 0;
}

/**
 * Start a conversational deep assessment session.
 * Returns opening message from AI.
 */
export async function startDeepChatSession(userId, assessmentSessionId) {
  const report = db.get(
    `SELECT r.* FROM assessment_reports r
     JOIN assessment_sessions s ON r.session_id = s.id
     WHERE s.user_id = ? AND s.id = ?
     ORDER BY r.created_at DESC LIMIT 1`,
    [userId, assessmentSessionId]
  );

  if (!report) {
    throw new Error('未找到对应的评估报告，请先完成量表评估');
  }

  const weaknesses = JSON.parse(report.weaknesses || '[]');
  const scaleScores = JSON.parse(report.scale_scores || '{}');

  if (weaknesses.length === 0) {
    throw new Error('量表评估未发现明显弱点，暂不需要深度追问');
  }

  const scaleNames = Object.values(scaleScores).map(s => s.name).join('、');

  // Create session with mode='chat'
  db.run(
    `INSERT INTO deep_assessment_sessions (user_id, assessment_session_id, total_rounds, current_round, scale_summary, mode)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, assessmentSessionId, MAX_CHAT_TURNS, 0, JSON.stringify({ weaknesses, scaleScores }), 'chat']
  );

  const session = db.get('SELECT last_insert_rowid() as id');
  const sessionId = session.id;

  // Generate opening message
  const opening = await ai.deepChatOpening(weaknesses, scaleNames);

  // Save AI's opening message to DB
  const aiMessage = opening.message || '你好！';
  const metadata = JSON.stringify({ phase: opening.phase || 'rapport', patterns_found: [] });
  db.run(
    `INSERT INTO deep_assessment_qa (session_id, round, question, question_focus, role, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [sessionId, 1, aiMessage, 'opening', 'assistant', metadata]
  );

  return {
    session_id: sessionId,
    mode: 'chat',
    max_turns: MAX_CHAT_TURNS,
    opening: aiMessage,
    weaknesses: weaknesses.map(w => ({ name: w.name, dimension: w.dimension, severity: w.severity })),
  };
}

/**
 * Conversational deep assessment: process user message and get AI response.
 */
export async function chatDeepRound(sessionId, userMessage) {
  const session = getDeepSession(sessionId);
  if (!session) {
    throw new Error('深度评估会话不存在或已过期');
  }

  if (session.mode !== 'chat') {
    throw new Error('此会话不是对话模式');
  }

  const turnCount = getChatTurnCount(sessionId);
  if (turnCount >= MAX_CHAT_TURNS) {
    // Force close — generate profile
    return await closeDeepChat(sessionId, session);
  }

  // Save user message
  db.run(
    `INSERT INTO deep_assessment_qa (session_id, round, question, answer, role)
     VALUES (?, ?, ?, ?, ?)`,
    [sessionId, turnCount + 1, '', userMessage, 'user']
  );

  // Get full chat history for context
  const chatHistory = getChatHistory(sessionId);
  // Add the new user message to history for AI context
  chatHistory.push({ role: 'user', content: userMessage });

  const exploredPatterns = getExploredPatterns(sessionId);

  // Get AI response
  const response = await ai.deepChatRespond(
    session.weaknesses,
    chatHistory,
    turnCount + 1,
    MAX_CHAT_TURNS,
    exploredPatterns
  );

  // Check if AI wants to end the conversation
  if (response.should_end || turnCount + 1 >= MAX_CHAT_TURNS) {
    // Save AI's closing message first
    const metadata = JSON.stringify({
      phase: response.phase || 'integration',
      patterns_found: response.patterns_found || [],
    });
    db.run(
      `INSERT INTO deep_assessment_qa (session_id, round, question, question_focus, role, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [sessionId, turnCount + 1, response.message, 'closing', 'assistant', metadata]
    );

    return await closeDeepChat(sessionId, session);
  }

  // Save AI response
  const metadata = JSON.stringify({
    phase: response.phase || 'exploration',
    patterns_found: response.patterns_found || [],
  });
  db.run(
    `INSERT INTO deep_assessment_qa (session_id, round, question, question_focus, role, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [sessionId, turnCount + 1, response.message, response.phase || 'exploration', 'assistant', metadata]
  );

  // Update current_round
  db.run(
    'UPDATE deep_assessment_sessions SET current_round = ? WHERE id = ?',
    [turnCount + 1, sessionId]
  );

  return {
    type: 'message',
    message: response.message,
    turn: turnCount + 1,
    max_turns: MAX_CHAT_TURNS,
    phase: response.phase || 'exploration',
    empathy_note: response.empathy_note || '',
  };
}

/**
 * Close the chat and generate final profile.
 */
async function closeDeepChat(sessionId, session) {
  db.run(
    'UPDATE deep_assessment_sessions SET status = ? WHERE id = ?',
    ['completed', sessionId]
  );

  const chatHistory = getChatHistory(sessionId);

  // Generate profile from the full conversation
  const profile = await ai.deepChatProfile(session.scaleScores, chatHistory);

  // Save profile to DB
  db.run(
    `INSERT INTO deep_profiles (user_id, session_id, core_findings, growth_barriers, inner_resources, intervention_direction)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      session.userId,
      sessionId,
      JSON.stringify(profile.core_findings || []),
      JSON.stringify(profile.growth_barriers || []),
      JSON.stringify(profile.inner_resources || []),
      JSON.stringify(profile.intervention_direction || []),
    ]
  );

  // Save traits
  const traits = {};
  for (const finding of profile.core_findings || []) {
    traits[finding.title] = {
      description: finding.description,
      confidence: finding.confidence,
    };
  }
  traits.deep_assessed = new Date().toISOString();

  const existingUser = db.get('SELECT traits FROM users WHERE id = ?', [session.userId]);
  const existingTraits = JSON.parse(existingUser?.traits || '{}');
  const mergedTraits = { ...existingTraits, ...traits };
  db.run('UPDATE users SET traits = ? WHERE id = ?', [JSON.stringify(mergedTraits), session.userId]);

  unlockBadge(session.userId, 'deep_explorer');

  return {
    type: 'done',
    profile,
  };
}

/**
 * Start a deep assessment session linked to a completed scale assessment (legacy mode).
 */
export async function startDeepSession(userId, assessmentSessionId) {
  // Load the original assessment report
  const report = db.get(
    `SELECT r.* FROM assessment_reports r
     JOIN assessment_sessions s ON r.session_id = s.id
     WHERE s.user_id = ? AND s.id = ?
     ORDER BY r.created_at DESC LIMIT 1`,
    [userId, assessmentSessionId]
  );

  if (!report) {
    throw new Error('未找到对应的评估报告，请先完成量表评估');
  }

  const weaknesses = JSON.parse(report.weaknesses || '[]');
  const scaleScores = JSON.parse(report.scale_scores || '{}');

  if (weaknesses.length === 0) {
    throw new Error('量表评估未发现明显弱点，暂不需要深度追问');
  }

  // Create DB session
  db.run(
    `INSERT INTO deep_assessment_sessions (user_id, assessment_session_id, total_rounds, current_round, scale_summary)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, assessmentSessionId, TOTAL_ROUNDS, 1, JSON.stringify({ weaknesses, scaleScores })]
  );

  const session = db.get('SELECT last_insert_rowid() as id');
  const sessionId = session.id;

  // Generate first round questions
  const questions = await ai.generateFollowUpQuestions(weaknesses, 1);

  // Session is now DB-backed, no need for in-memory storage

  // Save questions to DB
  for (const q of questions.questions || []) {
    db.run(
      `INSERT INTO deep_assessment_qa (session_id, round, question, question_focus)
       VALUES (?, ?, ?, ?)`,
      [sessionId, 1, q.question, q.focus]
    );
  }

  return {
    session_id: sessionId,
    round: 1,
    total_rounds: TOTAL_ROUNDS,
    questions: (questions.questions || []).map(q => ({
      question: q.question,
      focus: q.focus,
      purpose: q.purpose,
    })),
    weaknesses: weaknesses.map(w => ({ name: w.name, dimension: w.dimension, severity: w.severity })),
  };
}

/**
 * Submit answers for a round, analyze them, and generate next round questions.
 */
export async function submitDeepAnswer(sessionId, round, answers) {
  const session = getDeepSession(sessionId);
  if (!session) {
    throw new Error('深度评估会话不存在或已过期');
  }

  if (round !== session.currentRound) {
    throw new Error(`期望第 ${session.currentRound} 轮回答，收到第 ${round} 轮`);
  }

  // Load questions for this round from DB
  const dbQuestions = db.all(
    'SELECT * FROM deep_assessment_qa WHERE session_id = ? AND round = ? ORDER BY id',
    [sessionId, round]
  );

  // Save answers to DB
  const answerTexts = [];
  for (let i = 0; i < dbQuestions.length; i++) {
    const answer = answers[i] || '';
    answerTexts.push(answer);
    db.run(
      'UPDATE deep_assessment_qa SET answer = ? WHERE id = ?',
      [answer, dbQuestions[i].id]
    );
  }

  // Analyze answers with AI
  const questions = dbQuestions.map(q => ({
    question: q.question,
    focus: q.question_focus,
  }));

  let analysis = null;
  try {
    analysis = await ai.analyzeFollowUpAnswers(questions, answerTexts, session.weaknesses);
  } catch (err) {
    console.warn('Deep assessment analysis failed:', err.message);
    analysis = { cognitive_patterns: [], emotional_patterns: [], behavioral_patterns: [], core_beliefs: [], distortion_types: [], key_quotes: [] };
  }

  // Save analysis
  db.run(
    'UPDATE deep_assessment_qa SET ai_analysis = ? WHERE session_id = ? AND round = ?',
    [JSON.stringify(analysis), sessionId, round]
  );

  // Reload session to get updated qaHistory
  const updatedSession = getDeepSession(sessionId);

  // Check if more rounds needed
  if (round >= TOTAL_ROUNDS) {
    // All rounds complete — generate profile
    db.run(
      'UPDATE deep_assessment_sessions SET current_round = ?, status = ? WHERE id = ?',
      [TOTAL_ROUNDS, 'completed', sessionId]
    );

    const profile = await generateProfile(updatedSession);
    unlockBadge(updatedSession.userId, 'deep_explorer');
    return { done: true, profile };
  }

  // Generate next round questions
  const previousQA = updatedSession.qaHistory.flatMap(h =>
    h.questions.map((q, i) => ({ question: q.question, answer: h.answers[i] }))
  );

  const nextQuestions = await ai.generateFollowUpQuestions(updatedSession.weaknesses, round + 1, previousQA);

  db.run(
    'UPDATE deep_assessment_sessions SET current_round = ? WHERE id = ?',
    [round + 1, sessionId]
  );

  // Save next round questions
  for (const q of nextQuestions.questions || []) {
    db.run(
      `INSERT INTO deep_assessment_qa (session_id, round, question, question_focus)
       VALUES (?, ?, ?, ?)`,
      [sessionId, round + 1, q.question, q.focus]
    );
  }

  return {
    done: false,
    session_id: sessionId,
    round: round + 1,
    total_rounds: TOTAL_ROUNDS,
    questions: (nextQuestions.questions || []).map(q => ({
      question: q.question,
      focus: q.focus,
      purpose: q.purpose,
    })),
  };
}

/**
 * Generate the final deep profile.
 */
async function generateProfile(session) {
  const profile = await ai.generateDeepProfile(session.scaleScores, session.qaHistory);

  // Save to DB
  db.run(
    `INSERT INTO deep_profiles (user_id, session_id, core_findings, growth_barriers, inner_resources, intervention_direction)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      session.userId,
      session.id,
      JSON.stringify(profile.core_findings || []),
      JSON.stringify(profile.growth_barriers || []),
      JSON.stringify(profile.inner_resources || []),
      JSON.stringify(profile.intervention_direction || []),
    ]
  );

  // Also save core findings as traits for the user profile
  const traits = {};
  for (const finding of profile.core_findings || []) {
    traits[finding.title] = {
      description: finding.description,
      confidence: finding.confidence,
    };
  }
  traits.deep_assessed = new Date().toISOString();

  const existingUser = db.get('SELECT traits FROM users WHERE id = ?', [session.userId]);
  const existingTraits = JSON.parse(existingUser?.traits || '{}');
  const mergedTraits = { ...existingTraits, ...traits };
  db.run('UPDATE users SET traits = ? WHERE id = ?', [JSON.stringify(mergedTraits), session.userId]);

  return profile;
}

/**
 * Find an active (in-progress) chat-mode deep assessment session for a user.
 * Returns null if none found.
 */
export function getActiveChatSession(userId) {
  const session = db.get(
    `SELECT id, assessment_session_id, scale_summary, current_round
     FROM deep_assessment_sessions
     WHERE user_id = ? AND status = 'in_progress' AND mode = 'chat'
     ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  if (!session) return null;

  const scaleSummary = JSON.parse(session.scale_summary || '{}');
  const chatMessages = getChatHistory(session.id);
  const turnCount = getChatTurnCount(session.id);

  return {
    session_id: session.id,
    messages: chatMessages,
    turn_count: turnCount,
    max_turns: MAX_CHAT_TURNS,
    weaknesses: (scaleSummary.weaknesses || []).map(w => ({
      name: w.name,
      dimension: w.dimension,
      severity: w.severity,
    })),
  };
}

/**
 * Get the latest deep profile for a user.
 */
export function getDeepProfile(userId) {
  return db.get(
    `SELECT p.* FROM deep_profiles p
     JOIN deep_assessment_sessions s ON p.session_id = s.id
     WHERE s.user_id = ?
     ORDER BY p.created_at DESC LIMIT 1`,
    [userId]
  );
}

export default {
  startDeepSession,
  submitDeepAnswer,
  getDeepProfile,
};
