import { Router } from 'express';
import db from '../db.js';
import ai from '../ai.js';

const router = Router();

// GET /api/state
router.get('/', (req, res) => {
  try {
    const user = db.get('SELECT id, name, mode, goal, traits, created_at FROM users WHERE id = ?', [req.userId]);
    const state = db.get('SELECT * FROM learning_state WHERE user_id = ?', [req.userId]);

    const weaknesses = JSON.parse(state.weaknesses || '[]');
    const plan = JSON.parse(state.plan || '{}');
    const stepStatuses = JSON.parse(state.step_statuses || '{}');

    const steps = plan.steps || [];
    const completedCount = Object.values(stepStatuses).filter(s => s === 'completed').length;
    const progress = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

    // Load recent chat history with timestamps for context restoration
    const chatHistory = db.all(
      'SELECT role, content, created_at FROM conversation_history WHERE user_id = ? ORDER BY id DESC LIMIT 200',
      [req.userId]
    ).reverse();

    // Load latest assessment report if exists
    const latestReport = db.get(
      `SELECT r.* FROM assessment_reports r
       JOIN assessment_sessions s ON r.session_id = s.id
       WHERE s.user_id = ?
       ORDER BY r.created_at DESC LIMIT 1`,
      [req.userId]
    );

    res.json({
      user,
      weaknesses,
      plan,
      current_step_id: state.current_step_id,
      step_statuses: stepStatuses,
      progress,
      final_exam_passed: !!state.final_exam_passed,
      chat_history: chatHistory,
      latest_report: latestReport ? {
        scale_scores: JSON.parse(latestReport.scale_scores || '{}'),
        weaknesses: JSON.parse(latestReport.weaknesses || '[]'),
        strengths: JSON.parse(latestReport.strengths || '[]'),
        ai_recommendation: latestReport.ai_recommendation,
      } : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/set_mode
router.post('/set_mode', (req, res) => {
  try {
    const { mode } = req.body;
    if (!['subject', 'character', 'integrated', 'personality', 'skill', 'consultation'].includes(mode)) {
      return res.status(400).json({ error: '无效的模式' });
    }
    db.run('UPDATE users SET mode = ? WHERE id = ?', [mode, req.userId]);
    res.json({ success: true, mode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/classify_goal
router.post('/classify_goal', async (req, res) => {
  try {
    const { goal } = req.body;
    if (!goal || goal.trim().length === 0) {
      return res.status(400).json({ error: '请输入目标' });
    }

    let mode = 'integrated';
    let domain = goal;
    let aiClassified = false;

    try {
      const result = await ai.classifyGoal(goal);
      const rawMode = (result.mode || '').trim().toLowerCase();
      if (['skill', 'character', 'integrated', 'consultation'].includes(rawMode)) {
        mode = rawMode;
        aiClassified = true;
      }
      if (result.domain) domain = result.domain;
    } catch (e) {
      console.warn('AI goal classification failed, using keyword fallback:', e.message);
    }

    // Keyword fallback: if AI returned invalid result, use heuristic
    if (!aiClassified) {
      const consultationKeywords = ['什么样', '为什么', '分析', '适合', '帮我看看', '了解自己', '探索', '迷茫', '方向', '意义', '困惑', '想清楚', '什么样的人生', '什么样的生活'];
      const skillKeywords = ['学习', '学会', '掌握', '编程', '开发', '技术', '语言', '考试', '工具', '技能', '课程', '框架', 'harness', 'agent', 'python', 'javascript', 'react', 'ai', '机器学习', '深度学习'];
      const characterKeywords = ['自律', '拖延', '焦虑', '情绪', '习惯', '性格', '时间管理', '自信', '沟通', '人际关系', '完美主义', '注意力', '压力'];
      const hasConsult = consultationKeywords.some(k => goal.includes(k));
      const hasSkill = skillKeywords.some(k => goal.toLowerCase().includes(k));
      const hasChar = characterKeywords.some(k => goal.includes(k));
      if (hasConsult && !hasSkill && !hasChar) mode = 'consultation';
      else if (hasSkill && !hasChar) mode = 'skill';
      else if (hasChar && !hasSkill) mode = 'character';
      else if (hasConsult) mode = 'consultation';
      else mode = 'integrated';
    }

    db.run('UPDATE users SET goal = ?, mode = ? WHERE id = ?', [goal, mode, req.userId]);
    res.json({ mode, domain });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/state/motivation_question — Generate a motivation exploration question
router.post('/motivation_question', async (req, res) => {
  try {
    const { goal } = req.body;
    if (!goal || goal.trim().length === 0) {
      return res.status(400).json({ error: '请输入目标' });
    }

    try {
      const question = await ai.callAI(
        '你是一位温暖的人生教练，擅长帮助用户探索目标背后的深层动机。',
        `用户说他们的目标是："${goal}"

请生成一个简短、温暖的追问，帮助用户思考这个目标背后的深层原因。要求：
1. 不要超过40个字
2. 像朋友之间自然的对话
3. 聚焦在"为什么这对你重要"上
4. 只输出问题本身，不要任何其他文字`,
        { temperature: 0.7, maxTokens: 100 }
      );
      res.json({ question: question || '这个目标对你来说为什么重要？' });
    } catch {
      res.json({ question: '这个目标对你来说为什么重要？' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/state/export — Export all user data as JSON
router.get('/export', (req, res) => {
  try {
    const userId = req.userId;
    const exportData = {
      exported_at: new Date().toISOString(),
      user: db.get('SELECT id, name, mode, goal, traits, created_at FROM users WHERE id = ?', [userId]),
      learning_state: db.get('SELECT * FROM learning_state WHERE user_id = ?', [userId]),
      conversation_history: db.all('SELECT role, content, created_at FROM conversation_history WHERE user_id = ? ORDER BY id', [userId]),
      assessment_sessions: db.all('SELECT * FROM assessment_sessions WHERE user_id = ? ORDER BY id', [userId]),
      assessment_responses: db.all(
        `SELECT r.* FROM assessment_responses r JOIN assessment_sessions s ON r.session_id = s.id WHERE s.user_id = ? ORDER BY r.id`,
        [userId]
      ),
      assessment_reports: db.all(
        `SELECT r.* FROM assessment_reports r JOIN assessment_sessions s ON r.session_id = s.id WHERE s.user_id = ? ORDER BY r.created_at`,
        [userId]
      ),
      deep_profiles: db.all('SELECT * FROM deep_profiles WHERE user_id = ? ORDER BY created_at', [userId]),
      achievements: db.all('SELECT * FROM achievements WHERE user_id = ? ORDER BY unlocked_at', [userId]),
      insights: db.all('SELECT * FROM insights WHERE user_id = ? ORDER BY created_at', [userId]),
    };

    // Parse JSON fields for clean export
    for (const report of exportData.assessment_reports) {
      try { report.scale_scores = JSON.parse(report.scale_scores); } catch {}
      try { report.weaknesses = JSON.parse(report.weaknesses); } catch {}
      try { report.strengths = JSON.parse(report.strengths); } catch {}
    }

    res.setHeader('Content-Disposition', `attachment; filename="user_${userId}_data.json"`);
    res.json(exportData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/state/midterm_check — Generate a brief re-assessment for progress check
router.post('/midterm_check', async (req, res) => {
  try {
    const state = db.get('SELECT weaknesses, plan, step_statuses FROM learning_state WHERE user_id = ?', [req.userId]);
    if (!state) return res.status(400).json({ error: '用户状态异常' });

    const weaknesses = JSON.parse(state.weaknesses || '[]');
    if (weaknesses.length === 0) return res.json({ questions: [] });

    // Generate 2-3 brief recheck questions targeting top weaknesses
    try {
      const questions = await ai.callAIJson(
        '你是心理评估专家。只输出JSON。',
        `用户之前的评估发现了以下弱点：${JSON.stringify(weaknesses.map(w => ({ name: w.name, severity: w.severity })))}

现在需要做一个简短的中期复查（2-3题），检查用户在这些方面是否有改善。

每题是一个第一人称自我陈述句，用5级频率选项（从不/很少/有时/经常/总是）。
如果用户原来得分高（问题严重），正向改善题应该选低分=改善。

输出严格的JSON数组：
[{"question":"自我陈述句","weakness":"对应的弱点名称","improved_if":"高分改善还是低分改善(high或low)"}]`,
        { temperature: 0.5, maxTokens: 500 }
      );
      res.json({ questions: Array.isArray(questions) ? questions : [] });
    } catch {
      // Fallback: generate simple questions
      const fallback = weaknesses.slice(0, 3).map(w => ({
        question: `最近两周，"${w.name}"的问题是否有所改善？`,
        weakness: w.name,
        improved_if: 'high',
      }));
      res.json({ questions: fallback });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
