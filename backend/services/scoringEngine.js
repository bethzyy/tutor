/**
 * Scoring Engine — Pure functions for psychometric scoring.
 *
 * No AI dependency. All functions are deterministic given the same inputs.
 * Handles: reverse scoring, scale aggregation, norm lookup, percentile,
 * confidence intervals, level interpretation.
 */

// ============================================================
// Core Scoring Functions
// ============================================================

/**
 * Reverse score an item.
 * e.g., on a 5-point scale: raw=1 → actual=5, raw=5 → actual=1
 */
export function reverseScore(rawScore, maxScore) {
  return maxScore - rawScore + 1;
}

/**
 * Compute scale-level scores from individual responses.
 * @param {Array} responses - [{item_id, raw_score, max_score}]
 * @param {Object} scaleDef - Scale definition with items array
 * @returns {{ sum, avg, scores, count, maxPerItem }}
 */
export function computeScaleScore(responses, scaleDef) {
  const itemMap = new Map(scaleDef.items.map(i => [i.id, i]));
  const maxPerItem = scaleDef.options.length;

  const scores = responses.map(r => {
    const item = itemMap.get(r.item_id);
    if (!item) return r.raw_score; // fallback for unknown items
    return item.reverse_scored
      ? reverseScore(r.raw_score, r.max_score || maxPerItem)
      : r.raw_score;
  });

  const sum = scores.reduce((a, b) => a + b, 0);
  const avg = scores.length > 0 ? sum / scores.length : 0;

  return { sum, avg, scores, count: scores.length, maxPerItem };
}

// ============================================================
// Statistical Functions
// ============================================================

/**
 * Approximate normal CDF using Abramowitz & Stegun formula 26.2.17.
 * Maximum error: 7.5e-8 — more than sufficient for percentiles.
 */
export function normalCDF(z) {
  if (z < -8) return 0;
  if (z > 8) return 1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = z < 0 ? -1 : 1;
  const absZ = Math.abs(z);
  const t = 1.0 / (1.0 + p * absZ);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absZ * absZ / 2);
  return 0.5 * (1.0 + sign * y);
}

/**
 * Compute percentile rank based on norm data.
 * @param {number} avg - User's average score
 * @param {{ mean: number, sd: number }} norm - Normative data
 * @returns {number|null} Percentile (0-100)
 */
export function computePercentile(avg, norm) {
  if (!norm || !norm.mean || !norm.sd || norm.sd === 0) return null;
  const z = (avg - norm.mean) / norm.sd;
  return Math.round(normalCDF(z) * 100);
}

/**
 * Compute 95% confidence interval for a set of scores.
 * @param {number[]} scores - Individual item scores
 * @returns {{ lower: number, upper: number, mean: number }}
 */
export function confidenceInterval(scores) {
  const n = scores.length;
  if (n < 2) return { lower: scores[0] || 0, upper: scores[0] || 0, mean: scores[0] || 0 };
  const mean = scores.reduce((a, b) => a + b, 0) / n;
  const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / (n - 1);
  const se = Math.sqrt(variance / n);
  return {
    lower: Math.round((mean - 1.96 * se) * 100) / 100,
    upper: Math.round((mean + 1.96 * se) * 100) / 100,
    mean: Math.round(mean * 100) / 100,
  };
}

// ============================================================
// Interpretation Functions
// ============================================================

/**
 * Determine the level/label for a score based on interpretation ranges.
 * @param {number} avg - Average score
 * @param {Array} interpretation - [{range: [low, high], level, label, color}]
 * @returns {{ level, label, color, description }}
 */
export function interpretLevel(avg, interpretation) {
  for (const interp of interpretation) {
    if (avg >= interp.range[0] && avg < interp.range[1]) {
      return {
        level: interp.level,
        label: interp.label,
        color: interp.color,
        description: interp.description || '',
      };
    }
  }
  // Handle edge case: avg equals max range
  const last = interpretation[interpretation.length - 1];
  if (last && avg >= last.range[0]) {
    return {
      level: last.level,
      label: last.label,
      color: last.color,
      description: last.description || '',
    };
  }
  return { level: 'unknown', label: '未知', color: '#999', description: '' };
}

