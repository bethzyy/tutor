import { Router } from 'express';
import db from '../db.js';
import ai from '../ai.js';

const router = Router();

// POST /api/generate_plan
router.post('/generate_plan', async (req, res) => {
  try {
    const { goal } = req.body;
    if (!goal || goal.trim().length === 0) {
      return res.status(400).json({ error: '请输入你的成长目标' });
    }
    if (goal.length > 500) {
      return res.status(400).json({ error: '目标描述过长，请控制在500字以内' });
    }

    const user = db.get('SELECT mode FROM users WHERE id = ?', [req.userId]);
    const state = db.get('SELECT weaknesses FROM learning_state WHERE user_id = ?', [req.userId]);
    if (!state) {
      return res.status(500).json({ error: '用户状态异常' });
    }
    const weaknesses = JSON.parse(state.weaknesses || '[]');

    // Fetch latest deep profile if available
    let deepProfile = null;
    try {
      const dp = db.get(
        `SELECT p.* FROM deep_profiles p
         JOIN deep_assessment_sessions s ON p.session_id = s.id
         WHERE s.user_id = ?
         ORDER BY p.created_at DESC LIMIT 1`,
        [req.userId]
      );
      if (dp) {
        deepProfile = {
          core_findings: JSON.parse(dp.core_findings || '[]'),
          growth_barriers: JSON.parse(dp.growth_barriers || '[]'),
          inner_resources: JSON.parse(dp.inner_resources || '[]'),
          intervention_direction: JSON.parse(dp.intervention_direction || '[]'),
        };
      }
    } catch {}

    const plan = await ai.generatePlan(goal, weaknesses, user.mode, deepProfile);

    if (plan.steps) {
      plan.steps.forEach((step, i) => {
        step.step_id = i + 1;
      });
    }

    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/save_plan
router.post('/save_plan', (req, res) => {
  try {
    const { plan } = req.body;
    if (!plan || !plan.steps || !Array.isArray(plan.steps) || plan.steps.length === 0) {
      return res.status(400).json({ error: '无效的计划格式' });
    }

    const stepStatuses = {};
    plan.steps.forEach(step => {
      stepStatuses[String(step.step_id)] = 'pending';
    });
    stepStatuses['1'] = 'in_progress';

    db.run(
      `UPDATE learning_state SET plan = ?, current_step_id = 1, step_statuses = ?, updated_at = datetime('now') WHERE user_id = ?`,
      [JSON.stringify(plan), JSON.stringify(stepStatuses), req.userId]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
