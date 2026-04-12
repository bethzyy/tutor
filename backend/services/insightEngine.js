/**
 * Insight Engine — Core orchestrator for pattern detection and mirror moments.
 * Hybrid approach: real-time rule scan + periodic AI batch analysis.
 */

import db from '../db.js';
import ai from '../ai.js';
import { scanMessage } from './ruleScanner.js';
import { batchAnalysisPrompt, mirrorMomentPrompt } from './insightPrompts.js';

const BATCH_INTERVAL = 10;
const RULE_THRESHOLD = 2;
const MIRROR_THRESHOLD = 3;
const MAX_AI_INSIGHTS = 5;

/**
 * Process a user message — called after every user message save.
 * Fire-and-forget: never blocks the chat response.
 */
export async function processMessage(userId, messageId, content) {
  // Step 1: Rule-based scan (synchronous, zero cost)
  const hits = scanMessage(content);

  for (const hit of hits) {
    // Log to message_patterns
    db.run(
      `INSERT INTO message_patterns (message_id, pattern_type, pattern_name, snippet, confidence, detected_by)
       VALUES (?, ?, ?, ?, ?, 'rule')`,
      [messageId, hit.type, hit.name, hit.snippet, hit.confidence]
    );

    // Check if insight already exists for this pattern
    const existing = db.get(
      `SELECT id, occurrence_count, evidence FROM insights
       WHERE user_id = ? AND pattern_name = ? AND status != 'dismissed'`,
      [userId, hit.name]
    );

    if (existing) {
      const evidence = JSON.parse(existing.evidence || '[]');
      evidence.push({ message_id: messageId, quote: hit.snippet });
      db.run(
        `UPDATE insights SET occurrence_count = occurrence_count + 1,
         evidence = ?, last_seen_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`,
        [JSON.stringify(evidence), existing.id]
      );
    } else {
      // Count total rule hits for this pattern from this user
      const hitCount = db.get(
        `SELECT COUNT(*) as c FROM message_patterns mp
         JOIN conversation_history ch ON mp.message_id = ch.id
         WHERE ch.user_id = ? AND mp.pattern_name = ?`,
        [userId, hit.name]
      );

      if (hitCount.c >= RULE_THRESHOLD) {
        const snippets = db.all(
          `SELECT snippet FROM message_patterns mp
           JOIN conversation_history ch ON mp.message_id = ch.id
           WHERE ch.user_id = ? AND mp.pattern_name = ?`,
          [userId, hit.name]
        );
        const evidence = snippets.map(s => ({ quote: s.snippet }));

        db.run(
          `INSERT INTO insights (user_id, pattern_type, pattern_name, summary, evidence, confidence, occurrence_count, source, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'rule', 'new')`,
          [userId, hit.type, hit.name, hit.description, JSON.stringify(evidence), hit.confidence, hitCount.c]
        );
      }
    }
  }

  // Step 2: Check if batch AI analysis is due
  const userMsgCount = db.get(
    `SELECT COUNT(*) as c FROM conversation_history WHERE user_id = ? AND role = 'user'`,
    [userId]
  );

  if (userMsgCount.c > 0 && userMsgCount.c % BATCH_INTERVAL === 0) {
    runBatchAnalysis(userId).catch(err => {
      console.error('[InsightEngine] Batch analysis failed:', err.message);
    });
  }
}

async function runBatchAnalysis(userId) {
  const messages = db.all(
    `SELECT id, role, content FROM conversation_history
     WHERE user_id = ? ORDER BY id DESC LIMIT 20`,
    [userId]
  ).reverse();

  if (messages.length < 5) return;

  const existingInsights = db.all(
    `SELECT pattern_name, summary, occurrence_count FROM insights
     WHERE user_id = ? AND status != 'dismissed'`,
    [userId]
  );

  const prompts = batchAnalysisPrompt(messages, existingInsights);

  try {
    const result = await ai.callAIJson(prompts.system, prompts.user, {
      temperature: 0.3,
      maxTokens: 1000,
    });

    const patterns = (result.patterns || []).filter(p => p.confidence >= 0.5);
    const limited = patterns.slice(0, MAX_AI_INSIGHTS);

    for (const pattern of limited) {
      const evidence = (pattern.evidence_indices || [])
        .map(idx => messages[idx - 1])
        .filter(Boolean)
        .map(m => ({ message_id: m.id, quote: m.content.substring(0, 100) }));

      const existing = db.get(
        `SELECT id, occurrence_count FROM insights
         WHERE user_id = ? AND pattern_name = ? AND status != 'dismissed'`,
        [userId, pattern.name]
      );

      if (existing) {
        db.run(
          `UPDATE insights SET confidence = ?, summary = ?, evidence = ?,
           occurrence_count = occurrence_count + 1,
           last_seen_at = datetime('now'), updated_at = datetime('now')
           WHERE id = ?`,
          [pattern.confidence, pattern.summary, JSON.stringify(evidence), existing.id]
        );
      } else {
        db.run(
          `INSERT INTO insights (user_id, pattern_type, pattern_name, summary, evidence, confidence, occurrence_count, source, status)
           VALUES (?, ?, ?, ?, ?, ?, 1, 'ai_batch', 'new')`,
          [userId, pattern.type, pattern.name, pattern.summary, JSON.stringify(evidence), pattern.confidence]
        );
      }
    }
  } catch (err) {
    console.error('[InsightEngine] AI batch error:', err.message);
  }
}

export function checkMirrorMoment(userId) {
  return db.all(
    `SELECT * FROM insights
     WHERE user_id = ? AND status = 'new' AND occurrence_count >= ?`,
    [userId, MIRROR_THRESHOLD]
  );
}

export async function generateMirrorText(insight, userName) {
  const prompts = mirrorMomentPrompt(insight, userName);
  return ai.callAI(prompts.system, prompts.user, {
    temperature: 0.7,
    maxTokens: 300,
  });
}

export function markSurfaced(insightId) {
  db.run(
    `UPDATE insights SET status = 'surfaced', surfaced_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`,
    [insightId]
  );
}

export function recordReaction(insightId, userId, action, reflectionText = null) {
  const status = action === 'confirmed' ? 'confirmed'
    : action === 'dismissed' ? 'dismissed'
    : 'surfaced';

  db.run(
    `UPDATE insights SET user_reaction = ?, user_reflection = ?, status = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [action, reflectionText, status, insightId]
  );

  db.run(
    `INSERT INTO insight_interactions (user_id, insight_id, action, reflection_text)
     VALUES (?, ?, ?, ?)`,
    [userId, insightId, action, reflectionText]
  );
}

export default { processMessage, checkMirrorMoment, generateMirrorText, markSurfaced, recordReaction };
