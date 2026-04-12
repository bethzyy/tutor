import { Router } from 'express';
import db from '../db.js';
import ai from '../ai.js';
import { unlockBadge } from './achievements.js';

const router = Router();

// POST /api/complete_step
router.post('/complete_step', async (req, res) => {
  try {
    const { step_id } = req.body;
    const state = db.get('SELECT plan, step_statuses, current_step_id FROM learning_state WHERE user_id = ?', [req.userId]);
    const plan = JSON.parse(state.plan || '{}');
    const stepStatuses = JSON.parse(state.step_statuses || '{}');

    const step = plan.steps?.find(s => s.step_id === step_id);
    if (!step) {
      return res.status(400).json({ error: '步骤不存在' });
    }

    if (stepStatuses[String(step_id)] !== 'in_progress') {
      return res.status(400).json({ error: '该步骤不在进行中' });
    }

    const quiz = await ai.generateQuiz(step.title, step.type, step.weaknesses_targeted);

    res.json({
      step,
      quiz,
      quiz_type: step.type,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/submit_quiz
router.post('/submit_quiz', async (req, res) => {
  try {
    const { step_id, answers, quiz: clientQuiz } = req.body;
    const state = db.get('SELECT plan, step_statuses FROM learning_state WHERE user_id = ?', [req.userId]);
    const plan = JSON.parse(state.plan || '{}');
    const stepStatuses = JSON.parse(state.step_statuses || '{}');

    const step = plan.steps?.find(s => s.step_id === step_id);
    if (!step) {
      return res.status(400).json({ error: '步骤不存在' });
    }

    // Use client-sent quiz questions to ensure evaluation matches what user saw
    if (!clientQuiz) {
      return res.status(400).json({ error: '缺少考核题目数据，请重新开始考核' });
    }

    const quiz = Array.isArray(clientQuiz) ? clientQuiz : [clientQuiz];

    const evaluation = await ai.evaluateQuiz(quiz, answers, step.type);

    if (evaluation.passed) {
      stepStatuses[String(step_id)] = 'completed';
      unlockBadge(req.userId, 'first_step');

      const nextStep = plan.steps?.find(s =>
        s.step_id > step_id && stepStatuses[String(s.step_id)] !== 'completed'
      );

      if (nextStep) {
        stepStatuses[String(nextStep.step_id)] = 'in_progress';
        db.run(
          `UPDATE learning_state SET step_statuses = ?, current_step_id = ?, updated_at = datetime('now') WHERE user_id = ?`,
          [JSON.stringify(stepStatuses), nextStep.step_id, req.userId]
        );
      } else {
        db.run(
          `UPDATE learning_state SET step_statuses = ?, current_step_id = 0, updated_at = datetime('now') WHERE user_id = ?`,
          [JSON.stringify(stepStatuses), req.userId]
        );
      }

      const allCompleted = plan.steps?.every(s => stepStatuses[String(s.step_id)] === 'completed');

      res.json({
        passed: true,
        feedback: evaluation.feedback || '考核通过！',
        all_steps_completed: allCompleted,
      });
    } else {
      res.json({
        passed: false,
        feedback: evaluation.feedback || '未通过，请继续学习后重试。',
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
