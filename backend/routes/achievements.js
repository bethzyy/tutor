/**
 * Achievement Routes — Badge unlock + listing.
 */

import { Router } from 'express';
import db from '../db.js';

const router = Router();

/**
 * Badge definitions — shared between backend (unlock logic) and frontend (display).
 */
export const BADGES = {
  first_assessment: { name: '科学探索者', icon: '🔬', desc: '完成第一次综合评估' },
  deep_explorer:    { name: '内心探索者', icon: '🧠', desc: '完成 AI 深度追问' },
  first_step:       { name: '行动派', icon: '🚀', desc: '完成第一个学习步骤' },
  streak_7:         { name: '坚持不懈', icon: '🔥', desc: '连续 7 天使用' },
  graduate:         { name: '毕业', icon: '🏆', desc: '通过最终考核' },
  re_assessed:      { name: '成长追踪者', icon: '📈', desc: '完成第二次评估' },
  plan_master:      { name: '计划大师', icon: '📋', desc: '生成并保存成长计划' },
  chatter:          { name: '深度思考', icon: '💬', desc: '与 AI 导师对话超过 20 条' },
};

/**
 * Unlock a badge for a user (idempotent).
 */
export function unlockBadge(userId, badgeType) {
  if (!BADGES[badgeType]) return null;
  try {
    db.run(
      'INSERT OR IGNORE INTO achievements (user_id, badge_type) VALUES (?, ?)',
      [userId, badgeType]
    );
    // Check if it was actually new
    const row = db.get(
      'SELECT unlocked_at FROM achievements WHERE user_id = ? AND badge_type = ?',
      [userId, badgeType]
    );
    return row;
  } catch {
    return null;
  }
}

/**
 * Check and auto-unlock streak badge.
 */
function checkStreak(userId) {
  const messages = db.all(
    `SELECT date(created_at) as d FROM conversation_history
     WHERE user_id = ? AND role = 'user'
     ORDER BY created_at DESC LIMIT 10`,
    [userId]
  );
  if (messages.length < 7) return;

  const dates = [...new Set(messages.map(m => m.d))].sort().reverse();
  if (dates.length >= 7) {
    // Check if 7 consecutive days
    let consecutive = 1;
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1]);
      const curr = new Date(dates[i]);
      const diff = (prev - curr) / (1000 * 60 * 60 * 24);
      if (diff === 1) consecutive++;
      else break;
    }
    if (consecutive >= 7) unlockBadge(userId, 'streak_7');
  }
}

/**
 * Check chat count badge.
 */
function checkChatCount(userId) {
  const row = db.get(
    'SELECT COUNT(*) as c FROM conversation_history WHERE user_id = ? AND role = \'user\'',
    [userId]
  );
  if (row && row.c >= 20) unlockBadge(userId, 'chatter');
}

// GET /api/achievements — list all badges for current user
router.get('/', (req, res) => {
  try {
    const userId = req.userId;

    // Auto-check badges
    checkStreak(userId);
    checkChatCount(userId);

    const unlocked = db.all(
      'SELECT badge_type, unlocked_at FROM achievements WHERE user_id = ? ORDER BY unlocked_at',
      [userId]
    );
    const unlockedTypes = new Set(unlocked.map(a => a.badge_type));

    const allBadges = Object.entries(BADGES).map(([type, def]) => ({
      type,
      name: def.name,
      icon: def.icon,
      description: def.desc,
      unlocked: unlockedTypes.has(type),
      unlocked_at: unlocked.find(a => a.badge_type === type)?.unlocked_at || null,
    }));

    res.json({ badges: allBadges, total: allBadges.length, unlocked_count: unlockedTypes.size });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
