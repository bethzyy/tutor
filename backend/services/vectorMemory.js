/**
 * Vector Memory Service — L3 Semantic Memory for AI conversations.
 *
 * Uses ZhipuAI embedding-3 model to generate embeddings for user messages,
 * stores them in SQLite, and retrieves semantically relevant past conversations.
 *
 * Architecture:
 * - Embeddings stored as JSON float arrays in conversation_history.embedding column
 * - Cosine similarity computed in JS (sufficient for current scale)
 * - Top-K relevant messages injected into AI prompts
 */

import db from '../db.js';

// Embeddings use OpenAI-compatible endpoint (Anthropic has no embedding API)
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const embedClient = new OpenAI({
  apiKey: process.env.ZHIPU_API_KEY || process.env.OPENAI_API_KEY || '',
  baseURL: 'https://open.bigmodel.cn/api/paas/v4',
});

const EMBEDDING_MODEL = 'embedding-3';
const EMBEDDING_DIM = 2048; // embedding-3 output dimension
const MAX_RELEVANT = 5;     // top-K messages to retrieve
const SIMILARITY_THRESHOLD = 0.5;

// Ensure embedding column exists
try {
  db.run(`ALTER TABLE conversation_history ADD COLUMN embedding TEXT`);
} catch (_) {} // Column already exists

/**
 * Generate embedding for a text string.
 * Returns float array or null on failure.
 */
async function getEmbedding(text) {
  if (!text || text.trim().length === 0) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await embedClient.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 500),
    }, { signal: controller.signal });
    clearTimeout(timeout);
    return response.data[0]?.embedding || null;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('Embedding generation timed out');
    } else {
      console.warn('Embedding generation failed:', err.message);
    }
    return null;
  }
}

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Store embedding for a conversation message.
 * Called after saving a user message to conversation_history.
 */
export async function storeEmbedding(messageId, text) {
  const embedding = await getEmbedding(text);
  if (!embedding) return;
  db.run(
    'UPDATE conversation_history SET embedding = ? WHERE id = ?',
    [JSON.stringify(embedding), messageId]
  );
}

/**
 * Retrieve semantically relevant past conversations for a user's current message.
 * Returns array of { role, content, similarity } sorted by relevance.
 */
export async function retrieveRelevantContext(userId, currentMessage, limit = MAX_RELEVANT) {
  const queryEmbedding = await getEmbedding(currentMessage);
  if (!queryEmbedding) return [];

  // Load all user's messages that have embeddings (excluding the most recent which is the current one)
  const rows = db.all(
    `SELECT id, role, content, embedding FROM conversation_history
     WHERE user_id = ? AND embedding IS NOT NULL
     ORDER BY id DESC LIMIT 200`,
    [userId]
  );

  if (rows.length === 0) return [];

  // Compute similarities
  const scored = [];
  for (const row of rows) {
    try {
      const embedding = JSON.parse(row.embedding);
      const sim = cosineSimilarity(queryEmbedding, embedding);
      if (sim >= SIMILARITY_THRESHOLD) {
        scored.push({
          role: row.role,
          content: row.content,
          similarity: sim,
        });
      }
    } catch {}
  }

  // Sort by similarity descending, take top-K
  scored.sort((a, b) => b.similarity - a.similarity);

  // Deduplicate: keep only the most relevant entry from nearby conversation turns
  const seen = new Set();
  const result = [];
  for (const item of scored) {
    const key = item.content.slice(0, 50);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }

  return result;
}

/**
 * Build a "relevant memories" string for AI prompt injection.
 */
export async function buildRelevantMemories(userId, currentMessage) {
  const relevant = await retrieveRelevantContext(userId, currentMessage);
  if (relevant.length === 0) return null;

  const lines = relevant.map(r =>
    `[${r.role === 'user' ? '用户' : 'AI'}] ${r.content.slice(0, 150)}${r.content.length > 150 ? '...' : ''}`
  );

  return `以下是与当前话题相关的历史对话片段：\n${lines.join('\n')}`;
}
