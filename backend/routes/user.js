import { Router } from 'express';
import db from '../db.js';

const router = Router();

// GET /api/users — list all users
router.get('/', (req, res) => {
  try {
    const users = db.all(
      'SELECT id, name, mode, goal, traits, created_at FROM users ORDER BY id'
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:id/export — export all user data (GDPR)
router.get('/:id/export', (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (userId !== req.userId) {
      return res.status(403).json({ error: '只能导出自己的数据' });
    }

    const user = db.get('SELECT id, name, mode, goal, traits, created_at FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    const exportData = {
      exported_at: new Date().toISOString(),
      profile: user,
      learning_state: db.get('SELECT * FROM learning_state WHERE user_id = ?', [userId]),
      conversations: db.all('SELECT role, content, created_at FROM conversation_history WHERE user_id = ? ORDER BY id', [userId]),
      diagnosis_history: db.all('SELECT mode, weaknesses, traits, created_at FROM diagnosis_history WHERE user_id = ? ORDER BY id', [userId]),
      personality_answers: db.all('SELECT dimension, sub_dimension, question, user_answer, ai_analysis, created_at FROM personality_answers WHERE user_id = ? ORDER BY id', [userId]),
      insights: db.all('SELECT pattern_type, pattern_name, summary, occurrence_count, status, source, first_seen_at, last_seen_at FROM insights WHERE user_id = ? ORDER BY id', [userId]),
      assessment_sessions: db.all(
        `SELECT s.id, s.mode, s.domain, s.status, s.total_items, s.answered_count, s.started_at, s.completed_at,
                r.scale_scores, r.weaknesses, r.strengths, r.ai_recommendation, r.created_at as report_created_at
         FROM assessment_sessions s
         LEFT JOIN assessment_reports r ON r.session_id = s.id
         WHERE s.user_id = ? ORDER BY s.id`, [userId]
      ),
      deep_profiles: db.all(
        `SELECT p.core_findings, p.growth_barriers, p.inner_resources, p.intervention_direction, p.created_at
         FROM deep_profiles p
         JOIN deep_assessment_sessions s ON p.session_id = s.id
         WHERE s.user_id = ? ORDER BY p.id`, [userId]
      ),
    };

    res.setHeader('Content-Disposition', `attachment; filename="tutor_export_${userId}_${Date.now()}.json"`);
    res.json(exportData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:id — delete user and all associated data
router.delete('/:id', (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);

    const user = db.get('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    // Delete all related data
    const tables = [
      'personality_answers', 'diagnosis_history', 'conversation_history',
      'learning_state', 'insights', 'message_patterns', 'insight_interactions',
      'assessment_responses', 'assessment_reports', 'assessment_sessions',
      'deep_assessment_qa', 'deep_assessment_sessions', 'deep_profiles',
    ];
    for (const table of tables) {
      try { db.run(`DELETE FROM ${table} WHERE user_id = ?`, [userId]); } catch {}
    }
    db.run('DELETE FROM users WHERE id = ?', [userId]);

    res.json({ success: true, message: '所有数据已删除' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users — create a new user
router.post('/', (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: '请输入用户名' });
    }
    if (name.length > 20) {
      return res.status(400).json({ error: '用户名不能超过20个字符' });
    }

    const mode = 'integrated';
    db.run(
      "INSERT INTO users (name, mode) VALUES (?, ?)",
      [name.trim(), mode]
    );
    const user = db.get(
      'SELECT id, name, mode FROM users WHERE id = ?',
      [db.get('SELECT last_insert_rowid() as id').id]
    );

    // Create learning state for new user
    db.run('INSERT INTO learning_state (user_id) VALUES (?)', [user.id]);

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/switch — switch active user
router.post('/switch', (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: '请选择用户' });
    }

    const user = db.get('SELECT id, name, mode FROM users WHERE id = ?', [user_id]);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/:id — update user profile
router.patch('/:id', (req, res) => {
  try {
    const { name, goal } = req.body;
    const user = db.get('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    if (name !== undefined) {
      if (name.trim().length === 0) {
        return res.status(400).json({ error: '用户名不能为空' });
      }
      db.run('UPDATE users SET name = ? WHERE id = ?', [name.trim(), req.params.id]);
    }
    if (goal !== undefined) {
      db.run('UPDATE users SET goal = ? WHERE id = ?', [goal, req.params.id]);
    }

    const updated = db.get('SELECT id, name, mode, goal, traits, created_at FROM users WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
