/**
 * Assessment Service — Orchestrates the full assessment lifecycle.
 *
 * Character/Integrated mode: loads standardized scales from scaleDefinitions.
 * Skill mode: loads domain template for self-rating + validation.
 * AI is only called for final recommendation, NOT for measurement.
 */

import db from '../db.js';
import { SCALES, BATTERIES, getBatteryItems, getBatteryMeta } from '../scales/scaleDefinitions.js';
import { generateScoreReport, reverseScore, computeSubDimensions } from './scoringEngine.js';
import ai from '../ai.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { unlockBadge } from '../routes/achievements.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '..', 'scales', 'domainTemplates');

// ============================================================
// Session Recovery — DB-backed, survives restarts
// ============================================================

/**
 * Rebuild a session object from DB data.
 * Used instead of in-memory Map so sessions survive server restarts.
 */
function getSession(sessionId) {
  const session = db.get('SELECT * FROM assessment_sessions WHERE id = ? AND status = ?', [sessionId, 'in_progress']);
  if (!session) return null;

  const mode = session.mode;
  const userId = session.user_id;
  const answeredCount = session.answered_count || 0;

  // Rebuild items list based on mode
  if (mode === 'skill') {
    const selfRatings = JSON.parse(session.self_ratings || '{}');
    const domain = session.domain || '';
    const template = loadDomainTemplate(domain);

    // Rebuild validate areas if in validation phase
    let validateAreas = [];
    if (selfRatings && Object.keys(selfRatings).length > 0) {
      const sorted = Object.entries(selfRatings).sort(([, a], [, b]) => a - b);
      validateAreas = sorted.slice(0, Math.min(3, sorted.length)).map(([areaId, score]) => {
        const ka = template?.knowledge_areas?.find(k => k.id === areaId);
        return { id: areaId, name: ka?.name, self_score: score, bloom_level: ka?.bloom_level };
      });
    }

    return {
      id: sessionId,
      userId,
      mode: 'skill',
      domain,
      template,
      selfRatings,
      validateAreas,
      phase: Object.keys(selfRatings).length > 0 ? 'validation' : 'self_rating',
    };
  }

  // Character / Integrated mode
  const batteryId = mode === 'character' ? 'character' : 'integrated';
  const items = getBatteryItems(batteryId);
  const batteryMeta = getBatteryMeta(batteryId);

  return {
    id: sessionId,
    userId,
    mode,
    batteryId,
    items,
    answeredCount,
  };
}

/**
 * On startup, clean up sessions that have been inactive for >24h.
 */
export function recoverSessions() {
  const stale = db.all(
    `SELECT id FROM assessment_sessions
     WHERE status = 'in_progress'
     AND started_at < datetime('now', '-24 hours')`
  );
  for (const s of stale) {
    db.run("UPDATE assessment_sessions SET status = 'expired' WHERE id = ?", [s.id]);
  }
  if (stale.length > 0) {
    console.log(`[AssessmentService] Cleaned up ${stale.length} expired session(s)`);
  }
}

// Run recovery on module load
recoverSessions();

// ============================================================
// Character / Integrated Mode
// ============================================================

/**
 * Start a new standardized scale assessment session.
 * Zero AI calls — all items loaded from predefined scales.
 * Returns ALL items upfront for frontend-side navigation.
 */
export function startScaleSession(userId, mode) {
  const batteryId = mode === 'character' ? 'character' : 'integrated';
  const items = getBatteryItems(batteryId);
  const batteryMeta = getBatteryMeta(batteryId);

  if (items.length === 0) {
    throw new Error('未找到匹配的评估量表');
  }

  // Create DB session
  db.run(
    `INSERT INTO assessment_sessions (user_id, mode, battery, total_items) VALUES (?, ?, ?, ?)`,
    [userId, mode, JSON.stringify(batteryMeta), items.length]
  );

  const session = db.get('SELECT last_insert_rowid() as id');
  const sessionId = session.id;

  // Return all items upfront for client-side navigation
  return {
    session_id: sessionId,
    items: items.map((item, i) => formatItemResponse(sessionId, item, i, items.length)),
    total: items.length,
    scales: batteryMeta,
  };
}

/**
 * Submit an answer for any scale item (supports out-of-order + re-submission).
 * Fire-and-forget from frontend — returns simple acknowledgment.
 */
