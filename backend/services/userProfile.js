/**
 * User Profile Service — Builds a concise context summary from accumulated user data.
 *
 * Data sources: users.traits, deep_profiles, assessment_reports, insights, conversation_history.
 * Output: ~200-400 char summary injected into AI system prompts.
 */

import db from '../db.js';

// Simple in-memory cache: userId → { context, timestamp }
const contextCache = new Map();
const CACHE_TTL = 60 * 1000; // 60 seconds

/**
 * Build a concise user context summary for AI prompts.
 * Returns a string or null if no meaningful data exists.
 */
export function buildUserContext(userId) {
  // Check cache first
  const cached = contextCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.context;
  }

  const parts = [];

  // 1. User basics
  const user = db.get('SELECT goal, traits FROM users WHERE id = ?', [userId]);
  if (!user) return null;

  if (user.goal) {
    parts.push(`用户目标：${user.goal}`);
  }

  // 2. Traits (accumulated from assessments + deep profiles)
  if (user.traits) {
    try {
      const traits = JSON.parse(user.traits);
      const traitKeys = Object.keys(traits).filter(k => k !== 'deep_assessed');
      if (traitKeys.length > 0) {
        const traitSummaries = traitKeys.slice(0, 5).map(k => {
          const t = traits[k];
          if (typeof t === 'object' && t.description) return `${k}（${t.description}）`;
          return k;
        });
        parts.push(`性格特征：${traitSummaries.join('、')}`);
      }
    } catch {}
  }

  // 3. Deep profile (core findings + inner resources)
  const deepProfile = db.get(
    `SELECT p.* FROM deep_profiles p
     JOIN deep_assessment_sessions s ON p.session_id = s.id
     WHERE s.user_id = ?
     ORDER BY p.created_at DESC LIMIT 1`,
    [userId]
  );
  if (deepProfile) {
    const dpParts = [];
    try {
      const findings = JSON.parse(deepProfile.core_findings || '[]');
      if (findings.length > 0) {
        dpParts.push(`核心发现：${findings.slice(0, 3).map(f => f.title).join('、')}`);
      }
    } catch {}
    try {
      const barriers = JSON.parse(deepProfile.growth_barriers || '[]');
      if (barriers.length > 0) {
        dpParts.push(`成长阻碍：${barriers.slice(0, 3).map(b => b.name).join('、')}`);
      }
    } catch {}
    try {
      const resources = JSON.parse(deepProfile.inner_resources || '[]');
      if (resources.length > 0) {
        dpParts.push(`内在资源：${resources.slice(0, 3).map(r => r.name).join('、')}`);
      }
    } catch {}
    if (dpParts.length > 0) {
      parts.push(`深度画像：${dpParts.join('；')}`);
    }
  }

  // 4. Latest assessment report summary
  const report = db.get(
    `SELECT r.* FROM assessment_reports r
     JOIN assessment_sessions s ON r.session_id = s.id
     WHERE s.user_id = ?
     ORDER BY r.created_at DESC LIMIT 1`,
    [userId]
  );
  if (report) {
    try {
      const weaknesses = JSON.parse(report.weaknesses || '[]');
      if (weaknesses.length > 0) {
        const weaknessNames = weaknesses.slice(0, 4).map(w =>
          `${w.name}（${w.severity === 'high' ? '较突出' : '中等'}）`
        ).join('、');
        parts.push(`量表弱项：${weaknessNames}`);
      }
    } catch {}
    try {
      const strengths = JSON.parse(report.strengths || '[]');
      if (strengths.length > 0) {
        parts.push(`量表优势：${strengths.slice(0, 3).map(s => s.name).join('、')}`);
      }
    } catch {}
  }

  // 5. Detected behavior patterns (insights)
  try {
    const patterns = db.all(
      `SELECT pattern_name, summary, occurrence_count FROM insights
       WHERE user_id = ? AND status = 'active'
       ORDER BY occurrence_count DESC LIMIT 3`,
      [userId]
    );
    if (patterns.length > 0) {
      const patternDescs = patterns.map(p =>
        `${p.pattern_name}（出现${p.occurrence_count}次）`
      ).join('、');
      parts.push(`行为模式：${patternDescs}`);
    }
  } catch {}

  // 6. Conversation stats
  try {
    const stats = db.get(
      'SELECT COUNT(*) as count FROM conversation_history WHERE user_id = ?',
      [userId]
    );
    if (stats && stats.count > 0) {
      const sessions = Math.ceil(stats.count / 2); // each exchange = user + assistant
      parts.push(`已进行约${sessions}轮对话`);
    }
  } catch {}

  const result = parts.length > 0 ? parts.join('\n') : null;

  // Update cache
  contextCache.set(userId, { context: result, timestamp: Date.now() });
  // Prevent memory leak: clear cache if too large
  if (contextCache.size > 100) {
    const oldest = [...contextCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (let i = 0; i < 20; i++) contextCache.delete(oldest[i][0]);
  }

  return result;
}
