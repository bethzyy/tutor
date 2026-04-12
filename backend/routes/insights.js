import { Router } from 'express';
import db from '../db.js';
import * as insightEngine from '../services/insightEngine.js';

const router = Router();

// GET /api/insights
router.get('/', (req, res) => {
  try {
    const { status, type } = req.query;
    let sql = `SELECT id, pattern_type, pattern_name, summary, confidence,
                      occurrence_count, status, source, first_seen_at, last_seen_at, surfaced_at
               FROM insights WHERE user_id = ?`;
    const params = [req.userId];

    if (status) { sql += ` AND status = ?`; params.push(status); }
    if (type) { sql += ` AND pattern_type = ?`; params.push(type); }
    sql += ` ORDER BY confidence DESC, occurrence_count DESC`;

    const insights = db.all(sql, params);
    res.json({ insights });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/insights/mirror
router.get('/mirror', async (req, res) => {
  try {
    const candidates = insightEngine.checkMirrorMoment(req.userId);
    if (candidates.length === 0) {
      return res.json({ has_mirror: false });
    }

    const insight = candidates.reduce((a, b) =>
      a.confidence * a.occurrence_count > b.confidence * b.occurrence_count ? a : b
    );

    const user = db.get('SELECT name FROM users WHERE id = ?', [req.userId]);
    const mirrorText = await insightEngine.generateMirrorText(insight, user?.name || '');

    insightEngine.markSurfaced(insight.id);

    res.json({
      has_mirror: true,
      insight: {
        id: insight.id,
        pattern_name: insight.pattern_name,
        pattern_type: insight.pattern_type,
        summary: insight.summary,
        mirror_text: mirrorText,
        occurrence_count: insight.occurrence_count,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/insights/:id/reflect
router.post('/:id/reflect', (req, res) => {
  try {
    const { action, reflection } = req.body;
    const insightId = parseInt(req.params.id, 10);

    if (!['confirmed', 'dismissed', 'reflected'].includes(action)) {
      return res.status(400).json({ error: '无效的操作' });
    }

    const insight = db.get('SELECT id FROM insights WHERE id = ? AND user_id = ?', [insightId, req.userId]);
    if (!insight) {
      return res.status(404).json({ error: '洞察不存在' });
    }

    insightEngine.recordReaction(insightId, req.userId, action, reflection || null);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
