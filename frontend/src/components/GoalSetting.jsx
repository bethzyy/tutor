import { useState } from 'react';
import { classifyGoal } from '../api.js';

const GOAL_PRESETS = [
  { emoji: '💻', label: '技能学习', text: '我想学习', mode: 'skill' },
  { emoji: '🧠', label: '习惯养成', text: '我想养成每天学习2小时的习惯', mode: 'character' },
  { emoji: '🎯', label: '综合成长', text: '我想在掌握新技能的同时提升自律能力', mode: 'integrated' },
  { emoji: '💬', label: '心理咨询', text: '我想知道什么样的生活适合我', mode: 'consultation' },
  { emoji: '📈', label: '职业发展', text: '我想在半年内提升职业竞争力', mode: 'integrated' },
];

export default function GoalSetting({ refresh }) {
  const [goal, setGoal] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!goal.trim()) return;
    setSubmitting(true);
    try {
      await classifyGoal(goal);
      await refresh();
      // All modes go to assessment first
      window.location.href = '/diagnose';
    } catch (e) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

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
              handleSubmit();
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
        onClick={handleSubmit}
        disabled={!goal.trim() || submitting}
        className="notion-btn-primary px-8 py-2.5 disabled:opacity-50"
      >
        {submitting ? 'AI 分析中...' : '下一步'}
      </button>
    </div>
  );
}
