import { useState, useRef, useEffect } from 'react';
import { chat } from '../api.js';
import { renderMarkdown } from '../utils/lightMarkdown.jsx';

function formatDateLabel(dateStr) {
  if (!dateStr) return null;
  const d = dateStr.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (d === today) return '今天';
  if (d === yesterday) return '昨天';
  // Show "4月14日 周一" format
  const dt = new Date(d + 'T00:00:00');
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${dt.getMonth() + 1}月${dt.getDate()}日 ${weekdays[dt.getDay()]}`;
}

export default function ConsultationChat({ state, refresh }) {
  const [messages, setMessages] = useState(() => {
    return (state.chat_history || []).map(m => ({ role: m.role, content: m.content, created_at: m.created_at || null }));
  });
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showWeaknesses, setShowWeaknesses] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const isEmpty = messages.length === 0;
  const weaknesses = state.weaknesses || [];
  const latestReport = state.latest_report;

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setSending(true);
    try {
      const data = await chat(msg);
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `错误: ${e.message}` }]);
    } finally {
      setSending(false);
    }
  };

  const handleReassess = () => {
    window.location.href = '/diagnose';
  };

  const handleChangeGoal = () => {
    window.location.href = '/goal';
  };

  const handleSummary = async () => {
    if (sending || messages.length < 4) return;
    setSending(true);
    const summaryPrompt = '我们聊了这么多，你能用一两句话说说你现在最大的感受是什么吗？';
    setMessages(prev => [...prev, { role: 'user', content: summaryPrompt }]);
    try {
      const data = await chat(summaryPrompt);
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      setShowSummary(true);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `错误: ${e.message}` }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)]">
      {/* Compact top bar */}
      <div className="shrink-0 flex items-center gap-3 px-2 py-2 border-b border-black/5">
        <span className="text-sm font-semibold text-notion-black truncate flex-1">
          {state.user?.goal || 'AI 心理咨询'}
        </span>
        {weaknesses.length > 0 && (
          <button
            onClick={() => setShowWeaknesses(!showWeaknesses)}
            className="shrink-0 text-xs px-2 py-1 rounded-full border border-black/10 text-notion-warm-gray-500 hover:border-notion-blue hover:text-notion-blue transition-colors"
          >
            评估结果 {showWeaknesses ? '▲' : '▼'}
          </button>
        )}
        {messages.length >= 4 && !showSummary && (
          <button
            onClick={handleSummary}
            disabled={sending}
            className="shrink-0 text-xs px-2 py-1 rounded-full border border-purple-200 text-purple-600 hover:bg-purple-50 transition-colors disabled:opacity-50"
          >
            阶段总结
          </button>
        )}
        <button
          onClick={handleReassess}
          className="shrink-0 text-xs text-notion-warm-gray-400 hover:text-notion-blue transition-colors"
        >
          重新评估
        </button>
        <button
          onClick={handleChangeGoal}
          className="shrink-0 text-xs text-notion-warm-gray-400 hover:text-notion-blue transition-colors"
        >
          换目标
        </button>
      </div>

      {/* Collapsible assessment results */}
      {showWeaknesses && weaknesses.length > 0 && (
        <div className="shrink-0 px-3 py-2 bg-notion-warm-white/50 border-b border-black/5">
          <div className="flex flex-wrap gap-1.5">
            {weaknesses.map((w, i) => (
              <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${
                w.severity === 'high' ? 'bg-red-50 text-red-600' :
                w.severity === 'medium' ? 'bg-amber-50 text-amber-600' :
                'bg-blue-50 text-blue-600'
              }`}>
                {w.name} ({w.label || w.severity})
              </span>
            ))}
          </div>
          {latestReport?.ai_recommendation && (
            <p className="text-xs text-notion-warm-gray-500 mt-1.5 line-clamp-2">
              {latestReport.ai_recommendation}
            </p>
          )}
        </div>
      )}

      {/* Chat messages — takes all remaining space */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {isEmpty && (
          <div className="text-center mt-8">
            <p className="text-3xl mb-3">💬</p>
            <p className="text-sm text-notion-warm-gray-300 mb-4">
              {weaknesses.length > 0
                ? 'AI 已了解你的量表结果，说出你的困惑开始深度对话'
                : '直接说出你的困惑，AI 心理咨询师会和你深度对话'}
            </p>
            <div className="flex flex-wrap justify-center gap-2 max-w-md mx-auto">
              {weaknesses.length > 0 ? [
                '帮我分析一下这些结果说明了什么',
                '我在哪些方面最需要关注',
                '有什么具体的方法可以改善',
              ] : [
                '什么样的生活适合我？',
                '我为什么总是拖延？',
                '帮我分析一下我的性格',
                '我经常感到焦虑怎么办',
              ].map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => setInput(prompt)}
                  className="text-xs px-3 py-1.5 rounded-full border border-black/10 text-notion-warm-gray-500 hover:border-notion-blue hover:text-notion-blue hover:bg-notion-badge-bg transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => {
          const prevMsg = i > 0 ? messages[i - 1] : null;
          const showDateSep = !prevMsg || (msg.created_at && prevMsg.created_at &&
            msg.created_at.slice(0, 10) !== prevMsg.created_at.slice(0, 10));
          const dateLabel = msg.created_at
            ? formatDateLabel(msg.created_at)
            : null;

          return (
            <div key={i}>
              {showDateSep && dateLabel && (
                <div className="flex items-center gap-3 my-2">
                  <div className="flex-1 h-px bg-black/5" />
                  <span className="text-[11px] text-notion-warm-gray-300 shrink-0">{dateLabel}</span>
                  <div className="flex-1 h-px bg-black/5" />
                </div>
              )}
              <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-notion-blue text-white rounded-xl rounded-br-sm'
                    : 'bg-notion-warm-white text-notion-black rounded-xl rounded-bl-sm border border-black/10'
                }`}>
                  {msg.role === 'user'
                    ? <p className="whitespace-pre-wrap">{msg.content}</p>
                    : <div>{renderMarkdown(msg.content)}</div>
                  }
                </div>
              </div>
            </div>
          );
        })}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-notion-warm-white px-4 py-3 rounded-xl rounded-bl-sm border border-black/10 text-sm text-notion-warm-gray-500">
              思考中...
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input — compact */}
      <div className="shrink-0 px-3 py-2 border-t border-black/10">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="说出你的想法..."
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
      </div>
    </div>
  );
}
