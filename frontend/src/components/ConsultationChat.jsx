import { useState, useRef, useEffect } from 'react';
import { chat } from '../api.js';

export default function ConsultationChat({ state, refresh }) {
  const [messages, setMessages] = useState(() => {
    return (state.chat_history || []).map(m => ({ role: m.role, content: m.content }));
  });
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
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
    const summaryPrompt = '请根据我们之前的所有对话，给我做一个阶段性总结。包括：1) 你对我目前状态的分析 2) 你发现的我的核心模式和特点 3) 你的建议和后续方向。用温暖但专业的语气。';
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
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-[22px] font-bold text-notion-black" style={{ letterSpacing: '-0.4px' }}>
          AI 心理咨询
        </h2>
        <p className="text-sm text-notion-warm-gray-500 mt-1">
          {state.user?.goal || '和 AI 心理咨询师深度对话'}
        </p>
        <div className="flex items-center justify-center gap-3 mt-3">
          {messages.length >= 4 && !showSummary && (
            <button
              onClick={handleSummary}
              disabled={sending}
              className="text-xs px-3 py-1.5 rounded-full border border-purple-200 text-purple-600 hover:bg-purple-50 transition-colors disabled:opacity-50"
            >
              生成阶段总结
            </button>
          )}
          <button
            onClick={handleReassess}
            className="text-xs px-3 py-1.5 rounded-full border border-black/10 text-notion-warm-gray-500 hover:border-notion-blue hover:text-notion-blue hover:bg-notion-badge-bg transition-colors"
          >
            重新评估
          </button>
          <button
            onClick={handleChangeGoal}
            className="text-xs px-3 py-1.5 rounded-full border border-black/10 text-notion-warm-gray-500 hover:border-notion-blue hover:text-notion-blue hover:bg-notion-badge-bg transition-colors"
          >
            换个目标
          </button>
        </div>
      </div>

      {/* Assessment results summary */}
      {weaknesses.length > 0 && (
        <div className="notion-card p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm">📊</span>
            <span className="text-sm font-semibold text-notion-black">量表评估结果</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {weaknesses.map((w, i) => (
              <span key={i} className={`text-xs px-2.5 py-1 rounded-full ${
                w.severity === 'high' ? 'bg-red-50 text-red-600' :
                w.severity === 'medium' ? 'bg-amber-50 text-amber-600' :
                'bg-blue-50 text-blue-600'
              }`}>
                {w.name} ({w.label || w.severity})
              </span>
            ))}
          </div>
          {latestReport?.ai_recommendation && (
            <p className="text-xs text-notion-warm-gray-500 mt-2 line-clamp-2">
              AI 建议：{latestReport.ai_recommendation}
            </p>
          )}
        </div>
      )}

      {/* Chat area */}
      <div className="notion-card flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 24rem)' }}>
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-notion-blue text-white rounded-xl rounded-br-sm'
                  : 'bg-notion-warm-white text-notion-black rounded-xl rounded-bl-sm border border-black/10'
              }`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-notion-warm-white px-4 py-3 rounded-xl rounded-bl-sm border border-black/10 text-sm text-notion-warm-gray-500">
                思考中...
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-black/10">
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
    </div>
  );
}
