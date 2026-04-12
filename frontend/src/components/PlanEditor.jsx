import { useState } from 'react';
import { generatePlan, savePlan } from '../api.js';

const GOAL_EXAMPLES = [
  { emoji: '💼', label: '职业发展', text: '我想在半年内掌握AI开发技能，找到更好的工作' },
  { emoji: '📚', label: '学习方法', text: '我想养成每天高效学习2小时的习惯，提高学习效率' },
  { emoji: '🧠', label: '思维成长', text: '我想克服完美主义和拖延症，提升自我管理能力' },
  { emoji: '🎯', label: '考试目标', text: '我想在接下来的考试中取得优异成绩' },
];

export default function PlanEditor({ state, refresh }) {
  const [goal, setGoal] = useState(state?.user?.goal || '');
  const [generating, setGenerating] = useState(false);
  const [plan, setPlan] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleGenerate = async () => {
    if (!goal.trim()) return;
    setGenerating(true);
    try {
      const data = await generatePlan(goal);
      setPlan(data);
    } catch (e) {
      alert(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePlan(plan);
      await refresh();
      window.location.href = '/study';
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = () => {
    setPlan(null);
  };

  return (
    <div className="max-w-3xl mx-auto">
      {!plan ? (
        <>
          <div className="text-center mb-10">
            <h2
              className="text-[26px] font-bold text-notion-black mb-2"
              style={{ letterSpacing: '-0.625px', lineHeight: 1.23 }}
            >
              制定成长计划
            </h2>
            <p className="text-base text-notion-warm-gray-500">
              告诉 AI 你的长期目标，它会根据你的弱点生成个性化计划
            </p>
          </div>

          {state.weaknesses && state.weaknesses.length > 0 && (
            <div className="mb-6 p-4 rounded-notion-card border border-notion-orange/20 bg-orange-50/50">
              <p className="text-sm font-semibold text-notion-orange mb-2">已发现的弱点：</p>
              <div className="flex flex-wrap gap-2">
                {state.weaknesses.map((w, i) => (
                  <span key={i} className="notion-badge" style={{ background: '#fff7ed', color: '#dd5b00' }}>
                    {w.name} ({w.severity === 'high' ? '严重' : w.severity === 'medium' ? '中等' : '轻微'})
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="notion-card p-6">
            <label className="block text-sm font-semibold text-notion-black mb-2">
              你的长期目标
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="描述你想达成的目标，越具体越好..."
              className="notion-input w-full h-24 rounded-lg resize-none"
            />
            <div className="flex flex-wrap gap-2 mt-3 mb-4">
              <span className="text-xs text-notion-warm-gray-300 leading-7">参考：</span>
              {GOAL_EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => setGoal(ex.text)}
                  className="text-xs px-2.5 py-1 rounded-full border border-black/10 text-notion-warm-gray-500 hover:border-notion-blue hover:text-notion-blue hover:bg-notion-badge-bg transition-colors"
                >
                  {ex.emoji} {ex.label}
                </button>
              ))}
            </div>
            <div className="text-right">
              <button
                onClick={handleGenerate}
                disabled={!goal.trim() || generating}
                className="notion-btn-primary px-6 py-2 disabled:opacity-50"
              >
                {generating ? 'AI 规划中...' : '生成计划'}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="text-center mb-6">
            <h2
              className="text-[22px] font-bold text-notion-black mb-1"
              style={{ letterSpacing: '-0.25px' }}
            >
              {plan.title}
            </h2>
            <p className="text-sm text-notion-warm-gray-500">
              共 {plan.steps?.length || 0} 个步骤
            </p>
          </div>

          <div className="space-y-3">
            {plan.steps?.map((step, i) => (
              <div key={i} className="notion-card p-4 flex items-start gap-4">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                  style={{ background: step.type === 'knowledge' ? '#0075de' : '#1aae39' }}
                >
                  {step.step_id}
                </div>
                <div className="flex-1">
                  <h3 className="text-[15px] font-semibold text-notion-black">{step.title}</h3>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-xs text-notion-warm-gray-500">{step.duration_days} 天</span>
                    <span className="notion-badge" style={{
                      background: step.type === 'knowledge' ? '#f2f9ff'
                        : step.type === 'personality' ? '#fff7ed'
                        : '#f0fdf4',
                      color: step.type === 'knowledge' ? '#0075de'
                        : step.type === 'personality' ? '#dd5b00'
                        : '#1aae39',
                    }}>
                      {step.type === 'knowledge' ? '知识' : step.type === 'personality' ? '认知' : '习惯'}
                    </span>
                    {step.weaknesses_targeted?.map((w, j) => (
                      <span key={j} className="text-xs px-2 py-0.5 rounded bg-notion-warm-white text-notion-warm-gray-500">{w}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-center gap-3 mt-8">
            <button
              onClick={handleRegenerate}
              className="notion-btn-secondary px-6 py-2"
            >
              重新生成
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="notion-btn-primary px-8 py-2 disabled:opacity-50"
            >
              {saving ? '保存中...' : '确认计划，开始学习'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