/**
 * Generate a full score report for all scales in a battery.
 * @param {Array} responses - All user responses [{item_id, scale_id, raw_score, max_score}]
 * @param {Object} scalesMap - {scale_id: scaleDef}
 * @param {string} normGroup - 'general' or 'college'
 * @returns {{ scale_scores, weaknesses, strengths }}
 */
export function generateScoreReport(responses, scalesMap, normGroup = 'general') {
  const scaleScores = {};
  const weaknesses = [];
  const strengths = [];

  // Group responses by scale
  const byScale = {};
  for (const r of responses) {
    if (!byScale[r.scale_id]) byScale[r.scale_id] = [];
    byScale[r.scale_id].push(r);
  }

  for (const [scaleId, scaleDef] of Object.entries(scalesMap)) {
    const scaleResponses = byScale[scaleId] || [];
    if (scaleResponses.length === 0) continue;

    const computed = computeScaleScore(scaleResponses, scaleDef);
    const norm = scaleDef.norms?.[normGroup] || scaleDef.norms?.general;
    const pct = computePercentile(computed.avg, norm);
    const ci = confidenceInterval(computed.scores);
    const interp = interpretLevel(computed.avg, scaleDef.interpretation);

    scaleScores[scaleId] = {
      name: scaleDef.name,
      dimension: scaleDef.dimension,
      sum: computed.sum,
      avg: Math.round(computed.avg * 100) / 100,
      count: computed.count,
      max_per_item: computed.maxPerItem,
      percentile: pct,
      confidence_interval: ci,
      level: interp.level,
      label: interp.label,
      color: interp.color,
      description: interp.description,
    };

    // Determine weakness or strength based on dimension semantics
    const isInverse = scaleDef.dimension === 'stress' || scaleDef.dimension === 'procrastination';
    const isProblematic = isInverse
      ? (interp.level === 'high' || interp.level === 'critical')
      : (interp.level === 'low');

    if (isProblematic) {
      weaknesses.push({
        type: 'personality',
        name: scaleDef.name,
        dimension: scaleDef.dimension,
        severity: interp.level === 'critical' ? 'high' : interp.level === 'low' || interp.level === 'high' ? 'high' : 'medium',
        level: interp.level,
        label: interp.label,
        description: interp.description,
        avg_score: computed.avg,
        max_score: computed.maxPerItem,
        percentile: pct,
      });
    } else if ((!isInverse && interp.level === 'high') || (isInverse && interp.level === 'low')) {
      strengths.push({
        name: scaleDef.name,
        dimension: scaleDef.dimension,
        label: interp.label,
        avg_score: computed.avg,
        max_score: computed.maxPerItem,
        percentile: pct,
      });
    }
  }

  return { scale_scores: scaleScores, weaknesses, strengths };
}

/**
 * Compute sub-dimension breakdown for a scale.
 * Useful for detailed feedback.
 */
export function computeSubDimensions(responses, scaleDef) {
  const itemMap = new Map(scaleDef.items.map(i => [i.id, i]));
  const bySub = {};

  for (const r of responses) {
    const item = itemMap.get(r.item_id);
    if (!item) continue;
    const sub = item.sub_dimension || '其他';
    if (!bySub[sub]) bySub[sub] = [];
    const actual = item.reverse_scored
      ? reverseScore(r.raw_score, r.max_score || scaleDef.options.length)
      : r.raw_score;
    bySub[sub].push(actual);
  }

  const result = {};
  for (const [sub, scores] of Object.entries(bySub)) {
    result[sub] = {
      avg: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100,
      count: scores.length,
    };
  }
  return result;
}

export default {
  reverseScore,
  computeScaleScore,
  normalCDF,
  computePercentile,
  confidenceInterval,
  interpretLevel,
  generateScoreReport,
  computeSubDimensions,
};
