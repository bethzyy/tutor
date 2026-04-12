/**
 * Unit tests for scoringEngine — pure functions, no dependencies.
 * This is the most critical module: incorrect scoring = wrong psychological assessment.
 */

import { describe, it, expect } from 'vitest';
import {
  reverseScore,
  computeScaleScore,
  normalCDF,
  computePercentile,
  confidenceInterval,
  interpretLevel,
  generateScoreReport,
  computeSubDimensions,
} from '../services/scoringEngine.js';
import { CBF_PI_B, GSES, DASS21_STRESS } from '../scales/scaleDefinitions.js';

// ============================================================
// reverseScore
// ============================================================
describe('reverseScore', () => {
  it('reverses on 5-point scale: 1→5, 5→1', () => {
    expect(reverseScore(1, 5)).toBe(5);
    expect(reverseScore(5, 5)).toBe(1);
    expect(reverseScore(3, 5)).toBe(3);
  });

  it('reverses on 4-point scale: 1→4, 4→1', () => {
    expect(reverseScore(1, 4)).toBe(4);
    expect(reverseScore(2, 4)).toBe(3);
  });

  it('reverses on 7-point scale', () => {
    expect(reverseScore(1, 7)).toBe(7);
    expect(reverseScore(7, 7)).toBe(1);
  });
});

// ============================================================
// computeScaleScore
// ============================================================
describe('computeScaleScore', () => {
  it('computes correct sum and avg for CBF-PI-B (no reverse)', () => {
    const responses = [
      { item_id: 'cbf_1', raw_score: 4, max_score: 5 }, // "完全符合"=4, not reverse
      { item_id: 'cbf_3', raw_score: 3, max_score: 5 },
    ];
    const result = computeScaleScore(responses, CBF_PI_B);
    expect(result.sum).toBe(7);
    expect(result.avg).toBeCloseTo(3.5);
    expect(result.count).toBe(2);
    expect(result.maxPerItem).toBe(5);
  });

  it('applies reverse scoring correctly for reverse_scored items', () => {
    // cbf_2 is reverse_scored: raw=1 → actual=5 on 5-point scale
    const responses = [
      { item_id: 'cbf_2', raw_score: 1, max_score: 5 },
    ];
    const result = computeScaleScore(responses, CBF_PI_B);
    expect(result.sum).toBe(5);
    expect(result.avg).toBe(5);
  });

  it('returns 0 for empty responses', () => {
    const result = computeScaleScore([], CBF_PI_B);
    expect(result.sum).toBe(0);
    expect(result.avg).toBe(0);
    expect(result.count).toBe(0);
  });
});

// ============================================================
// normalCDF + computePercentile
// ============================================================
describe('normalCDF', () => {
  it('returns 0.5 for z=0', () => {
    expect(normalCDF(0)).toBeCloseTo(0.5, 6);
  });

  it('returns ~0.87 for z=1 (Abramowitz-Stegun approx)', () => {
    expect(normalCDF(1)).toBeCloseTo(0.8703, 3);
  });

  it('returns ~0.13 for z=-1 (Abramowitz-Stegun approx)', () => {
    expect(normalCDF(-1)).toBeCloseTo(0.1297, 3);
  });

  it('clamps extreme values', () => {
    expect(normalCDF(-10)).toBe(0);
    expect(normalCDF(10)).toBe(1);
  });
});

describe('computePercentile', () => {
  it('computes P50 for score equal to mean', () => {
    const pct = computePercentile(3.42, { mean: 3.42, sd: 0.68 });
    expect(pct).toBeCloseTo(50, 0);
  });

  it('returns null for missing norm data', () => {
    expect(computePercentile(3.0, null)).toBeNull();
    expect(computePercentile(3.0, { mean: 3, sd: 0 })).toBeNull();
  });

  it('computes high percentile for high score', () => {
    // mean=3.42, sd=0.68, score=5.0 → z≈2.32 → P~99
    const pct = computePercentile(5.0, { mean: 3.42, sd: 0.68 });
    expect(pct).toBeGreaterThan(95);
  });
});

// ============================================================
// confidenceInterval
// ============================================================
describe('confidenceInterval', () => {
  it('returns correct CI for [3, 4, 5]', () => {
    const ci = confidenceInterval([3, 4, 5]);
    expect(ci.mean).toBeCloseTo(4, 5);
    expect(ci.lower).toBeLessThan(ci.mean);
    expect(ci.upper).toBeGreaterThan(ci.mean);
  });

  it('handles single value', () => {
    const ci = confidenceInterval([3]);
    expect(ci.lower).toBe(3);
    expect(ci.upper).toBe(3);
  });
});

