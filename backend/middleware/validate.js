/**
 * Input Validation Middleware — Zod schemas for all API endpoints.
 */

import { z } from 'zod';

const MAX_INPUT = 2000;

// Sanitize: strip control characters
function sanitize() {
  return z.string().transform(s => s.replace(/[\x00\x08\x0B\x0C\x0E-\x1F]/g, ''));
}

// Shared base: trimmed string, optionally bounded
function text(maxLen = MAX_INPUT) {
  return z.string().trim().max(maxLen, `输入内容过长（最多${maxLen}字）`).pipe(sanitize());
}

function boundedText(maxLen = MAX_INPUT) {
  return z.string().trim().min(1).max(maxLen, `输入内容过长（最多${maxLen}字）`).pipe(sanitize());
}

// ===== Auth Schemas =====
export const registerSchema = z.object({
  nickname: z.string().trim().min(1, '请输入昵称').max(20, '昵称最多20字'),
  password: z.string().trim().max(100).optional(),
});

export const loginSchema = z.object({
  nickname: z.string().trim().min(1, '请输入昵称'),
  password: z.string().trim().max(100).optional(),
});

export const refreshSchema = z.object({
  refresh_token: z.string().trim().min(1, '缺少 refresh_token'),
});

// ===== State Schemas =====
export const setModeSchema = z.object({
  mode: z.enum(['subject', 'skill', 'character', 'integrated', 'consultation']),
});

export const classifyGoalSchema = z.object({
  goal: boundedText(500),
});

// ===== Assessment Schemas =====
export const startAssessmentSchema = z.object({
  mode: z.enum(['character', 'integrated', 'skill']),
  domain: text(200).optional(),
});

export const submitAnswerSchema = z.object({
  session_id: z.number().int().positive(),
  item_id: z.string().trim().min(1),
  response_text: boundedText(200),
});

export const completeAssessmentSchema = z.object({
  session_id: z.number().int().positive(),
});

export const reportSchema = z.object({
  session_id: z.number().int().positive(),
});

export const selfRateSchema = z.object({
  session_id: z.number().int().positive(),
  ratings: z.record(z.string(), z.number().int().min(0).max(5)),
});

export const validateSchema = z.object({
  session_id: z.number().int().positive(),
  answers: z.array(z.object({
    item_id: z.string().trim().min(1),
    answer: text(2000),
  })),
});

// ===== Deep Assessment Schemas =====
export const startDeepSchema = z.object({
  session_id: z.number().int().positive(),
});

export const deepAnswerSchema = z.object({
  session_id: z.number().int().positive(),
  round: z.number().int().min(1).max(3),
  answers: z.array(text(2000).optional().default('')).min(1),
});

// ===== Chat Schema =====
export const chatSchema = z.object({
  message: boundedText(1000),
});

// ===== Plan Schemas =====
export const generatePlanSchema = z.object({
  goal: boundedText(500),
});

export const savePlanSchema = z.object({
  plan: z.object({
    title: z.string().trim().max(200),
    steps: z.array(z.object({
      step_id: z.number().int(),
      title: z.string().trim().max(200),
      duration_days: z.number().int().min(1).max(365),
      weaknesses_targeted: z.array(z.string().trim().max(200)).optional(),
      type: z.enum(['knowledge', 'habit', 'personality']).optional(),
    })).max(30),
  }),
});

// ===== Step / Exam Schemas =====
export const completeStepSchema = z.object({
  step_id: z.number().int().min(1),
});

export const submitQuizSchema = z.object({
  step_id: z.number().int().min(1),
  answers: z.array(text(2000)),
  quiz: z.any(),
});

export const submitFinalExamSchema = z.object({
  answers: z.array(text(2000)),
});

// ===== Insight Schemas =====
export const reactInsightSchema = z.object({
  action: z.enum(['confirmed', 'dismissed', 'reflected']),
  reflection: text(1000).optional(),
});

// ===== User Schemas =====
export const createUserSchema = z.object({
  name: z.string().trim().min(1, '请输入名字').max(20),
});

export const updateUserSchema = z.object({
  name: z.string().trim().max(20).optional(),
  goal: text(500).optional(),
});

// ===== Validation Middleware =====
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const msg = result.error.issues[0]?.message || '输入格式错误';
      return res.status(400).json({ error: msg });
    }
    req.body = result.data;
    next();
  };
}

export default { validate };
