/**
 * Auth Middleware — JWT verification for API routes.
 *
 * Supports two modes:
 * - Production: Bearer token in Authorization header
 * - Dev fallback: user_id in query param or X-User-Id header (when ENABLE_DEV_AUTH=1)
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// JWT_SECRET: require from env, auto-generate if missing (dev only)
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('[WARN] JWT_SECRET not set. Using auto-generated secret. Set JWT_SECRET in .env for production.');
}
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES || '30m';
const REFRESH_EXPIRES = '7d';
const DEV_AUTH = process.env.ENABLE_DEV_AUTH === '1';

/**
 * Generate access + refresh token pair.
 */
export function generateTokens(userId, nickname) {
  const access = jwt.sign({ userId, nickname }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  const refresh = jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_EXPIRES });
  return { access, refresh };
}

/**
 * Verify an access token. Returns decoded payload or null.
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * Express middleware — require valid JWT (or dev fallback).
 * Sets req.userId on success.
 */
export function requireAuth(req, res, next) {
  // Production path: Bearer token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (decoded && decoded.userId) {
      req.userId = decoded.userId;
      req.userNickname = decoded.nickname;
      return next();
    }
    return res.status(401).json({ error: 'Token 无效或已过期，请重新登录' });
  }

  // Dev fallback: user_id from query/header
  if (DEV_AUTH) {
    const userId = parseInt(req.query.user_id || req.headers['x-user-id'] || '1', 10);
    if (!isNaN(userId) && userId >= 1) {
      req.userId = userId;
      return next();
    }
  }

  return res.status(401).json({ error: '请先登录' });
}

export default { requireAuth, generateTokens, verifyToken };
