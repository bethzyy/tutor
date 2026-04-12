import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import stateRoutes from './routes/state.js';
import diagnoseRoutes from './routes/diagnose.js';
import planRoutes from './routes/plan.js';
import chatRoutes from './routes/chat.js';
import stepRoutes from './routes/step.js';
import examRoutes from './routes/exam.js';
import userRoutes from './routes/user.js';
import insightRoutes from './routes/insights.js';
import assessmentRoutes from './routes/assessment.js';
import deepAssessmentRoutes from './routes/deepAssessment.js';
import authRoutes from './routes/auth.js';
import achievementsRoutes from './routes/achievements.js';
import { requireAuth } from './middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

import './db.js'; // Initialize database (after dotenv)
import db from './db.js';
const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:4173'];

const app = express();

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// Simple rate limiter (in-memory)
const rateLimitMap = new Map();
function rateLimit(windowMs = 60000, max = 30) {
  return (req, res, next) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const entry = rateLimitMap.get(ip) || { count: 0, resetTime: now + windowMs };
    if (now > entry.resetTime) {
      entry.count = 0;
      entry.resetTime = now + windowMs;
    }
    entry.count++;
    rateLimitMap.set(ip, entry);
    if (entry.count > max) {
      return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    }
    next();
  };
}

app.use('/api/', rateLimit(60000, 120));

// Auth routes (no auth required)
app.use('/api/auth', authRoutes);

// All other API routes require authentication
app.use('/api', requireAuth);

// API routes
app.use('/api/state', stateRoutes);
app.use('/api/diagnose', diagnoseRoutes);
app.use('/api/plan', planRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/step', stepRoutes);
app.use('/api/final_exam', examRoutes);
app.use('/api/users', userRoutes);
app.use('/api/insights', insightRoutes);
app.use('/api/assessment', assessmentRoutes);
app.use('/api/deep-assessment', deepAssessmentRoutes);
app.use('/api/achievements', achievementsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend static files in production
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
// SPA fallback: all non-API routes serve index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(frontendDist, 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`Tutor backend running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Kill the existing process and try again.`);
    console.error(`Run: powershell -Command "Get-NetTCPConnection -LocalPort ${PORT} -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"`);
    process.exit(1);
  } else {
    throw err;
  }
});
