import { Router } from 'express';
import db from '../db.js';
import ai from '../ai.js';
import * as insightEngine from '../services/insightEngine.js';
import { buildUserContext } from '../services/userProfile.js';
import { storeEmbedding, buildRelevantMemories } from '../services/vectorMemory.js';
import { validate, chatSchema } from '../middleware/validate.js';

const router = Router();

// POST /api/chat
router.post('/', validate(chatSchema), async (req, res) => {
  try {
    const { message } = req.body;

    // Crisis detection — intercept self-harm/suicide keywords before AI call
    const crisisRe = /自杀|自伤|不想活|割腕|跳楼|吃药.*死|结束生命|活不下去/i;
    if (crisisRe.test(message)) {
      return res.json({
        reply: '听到你说这些，我很担心你。请拨打24小时心理援助热线：400-161-9995（全国）/ 010-82951332（北京）。你不是一个人，有人愿意听你说。',
        mirror_moment: null,
      });
    }

    const state = db.get('SELECT weaknesses, plan, current_step_id FROM learning_state WHERE user_id = ?', [req.userId]);
    if (!state) {
      return res.status(500).json({ error: '用户状态异常' });
    }

    const weaknesses = JSON.parse(state.weaknesses || '[]');
    const plan = JSON.parse(state.plan || '{}');
    const currentStep = plan.steps?.find(s => s.step_id === state.current_step_id) || null;

    const user = db.get('SELECT mode FROM users WHERE id = ?', [req.userId]);
    const mode = user?.mode || 'integrated';

    const history = db.all(
      'SELECT role, content FROM conversation_history WHERE user_id = ? ORDER BY id DESC LIMIT 30',
      [req.userId]
    ).reverse();

    // L2: User profile context
    const userContext = buildUserContext(req.userId);

    // L3: Semantic memory — retrieve relevant past conversations (async, non-blocking if fails)
    let relevantMemories = null;
    try {
      relevantMemories = await buildRelevantMemories(req.userId, message);
    } catch (_) {}

    const reply = await ai.chat(message, currentStep, weaknesses, mode, history, userContext, relevantMemories);

    // Save both messages atomically
    try {
      db.run('BEGIN TRANSACTION');
      db.run('INSERT INTO conversation_history (user_id, role, content) VALUES (?, ?, ?)', [req.userId, 'user', message]);
      const userMsgRow = db.get('SELECT last_insert_rowid() as id');
      db.run('INSERT INTO conversation_history (user_id, role, content) VALUES (?, ?, ?)', [req.userId, 'assistant', reply]);
      db.run('COMMIT');

      // L3: Store embedding for user message (fire-and-forget)
      storeEmbedding(userMsgRow.id, message).catch(() => {});

      // Insight processing (fire-and-forget, never blocks chat)
      try {
        insightEngine.processMessage(req.userId, userMsgRow.id, message).catch(() => {});
      } catch (_) {}
    } catch (txErr) {
      try { db.run('ROLLBACK'); } catch (_) {}
      console.error('Failed to save chat messages:', txErr.message);
    }

    // Check for mirror moment (non-blocking, but wait briefly)
    let mirror_moment = null;
    try {
      const candidates = insightEngine.checkMirrorMoment(req.userId);
      if (candidates.length > 0) {
        const insight = candidates.reduce((a, b) =>
          a.confidence * a.occurrence_count > b.confidence * b.occurrence_count ? a : b
        );
        mirror_moment = {
          insight_id: insight.id,
          pattern_name: insight.pattern_name,
          summary: insight.summary,
          occurrence_count: insight.occurrence_count,
        };
      }
    } catch (_) {}

    res.json({ reply, mirror_moment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
