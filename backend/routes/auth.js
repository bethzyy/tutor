/**
 * Auth Routes — Registration, login, token refresh.
 *
 * Simplified for MVP: nickname-based login (no phone/SMS for now).
 * Password is optional — if omitted, a dev-mode account is created.
 */

import { Router } from 'express';
import crypto from 'crypto';
import db from '../db.js';
import { generateTokens, verifyToken } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/auth/register
 * Body: { nickname: string, password?: string }
 */
router.post('/register', (req, res) => {
  const { nickname, password } = req.body;

  if (!nickname || typeof nickname !== 'string' || nickname.trim().length < 1 || nickname.trim().length > 20) {
    return res.status(400).json({ error: '请输入有效的昵称（1-20字）' });
  }

  const name = nickname.trim();

  // Check if nickname already taken
  const existing = db.get('SELECT id FROM users WHERE name = ?', [name]);
  if (existing) {
    return res.status(409).json({ error: '该昵称已被使用，请换一个' });
  }

  // Hash password if provided, otherwise generate a random token for dev
  const passwordHash = password
    ? crypto.createHash('sha256').update(password + (process.env.JWT_SECRET || 'salt')).digest('hex')
    : null;

  // Create user
  db.run(
    'INSERT INTO users (mode, name) VALUES (?, ?)',
    ['integrated', name]
  );

  const userRow = db.get('SELECT last_insert_rowid() as id');
  const userId = userRow.id;

  // Create learning state
  db.run('INSERT INTO learning_state (user_id) VALUES (?)', [userId]);

  // Store password if provided
  if (passwordHash) {
    const existingTraits = db.get('SELECT traits FROM users WHERE id = ?', [userId]);
    const traits = JSON.parse(existingTraits?.traits || '{}');
    traits.password_hash = passwordHash;
    db.run('UPDATE users SET traits = ? WHERE id = ?', [JSON.stringify(traits), userId]);
  }

  const tokens = generateTokens(userId, name);

  res.status(201).json({
    user: { id: userId, name },
    ...tokens,
  });
});

/**
 * POST /api/auth/login
 * Body: { nickname: string, password?: string }
 */
router.post('/login', (req, res) => {
  const { nickname, password } = req.body;

  if (!nickname) {
    return res.status(400).json({ error: '请输入昵称' });
  }

  const user = db.get('SELECT id, name, traits FROM users WHERE name = ?', [nickname.trim()]);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  // Check password if user has one set
  const traits = JSON.parse(user.traits || '{}');
  if (traits.password_hash) {
    if (!password) {
      return res.status(401).json({ error: '请输入密码' });
    }
    const hash = crypto.createHash('sha256').update(password + (process.env.JWT_SECRET || 'salt')).digest('hex');
    if (hash !== traits.password_hash) {
      return res.status(401).json({ error: '密码错误' });
    }
  }

  const tokens = generateTokens(user.id, user.name);

  res.json({
    user: { id: user.id, name: user.name },
    ...tokens,
  });
});

/**
 * POST /api/auth/refresh
 * Body: { refresh_token: string }
 */
router.post('/refresh', (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) {
    return res.status(400).json({ error: '缺少 refresh_token' });
  }

  const decoded = verifyToken(refresh_token);
  if (!decoded || decoded.type !== 'refresh') {
    return res.status(401).json({ error: 'Refresh token 无效' });
  }

  const user = db.get('SELECT id, name FROM users WHERE id = ?', [decoded.userId]);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  const tokens = generateTokens(user.id, user.name);
  res.json(tokens);
});

/**
 * POST /api/auth/guest
 * Quick guest login — creates a temporary user for demo.
 */
router.post('/guest', (req, res) => {
  const guestName = '访客' + Math.floor(Math.random() * 9000 + 1000);

  db.run('INSERT INTO users (mode, name) VALUES (?, ?)', ['integrated', guestName]);
  const userRow = db.get('SELECT last_insert_rowid() as id');
  const userId = userRow.id;

  db.run('INSERT INTO learning_state (user_id) VALUES (?)', [userId]);

  const tokens = generateTokens(userId, guestName);

  res.status(201).json({
    user: { id: userId, name: guestName },
    ...tokens,
  });
});

export default router;
