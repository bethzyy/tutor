/**
 * Tests for ruleScanner — pattern detection accuracy.
 */

import { describe, it, expect } from 'vitest';
import { scanMessage } from '../services/ruleScanner.js';

describe('ruleScanner', () => {
  it('detects absolutist language', () => {
    const hits = scanMessage('我总是做不好任何事情');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some(h => h.name === 'absolutist_language')).toBe(true);
  });

  it('detects self-negation', () => {
    const hits = scanMessage('我太差了，我做不到');
    expect(hits.some(h => h.name === 'self_negation')).toBe(true);
  });

  it('detects all-or-nothing thinking', () => {
    const hits = scanMessage('要么成功要么彻底失败');
    expect(hits.some(h => h.name === 'all_or_nothing')).toBe(true);
  });

  it('detects should statement', () => {
    const hits = scanMessage('我应该做得更好');
    expect(hits.some(h => h.name === 'should_statement')).toBe(true);
  });

  it('detects helplessness', () => {
    const hits = scanMessage('真的没办法了，什么都改变不了');
    expect(hits.some(h => h.name === 'helplessness')).toBe(true);
  });

  it('detects high-intensity negative emotion', () => {
    const hits = scanMessage('我快崩溃了，太痛苦了');
    expect(hits.some(h => h.name === 'negative_intensity')).toBe(true);
  });

  it('detects labeling', () => {
    const hits = scanMessage('我是个废物');
    expect(hits.some(h => h.name === 'labeling')).toBe(true);
  });

  it('returns empty array for positive text', () => {
    const hits = scanMessage('今天天气不错，我学到了新东西');
    expect(hits.length).toBe(0);
  });

  it('returns empty array for null/undefined', () => {
    expect(scanMessage(null)).toEqual([]);
    expect(scanMessage(undefined)).toEqual([]);
    expect(scanMessage(123)).toEqual([]);
  });

  it('detects multiple patterns in one message', () => {
    const hits = scanMessage('我总是失败，我应该放弃，我做不到');
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  it('includes confidence and snippet in results', () => {
    const hits = scanMessage('我总是拖延');
    const hit = hits[0];
    expect(hit.confidence).toBeGreaterThan(0);
    expect(hit.snippet).toBeDefined();
    expect(hit.description).toBeDefined();
  });
});
