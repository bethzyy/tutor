import { Router } from 'express';
import { startDeepSession, startDeepChatSession, chatDeepRound, submitDeepAnswer, getDeepProfile, getActiveChatSession } from '../services/deepAssessment.js';
import { validate, startDeepSchema, deepAnswerSchema } from '../middleware/validate.js';

const router = Router();

/**
 * POST /api/deep-assessment/start
 * Start deep follow-up assessment (legacy batch mode). Body: { session_id }
 */
router.post('/start', validate(startDeepSchema), async (req, res) => {
  try {
    const { session_id } = req.body;
    const result = await startDeepSession(req.userId, session_id);
    res.json(result);
  } catch (err) {
    console.error('Deep assessment start failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/deep-assessment/chat/start
 * Start conversational deep assessment. Body: { session_id }
 */
router.post('/chat/start', validate(startDeepSchema), async (req, res) => {
  try {
    const { session_id } = req.body;
    const result = await startDeepChatSession(req.userId, session_id);
    res.json(result);
  } catch (err) {
    console.error('Deep chat start failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/deep-assessment/chat
 * Send a message in conversational deep assessment. Body: { session_id, message }
 */
router.post('/chat', async (req, res) => {
  try {
    const { session_id, message } = req.body;
    if (!session_id || !message) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    if (typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: '消息不能为空' });
    }
    if (message.length > 1000) {
      return res.status(400).json({ error: '消息不能超过1000字' });
    }
    const result = await chatDeepRound(session_id, message.trim());
    res.json(result);
  } catch (err) {
    console.error('Deep chat failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/deep-assessment/answer
 * Submit answers for a round (legacy batch mode). Body: { session_id, round, answers }
 */
router.post('/answer', async (req, res) => {
  try {
    const { session_id, round, answers } = req.body;
    if (!session_id || !round || !answers) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    const result = await submitDeepAnswer(session_id, round, answers);
    res.json(result);
  } catch (err) {
    console.error('Deep assessment answer failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/deep-assessment/chat/resume
 * Check for an in-progress conversational deep assessment and return its state.
 */
router.get('/chat/resume', (req, res) => {
  try {
    const result = getActiveChatSession(req.userId);
    if (!result) {
      return res.json({ active: false });
    }
    res.json({ active: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/deep-assessment/profile
 * Get the latest deep profile for current user.
 */
router.get('/profile', (req, res) => {
  try {
    const profile = getDeepProfile(req.userId);
    if (!profile) {
      return res.json({ has_profile: false });
    }
    res.json({
      has_profile: true,
      core_findings: JSON.parse(profile.core_findings || '[]'),
      growth_barriers: JSON.parse(profile.growth_barriers || '[]'),
      inner_resources: JSON.parse(profile.inner_resources || '[]'),
      intervention_direction: JSON.parse(profile.intervention_direction || '[]'),
      created_at: profile.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
