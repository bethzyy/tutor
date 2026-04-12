import { Router } from 'express';
import db from '../db.js';
import {
  startScaleSession,
  submitScaleAnswer,
  generateScaleReport,
  completeScaleSession,
  startSkillSession,
  submitSelfRatings,
  completeSkillAssessment,
  getLatestReport,
  getActiveSession,
} from '../services/assessmentService.js';
import { validate, startAssessmentSchema, submitAnswerSchema, completeAssessmentSchema, reportSchema, selfRateSchema, validateSchema } from '../middleware/validate.js';

const router = Router();

// ============================================================
// Character / Integrated Mode — Standardized Scales
// ============================================================

/**
 * POST /api/assessment/start
 */
router.post('/start', validate(startAssessmentSchema), (req, res) => {
  try {
    const { mode, domain } = req.body;
    const userId = req.userId;

    if (mode === 'skill') {
      if (!domain) {
        return res.status(400).json({ error: 'skill 模式需要提供 domain 参数' });
      }
      const result = startSkillSession(userId, domain);
      return res.json(result);
    }

    if (mode !== 'character' && mode !== 'integrated') {
      return res.status(400).json({ error: '无效的模式，支持 character/integrated/skill' });
    }

    const result = startScaleSession(userId, mode);
    res.json(result);
  } catch (err) {
    console.error('Assessment start failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/assessment/answer
 * Submit an answer to any item (supports out-of-order + re-submission).
 * Body: { session_id, item_id, response_text }
 */
router.post('/answer', validate(submitAnswerSchema), (req, res) => {
  try {
    const { session_id, item_id, response_text } = req.body;

    if (!session_id || !item_id || !response_text) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const result = submitScaleAnswer(session_id, item_id, response_text);
    res.json(result);
  } catch (err) {
    console.error('Assessment answer failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/assessment/complete
 * Complete assessment and generate report.
 * Body: { session_id }
 */
router.post('/complete', validate(completeAssessmentSchema), async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) {
      return res.status(400).json({ error: '缺少 session_id' });
    }

    const report = await completeScaleSession(session_id);
    res.json(report);
  } catch (err) {
    console.error('Assessment complete failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/assessment/report
 * Generate report after assessment completion.
 * Body: { session_id }
 */
router.post('/report', validate(reportSchema), async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) {
      return res.status(400).json({ error: '缺少 session_id' });
    }

    const report = await generateScaleReport(session_id);
    res.json(report);
  } catch (err) {
    console.error('Report generation failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/assessment/report
 * Get the latest report for the current user.
 */
router.get('/report', (req, res) => {
  try {
    const report = getLatestReport(req.userId);
    if (!report) {
      return res.json({ has_report: false });
    }
    res.json({
      has_report: true,
      scale_scores: JSON.parse(report.scale_scores || '{}'),
      weaknesses: JSON.parse(report.weaknesses || '[]'),
      strengths: JSON.parse(report.strengths || '[]'),
      ai_recommendation: report.ai_recommendation,
      created_at: report.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/assessment/resume
 * Check for an in-progress assessment session and return its state.
 * Frontend uses this to restore a previously started assessment.
 */
router.get('/resume', (req, res) => {
  try {
    const session = getActiveSession(req.userId);
    if (!session) {
      return res.json({ has_session: false });
    }

    // Load existing answers for this session
    const responses = db.all(
      'SELECT item_id, response_text FROM assessment_responses WHERE session_id = ?',
      [session.id]
    );
    const answers = {};
    for (const r of responses) {
      answers[r.item_id] = r.response_text;
    }

    if (session.mode === 'skill') {
      res.json({
        has_session: true,
        session_id: session.id,
        mode: 'skill',
        domain: session.domain,
        phase: session.phase,
        template: session.template,
        self_ratings: session.selfRatings,
        validate_areas: session.validateAreas,
      });
    } else {
      res.json({
        has_session: true,
        session_id: session.id,
        mode: session.mode,
        battery_id: session.batteryId,
        items: session.items,
        answered_count: session.answeredCount,
        answers,
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Skill Mode — Self Rating + Validation
// ============================================================

/**
 * POST /api/assessment/self-rate
 * Submit self-ratings for knowledge areas.
 * Body: { session_id, ratings: { area_id: score(0-5) } }
 */
router.post('/self-rate', validate(selfRateSchema), (req, res) => {
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

/**
 * POST /api/assessment/validate
 * Submit validation answers and complete skill assessment.
 * Body: { session_id, answers: [{ item_id, answer }] }
 */
router.post('/validate', validate(validateSchema), async (req, res) => {
  try {
    const { session_id, answers } = req.body;
    if (!session_id || !answers) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const result = await completeSkillAssessment(session_id, answers);
    res.json(result);
  } catch (err) {
    console.error('Validation failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
