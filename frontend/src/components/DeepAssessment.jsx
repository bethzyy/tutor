import { useState, useRef, useEffect } from 'react';
import { startDeepChat, chatDeep, resumeDeepChat } from '../api.js';

export default function DeepAssessment({ assessmentSessionId, weaknesses, onDone, onSkip, isConsultation }) {
  const [phase, setPhase] = useState('loading'); // loading | intro | chatting | generating | done
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [turnCount, setTurnCount] = useState(0);
  const [maxTurns, setMaxTurns] = useState(12);
  const [profile, setProfile] = useState(null);
  const chatEndRef = useRef(null);

  // Resume in-progress deep chat on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await resumeDeepChat();
        if (data.active) {
          setSessionId(data.session_id);
          setMaxTurns(data.max_turns);
          setTurnCount(data.turn_count);
          setMessages(data.messages.map(m => ({ role: m.role, content: m.content })));
          setPhase('chatting');
        } else {
          setPhase('intro');
        }
      } catch {
        setPhase('intro');
      }
    })();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleStart = async () => {
    setPhase('generating');
    try {
      const data = await startDeepChat(assessmentSessionId);
      setSessionId(data.session_id);
      setMaxTurns(data.max_turns);
      setMessages([{ role: 'assistant', content: data.opening }]);
      setPhase('chatting');
    } catch (e) {
      alert(e.message);
      setPhase('intro');
    }
  };

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setSending(true);
    try {
      const data = await chatDeep(sessionId, msg);
      if (data.type === 'done') {
        setProfile(data.profile);
        setPhase('done');
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
        setTurnCount(data.turn);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'system', content: `出错了：${e.message}，请重试` }]);
    } finally {
      setSending(false);
    }
  };

  const handleEndEarly = async () => {
    if (!sessionId) return;
    setSending(true);
    try {
      const data = await chatDeep(sessionId, '我觉得已经聊得差不多了，可以结束了。');
      if (data.type === 'done') {
        setProfile(data.profile);
        setPhase('done');
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setSending(false);
    }
  };

  // ========================
  // Loading (checking for resume)
  // ========================
  if (phase === 'loading') {
    return (
      <div className="max-w-xl mx-auto text-center py-16">
        <div className="animate-spin text-4xl mb-4">🧠</div>
        <p className="text-notion-warm-gray-500">检查是否有进行中的对话...</p>
      </div>
    );
  }

  // ========================
  // Intro
  // ========================
  if (phase === 'intro') {
    return (
      <div className="notion-card p-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-lg">🧠</div>
          <div>
            <h3 className="text-[17px] font-bold text-notion-black">深度探索（可选）</h3>
            <p className="text-xs text-notion-warm-gray-400">一对一 AI 对话，约 5-10 分钟</p>
          </div>
        </div>

        <p className="text-sm text-notion-warm-gray-500 mb-3 leading-relaxed">
          量表提供了基础数据，但<strong className="text-notion-black">每个人的故事都是独特的</strong>。
          AI 会像一位温暖的心理咨询师，通过对话帮你发现行为背后的思维模式。
        </p>

        <div className="notion-card bg-purple-50/30 p-3 mb-4 text-xs text-notion-warm-gray-500 space-y-1">
          <p>对话会经历三个阶段：</p>
          <div className="flex flex-wrap gap-2 mt-1">
            <span className="px-2 py-0.5 rounded bg-purple-100/60 text-purple-700">建立信任</span>
            <span className="px-2 py-0.5 rounded bg-blue-100/60 text-blue-700">探索模式</span>
            <span className="px-2 py-0.5 rounded bg-amber-100/60 text-amber-700">整合发现</span>
          </div>
        </div>

        <p className="text-[11px] text-notion-warm-gray-300 mb-4 italic">
          基于半结构化临床访谈 + 认知行为疗法（CBT）+ 动机访谈（MI）技术
        </p>

        <div className="flex gap-3">
          <button onClick={handleStart} className="notion-btn-primary px-5 py-2 text-sm">
            开始深度对话
          </button>
          <button onClick={onSkip} className="px-5 py-2 text-sm text-notion-warm-gray-400 hover:text-notion-warm-gray-600 transition-colors">
            跳过，直接{isConsultation ? '开始咨询' : '制定计划'}
          </button>
        </div>
      </div>
    );
  }

  // ========================
  // Generating (loading for opening)
  // ========================
  if (phase === 'generating') {
    return (
      <div className="max-w-xl mx-auto text-center py-16">
        <div className="animate-spin text-4xl mb-4">🧠</div>
        <p className="text-notion-warm-gray-500">正在准备对话...</p>
      </div>
    );
  }

  // ========================
  // Chat
  // ========================
  if (phase === 'chatting') {
    const progressPct = Math.min((turnCount / maxTurns) * 100, 100);
    const phaseLabel = turnCount <= 2 ? '建立信任' : turnCount <= 7 ? '探索模式' : '整合发现';

    return (
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">🧠</span>
              <span className="text-sm font-semibold text-notion-black">深度探索</span>
              <span className="text-xs text-notion-warm-gray-400">· {phaseLabel}</span>
            </div>
            <span className="text-xs text-notion-warm-gray-400">对话 {turnCount} / {maxTurns}</span>
          </div>
          <div className="w-full bg-black/5 rounded-full h-1">
            <div
              className="bg-purple-500 h-1 rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Chat messages */}
        <div className="space-y-3 mb-4 max-h-[55vh] overflow-y-auto pr-1">
          {messages.map((msg, i) => {
            if (msg.role === 'system') {
              return (
                <div key={i} className="text-center">
                  <span className="text-xs text-red-400 bg-red-50 px-3 py-1 rounded-full">{msg.content}</span>
                </div>
              );
            }
            return (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-notion-blue text-white rounded-xl rounded-br-sm'
                    : 'bg-purple-50/80 text-notion-black rounded-xl rounded-bl-sm border border-purple-100/50'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            );
          })}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-purple-50/80 px-4 py-3 rounded-xl rounded-bl-sm border border-purple-100/50 text-sm text-notion-warm-gray-500">
                思考中...
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input area */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="说说你的想法和经历..."
              className="notion-input flex-1 rounded-lg"
              disabled={sending}
              maxLength={1000}
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="notion-btn-primary px-4 py-2 disabled:opacity-50"
            >
              发送
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-notion-warm-gray-300">提示：越具体越能帮助 AI 理解你</span>
            {turnCount >= 3 && (
              <button
                onClick={handleEndEarly}
                disabled={sending}
                className="text-xs text-notion-warm-gray-400 hover:text-notion-warm-gray-600 transition-colors"
              >
                我觉得差不多了，结束对话
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ========================
  // Done — Deep Profile
  // ========================
  if (phase === 'done' && profile) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🧠</div>
          <h2 className="text-[26px] font-bold text-notion-black mb-2">深度画像</h2>
          <p className="text-sm text-notion-warm-gray-500">基于量表数据 + AI 对话的综合分析</p>
        </div>

        {/* Core Findings */}
        {profile.core_findings?.length > 0 && (
          <div className="notion-card p-5 mb-4">
            <h3 className="text-sm font-bold text-notion-black mb-3">核心发现</h3>
            <div className="space-y-3">
              {profile.core_findings.map((f, i) => (
                <div key={i} className="p-3 rounded-lg bg-purple-50/50">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-purple-700">{f.title}</span>
                    {f.confidence && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-600">
                        {f.confidence === 'high' ? '高置信' : '中置信'}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-notion-warm-gray-600">{f.description}</p>
                  {f.evidence && (
                    <p className="text-xs text-notion-warm-gray-400 mt-1 italic">依据：{f.evidence}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Growth Barriers */}
        {profile.growth_barriers?.length > 0 && (
          <div className="notion-card p-5 mb-4">
            <h3 className="text-sm font-bold text-notion-black mb-3">成长阻碍</h3>
            <div className="space-y-2">
              {profile.growth_barriers.map((b, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-red-50/40">
                  <span className="text-sm mt-0.5">🚧</span>
                  <div>
                    <p className="text-sm font-medium text-notion-black">{b.name}</p>
                    <p className="text-xs text-notion-warm-gray-500 mt-0.5">{b.description}</p>
                    {b.root_cause && (
                      <p className="text-xs text-notion-warm-gray-400 mt-1">深层原因：{b.root_cause}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Inner Resources */}
        {profile.inner_resources?.length > 0 && (
          <div className="notion-card p-5 mb-4">
            <h3 className="text-sm font-bold text-notion-black mb-3">内在资源</h3>
            <div className="space-y-2">
              {profile.inner_resources.map((r, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-green-50/40">
                  <span className="text-sm mt-0.5">💪</span>
                  <div>
                    <p className="text-sm font-medium text-notion-black">{r.name}</p>
                    <p className="text-xs text-notion-warm-gray-500 mt-0.5">{r.description}</p>
                    {r.how_to_leverage && (
                      <p className="text-xs text-green-600 mt-1">如何利用：{r.how_to_leverage}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary */}
        {profile.overall_summary && (
          <div className="notion-card p-5 mb-4 bg-gradient-to-br from-purple-50/50 to-blue-50/50">
            <p className="text-sm text-notion-black leading-relaxed italic">"{profile.overall_summary}"</p>
          </div>
        )}

        <div className="text-center mt-6">
          <button
            onClick={() => onDone(profile)}
            className="notion-btn-primary px-8 py-2.5"
          >
            {isConsultation ? '开始 AI 咨询' : '制定成长计划'}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
