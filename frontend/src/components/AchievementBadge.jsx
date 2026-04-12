import { useState, useEffect } from 'react';
import { getState } from '../api.js';

async function fetchBadges() {
  const token = localStorage.getItem('tutor_access_token') || '';
  const res = await fetch('/api/achievements', {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error('Failed to fetch badges');
  return res.json();
}

const BADGE_META = {
  first_assessment: { name: '科学探索者', icon: '🔬', desc: '完成第一次综合评估' },
  deep_explorer:    { name: '内心探索者', icon: '🧠', desc: '完成 AI 深度追问' },
  first_step:       { name: '行动派', icon: '🚀', desc: '完成第一个学习步骤' },
  streak_7:         { name: '坚持不懈', icon: '🔥', desc: '连续 7 天使用' },
  graduate:         { name: '毕业', icon: '🏆', desc: '通过最终考核' },
  re_assessed:      { name: '成长追踪者', icon: '📈', desc: '完成第二次评估' },
  plan_master:      { name: '计划大师', icon: '📋', desc: '生成并保存成长计划' },
  chatter:          { name: '深度思考', icon: '💬', desc: '与 AI 导师对话超过 20 条' },
};

export default function AchievementBadge({ compact = false }) {
  const [badges, setBadges] = useState([]);
  const [unlockedCount, setUnlockedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBadges()
      .then(data => {
        setBadges(data.badges || []);
        setUnlockedCount(data.unlocked_count || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-xs text-notion-warm-gray-300 p-2">加载中...</div>;
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-sm">🏅</span>
        <span className="text-xs font-medium text-notion-warm-gray-500">{unlockedCount}/{badges.length}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-notion-black">成就徽章</h3>
        <span className="text-xs text-notion-warm-gray-400">{unlockedCount}/{badges.length} 已解锁</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {badges.map(b => (
          <div
            key={b.type}
            className={`text-center p-2 rounded-lg transition-all ${
              b.unlocked
                ? 'bg-notion-badge-bg'
                : 'bg-black/3 opacity-40'
            }`}
            title={b.description}
          >
            <div className={`text-2xl mb-1 ${b.unlocked ? '' : 'grayscale'}`}>{b.icon}</div>
            <p className="text-[10px] font-medium text-notion-black truncate">{b.name}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
