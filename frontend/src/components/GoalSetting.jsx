import { useState } from 'react';
import { classifyGoal, getMotivationQuestion } from '../api.js';

const GOAL_PRESETS = [
  { emoji: '💻', label: '技能学习', text: '我想学习', mode: 'skill' },
  { emoji: '🧠', label: '习惯养成', text: '我想养成每天学习2小时的习惯', mode: 'character' },
  { emoji: '🎯', label: '综合成长', text: '我想在掌握新技能的同时提升自律能力', mode: 'integrated' },
  { emoji: '💬', label: '心理咨询', text: '我想知道什么样的生活适合我', mode: 'consultation' },
  { emoji: '📈', label: '职业发展', text: '我想在半年内提升职业竞争力', mode: 'integrated' },
];

export default function GoalSetting({ refresh }) {
  const [goal, setGoal] = useState('');
  const [step, setStep] = useState('goal'); // 'goal' | 'motivation'
  const [motivationQuestion, setMotivationQuestion] = useState('');
  const [motivation, setMotivation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleGoalNext = async () => {
    if (!goal.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const data = await getMotivationQuestion(goal);
      setMotivationQuestion(data.question);
      setStep('motivation');
    } catch {
      // If motivation question fails, skip directly to classification
      await handleClassify();
    } finally {
      setSubmitting(false);
    }
  };

  const handleClassify = async () => {
    setSubmitting(true);
    setError('');
    try {
      const combinedGoal = motivation.trim()
        ? `${goal}\n（深层动机：${motivation}）`
        : goal;
      await classifyGoal(combinedGoal);
      await refresh();
      window.location.href = '/diagnose';
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkipMotivation = () => {
    handleClassify();
  };

  if (step === 'motivation') {
    return (
      <div className="max-w-xl mx-auto text-center py-8">
        <div className="text-4xl mb-4">💭</div>
        <h2
          className="text-[22px] font-bold text-notion-black mb-3"
          style={{ letterSpacing: '-0.5px', lineHeight: 1.3 }}
        >
          再想深一层
        </h2>

        <div className="notion-card p-6 text-left mb-4">
          <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-100">
            <p className="text-sm text-notion-warm-gray-500 mb-1">你的目标</p>
            <p className="text-notion-black font-medium">{goal}</p>
          </div>
          <p className="text-base text-notion-black mb-4">{motivationQuestion}</p>
          <textarea
            value={motivation}
            onChange={(e) => setMotivation(e.target.value)}
            placeholder="写下你的想法..."
            className="notion-input w-full h-20 rounded-lg resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleClassify();
              }
            }}
          />
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={handleSkipMotivation}
            className="notion-btn-secondary px-6 py-2.5"
          >
            跳过
          </button>
          <button
            onClick={handleClassify}
            disabled={submitting}
            className="notion-btn-primary px-8 py-2.5 disabled:opacity-50"
          >
            {submitting ? 'AI 分析中...' : '下一步'}
          </button>
        </div>
        {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto text-center py-8">
      <div className="text-5xl mb-6">🚀</div>
      <h2
        className="text-[26px] font-bold text-notion-black mb-3"
        style={{ letterSpacing: '-0.625px', lineHeight: 1.23 }}
      >
        你想达成什么目标？
      </h2>
      <p className="text-base text-notion-warm-gray-500 mb-6">
        告诉我你的目标或困惑，AI 会为你量身定制方案
      </p>

      <div className="notion-card p-6 text-left mb-6">
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="描述你的目标，越具体越好...&#10;例如：我想学习 agent harness 的使用"
          className="notion-input w-full h-28 rounded-lg resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && goal.trim()) {
              e.preventDefault();
              handleGoalNext();
            }
          }}
        />
        <div className="flex flex-wrap gap-2 mt-3">
          <span className="text-xs text-notion-warm-gray-300 leading-7">参考：</span>
          {GOAL_PRESETS.map((preset, i) => (
            <button
              key={i}
              onClick={() => setGoal(preset.text)}
              className="text-xs px-2.5 py-1 rounded-full border border-black/10 text-notion-warm-gray-500 hover:border-notion-blue hover:text-notion-blue hover:bg-notion-badge-bg transition-colors"
            >
              {preset.emoji} {preset.label}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleGoalNext}
        disabled={!goal.trim() || submitting}
        className="notion-btn-primary px-8 py-2.5 disabled:opacity-50"
      >
        {submitting ? '思考中...' : '下一步'}
      </button>
      {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
    </div>
  );
}
