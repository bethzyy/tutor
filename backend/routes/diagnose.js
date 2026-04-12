import { Router } from 'express';
import db from '../db.js';
import ai from '../ai.js';
import {
  startScaleSession,
  submitScaleAnswer,
  completeScaleSession,
  startSkillSession,
  submitSelfRatings,
  completeSkillAssessment,
  loadDomainTemplate,
} from '../services/assessmentService.js';

const router = Router();

// ============================================================
// POST /api/diagnose/start
// Routes to standardized scales (character/integrated) or domain template (skill)
// ============================================================
router.post('/start', async (req, res) => {
  try {
    const user = db.get('SELECT mode, goal FROM users WHERE id = ?', [req.userId]);
    const mode = user?.mode || 'integrated';
    const goal = user?.goal || '通用学习';

    if (mode === 'skill') {
      // Skill mode: try domain template first, fall back to AI-generated
      const templateResult = startSkillSession(req.userId, goal);
      if (templateResult.has_template) {
        return res.json({
          mode: 'skill',
          phase: 'self_rating',
          session_id: templateResult.session_id,
          domain: templateResult.domain,
          knowledge_areas: templateResult.knowledge_areas,
          bloom_progression: templateResult.bloom_progression,
        });
      }

      // No template found — fall back to AI-generated questions (legacy)
      return await startLegacyDiagnosis(req, res, mode, goal);
    }

    // Character / Integrated mode: standardized scales
    const result = startScaleSession(req.userId, mode);
    res.json({
      mode: mode,
      phase: 'scale',
      session_id: result.session_id,
      items: result.items,
      total: result.total,
      scales: result.scales,
    });
  } catch (err) {
    console.error('Diagnosis start failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/diagnose/answer
// Handles scale answers (character/integrated) and AI-generated questions (legacy skill)
// ============================================================
router.post('/answer', async (req, res) => {
  try {
    const { session_id, question_id, answer, score, max_score, item_id, response_text } = req.body;

    // New assessment system: session_id based
    if (session_id) {
      const result = submitScaleAnswer(session_id, item_id || question_id, response_text || answer);

      if (result.done) {
        // Assessment complete — generate report
        const report = await generateScaleReport(result.session_id);
        return res.json({
          done: true,
          weaknesses: report.weaknesses,
          scale_scores: report.scale_scores,
          strengths: report.strengths,
          ai_recommendation: report.ai_recommendation,
        });
      }

      return res.json({
        done: false,
        session_id: result.session_id,
        next_item: {
          item_id: result.item_id,
          question: result.question,
          options: result.options,
          scale_name: result.scale_name,
          dimension: result.dimension,
          sub_dimension: result.sub_dimension,
          max_score: result.max_score,
          index: result.index,
          total: result.total,
        },
      });
    }

    // Legacy path (no session_id) — keep for backward compatibility
    return await legacyAnswer(req, res);
  } catch (err) {
    console.error('Diagnosis answer failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/diagnose/self-rate
// Skill mode: submit self-ratings for knowledge areas
// ============================================================
router.post('/self-rate', (req, res) => {
  try {
    const { session_id, ratings } = req.body;
    if (!session_id || !ratings) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const result = submitSelfRatings(session_id, ratings);
    res.json(result);
  } catch (err) {
    console.error('Self-rating failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/diagnose/validate
// Skill mode: submit validation answers
// ============================================================
router.post('/validate', async (req, res) => {
  try {
    const { session_id, answers } = req.body;
    if (!session_id || !answers) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const result = await completeSkillAssessment(session_id, answers);
    res.json({
      done: true,
      weaknesses: result.weaknesses,
      strengths: result.strengths,
    });
  } catch (err) {
    console.error('Validation failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Legacy diagnosis (AI-generated questions) — kept as fallback
// ============================================================

// Scale definitions per dimension — constant, not AI-generated
const SCALE_OPTIONS = {
  eq:         ['从不', '很少', '有时', '经常', '总是'],
  mindset:    ['非常不同意', '不同意', '有点不同意', '有点同意', '同意', '非常同意'],
  distortions:['从不', '很少', '有时', '经常', '总是'],
  impostor:   ['完全不符合', '不太符合', '不确定', '比较符合', '完全符合'],
  attachment: ['非常不同意', '不同意', '有点不同意', '中立', '有点同意', '同意', '非常同意'],
  knowledge:  ['完全做不到', '基本做不到', '勉强能做到', '比较熟练', '非常熟练'],
  habit:      ['从不', '很少', '有时', '经常', '总是'],
};

function enrichQuestion(q) {
  if (q.options && q.options.length > 0) {
    return { ...q, reverse_scored: q.reverse_scored || false };
  }
  let scaleKey = q.dimension || '';
  if (scaleKey.includes('|')) scaleKey = scaleKey.split('|')[0].trim();
  if (!SCALE_OPTIONS[scaleKey]) {
    if (q.type === 'knowledge') scaleKey = 'knowledge';
    else if (q.type === 'habit' || q.type === 'character') scaleKey = 'habit';
    else scaleKey = 'habit';
  }
  return { ...q, options: SCALE_OPTIONS[scaleKey], scale_type: scaleKey, reverse_scored: q.reverse_scored || false };
}

let diagnosisSession = null;

async function startLegacyDiagnosis(req, res, mode, goal) {
  const rawQuestions = await ai.diagnose(mode, goal);
  const questions = rawQuestions.map(enrichQuestion);

  diagnosisSession = {
    questions,
    answers: [],
    currentIndex: 0,
    userId: req.userId,
    mode,
  };

  res.json({
    mode,
    phase: 'legacy',
    question: questions[0].question,
    question_id: 0,
    total: questions.length,
    type: questions[0].type || 'habit',
    dimension: questions[0].dimension || null,
    sub_dimension: questions[0].sub_dimension || null,
    options: questions[0].options || null,
    scale_type: questions[0].scale_type || null,
  });
}

async function legacyAnswer(req, res) {
  const { question_id, answer, score, max_score } = req.body;

  if (!diagnosisSession) {
    return res.status(400).json({ error: '诊断会话未开始，请先调用 /diagnose/start' });
  }
  if (!answer || answer.trim().length === 0) {
    return res.status(400).json({ error: '请选择一个选项' });
  }

  const q = diagnosisSession.questions[question_id];
  if (!q) return res.status(400).json({ error: '无效的问题ID' });
  if (question_id !== diagnosisSession.currentIndex) {
    return res.status(400).json({ error: '请按顺序回答问题' });
  }

  const maxScore = max_score || q.options?.length || 5;
  let actualScore = score;
  if (q.reverse_scored) actualScore = maxScore - score + 1;

  diagnosisSession.answers.push({ ...q, user_answer: answer, score, max_score: maxScore, actual_score: actualScore });
  diagnosisSession.currentIndex++;

  const nextIndex = diagnosisSession.currentIndex;
  if (nextIndex < diagnosisSession.questions.length) {
    const nextQ = diagnosisSession.questions[nextIndex];
    return res.json({
      next_question: nextQ.question,
      question_id: nextIndex,
      total: diagnosisSession.questions.length,
      type: nextQ.type || 'habit',
      dimension: nextQ.dimension || null,
      sub_dimension: nextQ.sub_dimension || null,
      options: nextQ.options || null,
      scale_type: nextQ.scale_type || null,
      done: false,
    });
  }

  // Complete — derive weaknesses
  const mode = diagnosisSession.mode || 'integrated';
  const scoreWeaknesses = diagnosisSession.answers.map(a => {
    const label = a.weakness_type || a.knowledge_point || a.sub_dimension || a.question.substring(0, 20);
    const ratio = (a.actual_score || a.score || 0) / (a.max_score || 5);
    let severity;
    if (a.reverse_scored) severity = ratio <= 0.4 ? 'low' : ratio <= 0.7 ? 'medium' : 'high';
    else severity = ratio >= 0.7 ? 'low' : ratio >= 0.4 ? 'medium' : 'high';
    return {
      type: a.type === 'character' || a.type === 'habit' ? 'habit' : a.type === 'personality' ? 'personality' : 'knowledge',
      name: label, severity,
    };
  });

  const seen = new Set();
  const unique = scoreWeaknesses.filter(w => { if (seen.has(w.name)) return false; seen.add(w.name); return true; });

  db.run('UPDATE learning_state SET weaknesses = ? WHERE user_id = ?', [JSON.stringify(unique), req.userId]);
  for (const a of diagnosisSession.answers) {
    db.run(
      `INSERT INTO personality_answers (user_id, dimension, sub_dimension, question, user_answer, ai_analysis) VALUES (?, ?, ?, ?, ?, ?)`,
      [diagnosisSession.userId, a.dimension || 'unknown', a.sub_dimension || '', a.question, a.user_answer,
       JSON.stringify({ score: a.score, max_score: a.max_score, actual_score: a.actual_score })]
    );
  }
  db.run(`INSERT INTO diagnosis_history (user_id, mode, weaknesses) VALUES (?, ?, ?)`, [diagnosisSession.userId, mode, JSON.stringify(unique)]);

  diagnosisSession = null;
  res.json({ done: true, weaknesses: unique });
}

export default router;
