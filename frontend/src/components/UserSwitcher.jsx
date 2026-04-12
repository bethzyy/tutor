import { useState } from 'react';
import { login, register, loginAsGuest, getUsers, deleteUser, isLoggedIn } from '../api.js';

export default function UserSwitcher() {
  const [tab, setTab] = useState('login'); // login | register | users
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [showUsers, setShowUsers] = useState(false);

  const handleRegister = async () => {
    if (!nickname.trim()) return;
    setLoading(true);
    setError('');
    try {
      await register(nickname.trim(), password || undefined);
      window.location.href = '/';
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!nickname.trim()) return;
    setLoading(true);
    setError('');
    try {
      await login(nickname.trim(), password || undefined);
      window.location.href = '/';
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = async () => {
    setLoading(true);
    setError('');
    try {
      await loginAsGuest();
      window.location.href = '/';
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    if (showUsers) {
      setShowUsers(false);
      return;
    }
    try {
      // Temporarily use guest auth to list users
      const list = await getUsers();
      setUsers(list);
      setShowUsers(true);
    } catch {
      // If not logged in, just show empty
      setUsers([]);
      setShowUsers(true);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="max-w-md w-full px-6">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🌱</div>
          <h2
            className="text-[26px] font-bold text-notion-black mb-2"
            style={{ letterSpacing: '-0.625px', lineHeight: 1.23 }}
          >
            个人成长导师
          </h2>
          <p className="text-base text-notion-warm-gray-500">
            基于科学量表的 AI 成长伙伴
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex mb-6 border-b border-black/10">
          <button
            onClick={() => { setTab('login'); setError(''); }}
            className={`flex-1 pb-2 text-sm font-semibold transition-colors ${
              tab === 'login' ? 'text-notion-blue border-b-2 border-notion-blue' : 'text-notion-warm-gray-400'
            }`}
          >
            登录
          </button>
          <button
            onClick={() => { setTab('register'); setError(''); }}
            className={`flex-1 pb-2 text-sm font-semibold transition-colors ${
              tab === 'register' ? 'text-notion-blue border-b-2 border-notion-blue' : 'text-notion-warm-gray-400'
            }`}
          >
            注册
          </button>
        </div>

        {/* Form */}
        <div className="notion-card p-5 mb-4">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-notion-black mb-1">昵称</label>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    tab === 'login' ? handleLogin() : handleRegister();
                  }
                }}
                placeholder="输入你的昵称"
                className="notion-input w-full"
                maxLength={20}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-notion-black mb-1">
                密码 <span className="text-notion-warm-gray-300 font-normal">（可选）</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="留空则无需密码"
                className="notion-input w-full"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500 mt-3">{error}</p>
          )}

          <div className="mt-4 space-y-2">
            <button
              onClick={tab === 'login' ? handleLogin : handleRegister}
              disabled={!nickname.trim() || loading}
              className="notion-btn-primary w-full py-2.5 disabled:opacity-50"
            >
              {loading ? '处理中...' : tab === 'login' ? '登录' : '注册'}
            </button>

            <button
              onClick={handleGuest}
              disabled={loading}
              className="notion-btn-secondary w-full py-2 disabled:opacity-50"
            >
              以访客身份体验
            </button>
          </div>
        </div>

        {/* Existing users quick switch */}
        <div className="text-center">
          <button
            onClick={loadUsers}
            className="text-xs text-notion-warm-gray-400 hover:text-notion-warm-gray-500 transition-colors"
          >
            {showUsers ? '收起已有账户' : '查看已有账户'}
          </button>
          {showUsers && (
            <div className="mt-3 space-y-1.5">
              {users.length === 0 ? (
                <p className="text-xs text-notion-warm-gray-300">暂无已保存账户</p>
              ) : users.map((u) => (
                <div key={u.id} className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      try {
                        await login(u.name || '');
                        window.location.href = '/';
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
                    className="flex-1 p-3 rounded-lg border border-black/10 bg-white hover:border-black/15 text-left text-sm"
                  >
                    <span className="font-medium text-notion-black">{u.name || `用户 ${u.id}`}</span>
                    <span className="text-notion-warm-gray-400 ml-2 text-xs">{u.goal || '未设置目标'}</span>
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm('确定删除该用户？')) return;
                      try { await deleteUser(u.id); } catch {}
                      const list = await getUsers();
                      setUsers(list);
                    }}
                    className="w-8 h-8 rounded flex items-center justify-center text-notion-warm-gray-300 hover:text-red-500 transition-colors"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
