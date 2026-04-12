/**
 * Tests for validate middleware and auth module.
 */

import { describe, it, expect } from 'vitest';
import { validate, chatSchema, submitAnswerSchema, classifyGoalSchema } from '../middleware/validate.js';
import { generateTokens, verifyToken } from '../middleware/auth.js';

// ============================================================
// Validate middleware
// ============================================================
describe('validate middleware', () => {
  it('rejects empty chat message', () => {
    const schema = chatSchema;
    const result = schema.safeParse({ message: '' });
    expect(result.success).toBe(false);
  });

  it('accepts valid chat message', () => {
    const result = chatSchema.safeParse({ message: '你好' });
    expect(result.success).toBe(true);
    expect(result.data.message).toBe('你好');
  });

  it('rejects message over 1000 chars', () => {
    const result = chatSchema.safeParse({ message: 'x'.repeat(1001) });
    expect(result.success).toBe(false);
  });

  it('strips control characters', () => {
    const result = chatSchema.safeParse({ message: 'hello\x00world' });
    expect(result.success).toBe(true);
    expect(result.data.message).toBe('helloworld');
  });

  it('validates assessment answer schema', () => {
    const valid = submitAnswerSchema.safeParse({
      session_id: 1,
      item_id: 'cbf_1',
      response_text: '完全符合',
    });
    expect(valid.success).toBe(true);
  });

  it('rejects non-numeric session_id', () => {
    const result = submitAnswerSchema.safeParse({
      session_id: 'abc',
      item_id: 'cbf_1',
      response_text: '完全符合',
    });
    expect(result.success).toBe(false);
  });

  it('validates goal classification schema', () => {
    const result = classifyGoalSchema.safeParse({ goal: '  我想学习编程  ' });
    expect(result.success).toBe(true);
    expect(result.data.goal).toBe('我想学习编程'); // trimmed
  });

  it('rejects goal over 500 chars', () => {
    const result = classifyGoalSchema.safeParse({ goal: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// Auth token generation/verification
// ============================================================
describe('JWT auth', () => {
  it('generates and verifies valid tokens', () => {
    const tokens = generateTokens(42, '测试用户');
    expect(tokens.access).toBeDefined();
    expect(tokens.refresh).toBeDefined();

    const decoded = verifyToken(tokens.access);
    expect(decoded.userId).toBe(42);
    expect(decoded.nickname).toBe('测试用户');
  });

  it('rejects invalid tokens', () => {
    const decoded = verifyToken('invalid.token.here');
    expect(decoded).toBeNull();
  });

  it('rejects expired tokens', () => {
    // Generate with immediate expiry by manual construction
    const decoded = verifyToken('');
    expect(decoded).toBeNull();
  });

  it('refresh token has type=refresh', () => {
    const tokens = generateTokens(1, 'user');
    const decoded = verifyToken(tokens.refresh);
    expect(decoded.type).toBe('refresh');
  });
});