export function submitScaleAnswer(sessionId, itemId, responseText) {
  const session = getSession(sessionId);
  if (!session) {
    throw new Error('评估会话不存在或已过期');
  }

  const item = session.items.find(it => it.id === itemId);
  if (!item) {
    throw new Error('题目ID不匹配');
  }

  // Compute raw score from response text
  const optionIndex = item.options.indexOf(responseText);
  if (optionIndex === -1) {
    throw new Error('无效的选项');
  }
  const rawScore = optionIndex + 1;
  const maxScore = item.options.length;
  const actualScore = item.reverse_scored
    ? reverseScore(rawScore, maxScore)
    : rawScore;

  // Check if this item was already answered (re-submission / answer change)
  const existing = db.get(
    'SELECT id FROM assessment_responses WHERE session_id = ? AND item_id = ?',
    [sessionId, itemId]
  );

  if (existing) {
    // Update existing answer
    db.run(
      `UPDATE assessment_responses SET response_text = ?, raw_score = ?, actual_score = ?, max_score = ?
       WHERE session_id = ? AND item_id = ?`,
      [responseText, rawScore, actualScore, maxScore, sessionId, itemId]
    );
  } else {
    // New answer
    db.run(
      `INSERT INTO assessment_responses (session_id, item_id, scale_id, user_id, response_text, raw_score, actual_score, max_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, itemId, item.scale_id, session.userId, responseText, rawScore, actualScore, maxScore]
    );
    // Increment answered_count in DB directly
    db.run(
      'UPDATE assessment_sessions SET answered_count = answered_count + 1 WHERE id = ?',
      [sessionId]
    );
  }

  return { ok: true, item_id: itemId };
}

/**
 * Complete a scale assessment session after all items are answered.
 * Generates the full report.
 */
export async function completeScaleSession(sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    throw new Error('评估会话不存在或已过期');
  }

  // Mark session complete in DB
  db.run(
    "UPDATE assessment_sessions SET status = 'completed', completed_at = datetime('now') WHERE id = ?",
    [sessionId]
  );

  // Unlock achievement
  unlockBadge(session.userId, 'first_assessment');
  // Check if re-assessment
  const prevCount = db.get(
    "SELECT COUNT(*) as c FROM assessment_sessions WHERE user_id = ? AND status = 'completed'",
    [session.userId]
  );
  if (prevCount && prevCount.c >= 2) unlockBadge(session.userId, 're_assessed');

  // Generate and return the report
  return await generateScaleReport(sessionId);
}

/**
 * Generate a full report after assessment completion.
 * Zero AI for scoring; optional AI for recommendation.
 */
export async function generateScaleReport(sessionId, includeAIRecommendation = true) {
  // Load session
  const dbSession = db.get('SELECT * FROM assessment_sessions WHERE id = ?', [sessionId]);
  if (!dbSession) throw new Error('评估会话不存在');

  // Load all responses
  const responses = db.all(
    'SELECT * FROM assessment_responses WHERE session_id = ? ORDER BY id',
    [sessionId]
  );

  if (responses.length === 0) throw new Error('没有作答记录');

  // Determine which scales were used
  const batteryId = dbSession.mode === 'character' ? 'character' : 'integrated';
  const scaleIds = BATTERIES[batteryId] || [];
  const usedScales = {};
  for (const sid of scaleIds) {
    if (SCALES[sid]) usedScales[sid] = SCALES[sid];
  }

  // Generate structured score report (pure computation)
  const report = generateScoreReport(responses, usedScales, 'general');

  // Add sub-dimension breakdowns
  for (const [scaleId, scaleDef] of Object.entries(usedScales)) {
    const scaleResponses = responses.filter(r => r.scale_id === scaleId);
    if (scaleResponses.length > 0 && report.scale_scores[scaleId]) {
      report.scale_scores[scaleId].sub_dimensions = computeSubDimensions(scaleResponses, scaleDef);
    }
  }

  // AI recommendation (optional, single call)
  let aiRecommendation = null;
  if (includeAIRecommendation) {
    try {
      aiRecommendation = await ai.assessmentRecommendation(report.scale_scores, report.weaknesses, report.strengths);
    } catch (err) {
      console.warn('AI recommendation failed:', err.message);
    }
  }

  // Save report to DB (aiRecommendation is a parsed object from callAIJson — stringify it)
  const aiRecStr = aiRecommendation ? JSON.stringify(aiRecommendation) : null;
  db.run(
    `INSERT INTO assessment_reports (user_id, session_id, scale_scores, weaknesses, strengths, ai_recommendation)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      dbSession.user_id,
      sessionId,
      JSON.stringify(report.scale_scores),
      JSON.stringify(report.weaknesses),
      JSON.stringify(report.strengths),
      aiRecStr,
    ]
  );

  // Also update learning_state weaknesses for compatibility with existing plan generation
  const compatWeaknesses = report.weaknesses.map(w => ({
    type: 'personality',
    name: w.name || w.dimension,
    severity: w.severity,
  }));

  db.run(
    'UPDATE learning_state SET weaknesses = ? WHERE user_id = ?',
    [JSON.stringify(compatWeaknesses), dbSession.user_id]
  );

  // Save to diagnosis_history for compatibility
  db.run(
    `INSERT INTO diagnosis_history (user_id, mode, weaknesses) VALUES (?, ?, ?)`,
    [dbSession.user_id, dbSession.mode, JSON.stringify(compatWeaknesses)]
  );

  // Build traits for user profile
  const traits = {};
  for (const [sid, score] of Object.entries(report.scale_scores)) {
    traits[score.dimension] = {
      avg_score: score.avg,
      max_score: score.max_per_item,
      percentile: score.percentile,
      level: score.level,
      label: score.label,
    };
  }
  traits.last_assessed = new Date().toISOString();
  db.run('UPDATE users SET traits = ? WHERE id = ?', [JSON.stringify(traits), dbSession.user_id]);

  return {
    scale_scores: report.scale_scores,
    weaknesses: compatWeaknesses,
    strengths: report.strengths,
    ai_recommendation: aiRecommendation,
  };
}