// ============================================================
// interpretLevel
// ============================================================
describe('interpretLevel', () => {
  it('interprets CBF-PI-B low range correctly', () => {
    const result = interpretLevel(2.0, CBF_PI_B.interpretation);
    expect(result.level).toBe('low');
    expect(result.label).toBe('偏低');
  });

  it('interprets CBF-PI-B medium range', () => {
    const result = interpretLevel(3.5, CBF_PI_B.interpretation);
    expect(result.level).toBe('medium');
  });

  it('interprets CBF-PI-B high range', () => {
    const result = interpretLevel(4.2, CBF_PI_B.interpretation);
    expect(result.level).toBe('high');
    expect(result.label).toBe('良好');
  });

  it('handles edge case at max', () => {
    const result = interpretLevel(5.0, CBF_PI_B.interpretation);
    expect(result.level).toBe('high');
  });

  it('returns unknown for out-of-range', () => {
    const result = interpretLevel(0.1, []);
    expect(result.level).toBe('unknown');
  });
});

// ============================================================
// generateScoreReport — integration test of scoring pipeline
// ============================================================
describe('generateScoreReport', () => {
  it('generates report with correct structure for CBF-PI-B', () => {
    // Simulate user answering all "比较符合" (index 3, score 4) for non-reverse items
    // and "比较不符合" (index 1, score 2) for reverse items
    const responses = CBF_PI_B.items.map(item => ({
      item_id: item.id,
      scale_id: 'cbf_pi_b',
      raw_score: item.reverse_scored ? 2 : 4,
      max_score: 5,
    }));

    const report = generateScoreReport(responses, { cbf_pi_b: CBF_PI_B }, 'general');

    expect(report.scale_scores.cbf_pi_b).toBeDefined();
    expect(report.scale_scores.cbf_pi_b.avg).toBeGreaterThan(0);
    expect(report.scale_scores.cbf_pi_b.max_per_item).toBe(5);
    expect(report.scale_scores.cbf_pi_b.percentile).toBeGreaterThan(0);
    expect(report.scale_scores.cbf_pi_b.confidence_interval).toBeDefined();
  });

  it('identifies weaknesses for low scores', () => {
    // All answers give lowest actual score: raw=1 for normal items, raw=5 for reverse items
    // (reverse scoring: raw=5 → actual=1)
    const responses = CBF_PI_B.items.map(item => ({
      item_id: item.id,
      scale_id: 'cbf_pi_b',
      raw_score: item.reverse_scored ? 5 : 1,
      max_score: 5,
    }));

    const report = generateScoreReport(responses, { cbf_pi_b: CBF_PI_B }, 'general');
    expect(report.weaknesses.length).toBeGreaterThan(0);
    expect(report.weaknesses[0].name).toContain('尽责性');
  });

  it('identifies strengths for high scores', () => {
    // All answers give highest actual score: raw=5 for normal items, raw=1 for reverse items
    // (reverse scoring: raw=1 → actual=5)
    const responses = CBF_PI_B.items.map(item => ({
      item_id: item.id,
      scale_id: 'cbf_pi_b',
      raw_score: item.reverse_scored ? 1 : 5,
      max_score: 5,
    }));

    const report = generateScoreReport(responses, { cbf_pi_b: CBF_PI_B }, 'general');
    expect(report.strengths.length).toBeGreaterThan(0);
  });

  it('handles inverse dimensions (stress: high = bad)', () => {
    const responses = DASS21_STRESS.items.map(item => ({
      item_id: item.id,
      scale_id: 'dass21_stress',
      raw_score: 4,
      max_score: 4,
    }));

    const report = generateScoreReport(responses, { dass21_stress: DASS21_STRESS }, 'general');
    // High stress = weakness
    expect(report.weaknesses.length).toBeGreaterThan(0);
    expect(report.weaknesses[0].dimension).toBe('stress');
  });
});

// ============================================================
// computeSubDimensions
// ============================================================
describe('computeSubDimensions', () => {
  it('breaks down scores by sub_dimension', () => {
    const responses = [
      { item_id: 'cbf_1', raw_score: 5, max_score: 5 },
      { item_id: 'cbf_2', raw_score: 5, max_score: 5 }, // reverse, actual=1
      { item_id: 'cbf_3', raw_score: 4, max_score: 5 },
    ];
    const result = computeSubDimensions(responses, CBF_PI_B);
    expect(result['自律性']).toBeDefined();
    expect(result['自律性'].avg).toBe(5); // cbf_1 raw=5, not reverse
    expect(result['坚持性'].avg).toBe(1); // cbf_2 raw=5, reverse → 1
  });
});
