import { Router } from 'express';
import db from '../db.js';
import ai from '../ai.js';
import { unlockBadge } from './achievements.js';

const router = Router();

// POST /api/final_exam
router.post('/', async (req, res) => {
  try {
    const state = db.get('SELECT plan, weaknesses, final_exam_passed FROM learning_state WHERE user_id = ?', [req.userId]);

    if (state.final_exam_passed) {
      return res.json({ already_passed: true, message: '你已经通过了最终考核！' });
    }

    const plan = JSON.parse(state.plan || '{}');
    const weaknesses = JSON.parse(state.weaknesses || '[]');

    if (!plan.steps || plan.steps.length === 0) {
      return res.status(400).json({ error: '没有学习计划，无法进行最终考核' });
    }

    const exam = await ai.generateFinalExam(plan, weaknesses);

    // Store exam in DB (persist across restarts, per-user)
    db.run(
      `CREATE TABLE IF NOT EXISTS exam_sessions (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        questions TEXT NOT NULL,
        created_at DATETIME DEFAULT (datetime('now'))
      )`
    );
    // Clean up any old exam for this user
    db.run('DELETE FROM exam_sessions WHERE user_id = ?', [req.userId]);
    db.run(
      'INSERT INTO exam_sessions (user_id, questions) VALUES (?, ?)',
      [req.userId, JSON.stringify(exam)]
    );

    res.json({ exam });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/final_exam/submit
router.post('/submit', async (req, res) => {
  try {
    const { answers } = req.body;

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: '请提供考核答案' });
    }

    const state = db.get('SELECT final_exam_passed FROM learning_state WHERE user_id = ?', [req.userId]);

    if (state.final_exam_passed) {
      return res.json({ already_passed: true, message: '你已经通过了最终考核！' });
    }

    // Load exam questions from DB
    const examRow = db.get(
      'SELECT questions FROM exam_sessions WHERE user_id = ? ORDER BY id DESC LIMIT 1',
      [req.userId]
    );
    if (!examRow) {
      return res.status(400).json({ error: '考核已过期，请重新开始最终考核' });
    }

    const examQuestions = JSON.parse(examRow.questions);
    const result = await ai.evaluateFinalExam(examQuestions, answers);

    if (result.passed) {
      db.run("UPDATE learning_state SET final_exam_passed = 1, updated_at = datetime('now') WHERE user_id = ?", [req.userId]);
      unlockBadge(req.userId, 'graduate');
      // Clean up exam session
      db.run('DELETE FROM exam_sessions WHERE user_id = ?', [req.userId]);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