// ============================================================
// Skill Mode — Domain Template
// ============================================================

/**
 * Load a domain template by domain name.
 * Falls back to keyword matching if exact match not found.
 */
export function loadDomainTemplate(goalOrDomain) {
  if (!fs.existsSync(TEMPLATES_DIR)) return null;

  const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.json') && f !== 'template_schema.json');

  // Try exact match by filename
  const normalized = goalOrDomain.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const exactMatch = files.find(f => f.replace('.json', '').toLowerCase() === normalized);
  if (exactMatch) {
    return JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, exactMatch), 'utf-8'));
  }

  // Try keyword matching in display_name and description
  const keywords = goalOrDomain.toLowerCase().split(/\s+/);
  for (const file of files) {
    try {
      const tpl = JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, file), 'utf-8'));
      const text = `${tpl.display_name || ''} ${tpl.description || ''} ${(tpl.keywords || []).join(' ')}`.toLowerCase();
      if (keywords.some(kw => text.includes(kw))) {
        return tpl;
      }
    } catch {}
  }

  return null;
}

/**
 * Start a skill assessment session.
 * Returns knowledge areas for self-rating (zero AI).
 */
export function startSkillSession(userId, domain) {
  const template = loadDomainTemplate(domain);
  if (!template) {
    // No domain template — fall back to AI-generated diagnosis
    return { has_template: false, domain };
  }

  db.run(
    `INSERT INTO assessment_sessions (user_id, mode, domain, battery, total_items) VALUES (?, 'skill', ?, ?, 0)`,
    [userId, domain, JSON.stringify({ template: template.domain })]
  );

  const session = db.get('SELECT last_insert_rowid() as id');
  const sessionId = session.id;

  const areas = template.knowledge_areas.map(ka => ({
    id: ka.id,
    name: ka.name,
    bloom_level: ka.bloom_level,
    prompt: ka.self_assessment_prompt,
    prerequisites: ka.prerequisites || [],
  }));

  return {
    has_template: true,
    session_id: sessionId,
    domain: template.display_name,
    knowledge_areas: areas,
    bloom_progression: template.bloom_progression,
  };
}

/**
 * Submit self-ratings for knowledge areas.
 */
export function submitSelfRatings(sessionId, ratings) {
  const session = getSession(sessionId);
  if (!session || session.mode !== 'skill') {
    throw new Error('无效的技能评估会话');
  }

  // Save to DB
  db.run(
    'UPDATE assessment_sessions SET self_ratings = ? WHERE id = ?',
    [JSON.stringify(ratings), sessionId]
  );

  // Pick areas for validation: lowest-rated (2-3 areas)
  const sorted = Object.entries(ratings)
    .sort(([, a], [, b]) => a - b);

  const validateAreas = sorted
    .slice(0, Math.min(3, sorted.length))
    .map(([areaId, score]) => {
      const ka = session.template?.knowledge_areas?.find(k => k.id === areaId);
      return { id: areaId, name: ka?.name, self_score: score, bloom_level: ka?.bloom_level };
    });

  return {
    phase: 'validation',
    validate_areas: validateAreas,
    // Return fixed assessment items from template for these areas
    items: validateAreas.flatMap(va => {
      const ka = session.template?.knowledge_areas?.find(k => k.id === va.id);
      return (ka?.assessment_items || []).map(item => ({
        ...item,
        area_name: ka.name,
        area_id: va.id,
      }));
    }),
  };
}

/**
 * Complete skill assessment after validation questions answered.
 */
export async function completeSkillAssessment(sessionId, validationAnswers) {
  const session = getSession(sessionId);
  if (!session || session.mode !== 'skill') {
    throw new Error('无效的技能评估会话');
  }

  // Compare self-ratings with validation answers to determine weaknesses
  const weaknesses = [];
  const strengths = [];

  for (const va of (session.validateAreas || [])) {
    const ka = session.template?.knowledge_areas?.find(k => k.id === va.id);
    const items = ka?.assessment_items || [];
    const areaAnswers = validationAnswers.filter(a => items.some(i => i.id === a.item_id));

    // Simple heuristic: if user provides substantive answers, self-rating is validated
    const hasGoodAnswers = areaAnswers.some(a => (a.answer?.length || 0) >= 30);

    if (va.self_score <= 2 && !hasGoodAnswers) {
      weaknesses.push({
        type: 'knowledge',
        name: va.name,
        bloom_level: va.bloom_level,
        severity: va.self_score <= 1 ? 'high' : 'medium',
        self_rating: va.self_score,
      });
    } else if (va.self_score >= 4 && hasGoodAnswers) {
      strengths.push({
        name: va.name,
        bloom_level: va.bloom_level,
        self_rating: va.self_score,
      });
    }
  }

  // Also check areas not in validation but with low self-rating
  for (const [areaId, score] of Object.entries(session.selfRatings || {})) {
    if (score <= 2 && !weaknesses.find(w => w.name === session.template?.knowledge_areas?.find(k => k.id === areaId)?.name)) {
      const ka = session.template?.knowledge_areas?.find(k => k.id === areaId);
      if (ka) {
        weaknesses.push({
          type: 'knowledge',
          name: ka.name,
          bloom_level: ka.bloom_level,
          severity: score <= 1 ? 'high' : 'medium',
          self_rating: score,
        });
      }
    }
  }

  // Mark session complete
  db.run(
    "UPDATE assessment_sessions SET status = 'completed', completed_at = datetime('now') WHERE id = ?",
    [sessionId]
  );

  // Update learning_state
  db.run(
    'UPDATE learning_state SET weaknesses = ? WHERE user_id = ?',
    [JSON.stringify(weaknesses), session.userId]
  );

  // Save to diagnosis_history
  db.run(
    `INSERT INTO diagnosis_history (user_id, mode, weaknesses) VALUES (?, 'skill', ?)`,
    [session.userId, JSON.stringify(weaknesses)]
  );

  return { weaknesses, strengths };
}

// ============================================================
// Helpers
// ============================================================

function formatItemResponse(sessionId, item, index, total) {
  return {
    session_id: sessionId,
    item_id: item.id,
    question: item.text,
    index,
    total,
    options: item.options,
    scale_name: item.scale_name,
    dimension: item.dimension,
    sub_dimension: item.sub_dimension,
    reverse_scored: item.reverse_scored,
    max_score: item.max_score,
  };
}

/**
 * Get the latest report for a user.
 */
export function getLatestReport(userId) {
  return db.get(
    `SELECT r.* FROM assessment_reports r
     JOIN assessment_sessions s ON r.session_id = s.id
     WHERE s.user_id = ?
     ORDER BY r.created_at DESC LIMIT 1`,
    [userId]
  );
}

/**
 * Get or create an active session for a user.
 */
export function getActiveSession(userId) {
  const session = db.get(
    "SELECT id FROM assessment_sessions WHERE user_id = ? AND status = 'in_progress' ORDER BY id DESC LIMIT 1",
    [userId]
  );
  return session ? getSession(session.id) : null;
}

export default {
  startScaleSession,
  submitScaleAnswer,
  completeScaleSession,
  generateScaleReport,
  startSkillSession,
  submitSelfRatings,
  completeSkillAssessment,
  loadDomainTemplate,
  getLatestReport,
  getActiveSession,
  recoverSessions,
};
