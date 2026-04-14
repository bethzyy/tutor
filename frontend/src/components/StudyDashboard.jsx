import { useState, useEffect, useRef } from 'react';
import { chat, completeStep, submitQuiz, startFinalExam, submitFinalExam, reactToInsight, getInsights, getMidtermCheck } from '../api.js';
import AchievementBadge from './AchievementBadge.jsx';
import { renderMarkdown } from '../utils/lightMarkdown.jsx';

function formatDateLabel(dateStr) {
  if (!dateStr) return null;
  const d = dateStr.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (d === today) return '今天';
  if (d === yesterday) return '昨天';
  const dt = new Date(d + 'T00:00:00');
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${dt.getMonth() + 1}月${dt.getDate()}日 ${weekdays[dt.getDay()]}`;
}

export default function StudyDashboard({ state, refresh }) {
  const steps = state.plan?.steps || [];
  const stepStatuses = state.step_statuses || {};
  const currentStepId = state.current_step_id;
  const currentStep = steps.find(s => s.step_id === currentStepId);

  // Chat state — restore from saved history with timestamps
  const [messages, setMessages] = useState(() => {
    return (state.chat_history || []).map(m => ({ role: m.role, content: m.content, created_at: m.created_at || null }));
  });
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Quiz state
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizData, setQuizData] = useState(null);
  const [quizAnswers, setQuizAnswers] = useState([]);
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [quizResult, setQuizResult] = useState(null);

  // Final exam state
  const [examOpen, setExamOpen] = useState(false);
  const [examData, setExamData] = useState(null);
  const [examAnswers, setExamAnswers] = useState([]);
  const [examSubmitting, setExamSubmitting] = useState(false);
  const [examResult, setExamResult] = useState(null);

  // Insight state
  const [mirrorMoment, setMirrorMoment] = useState(null);
  const [showInsights, setShowInsights] = useState(false);
  const [insights, setInsights] = useState([]);

  // Midterm check state
  const [showMidtermBanner, setShowMidtermBanner] = useState(false);
  const [midtermOpen, setMidtermOpen] = useState(false);
  const [midtermQuestions, setMidtermQuestions] = useState([]);
  const [midtermAnswers, setMidtermAnswers] = useState([]);
  const [midtermLoading, setMidtermLoading] = useState(false);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);

  const chatEndRef = useRef(null);

  // Show midterm banner at ~50% progress (only once)
  const completedSteps = Object.values(stepStatuses).filter(s => s === 'completed').length;
  const totalSteps = steps.length;
  useEffect(() => {
    if (totalSteps >= 4 && completedSteps >= Math.floor(totalSteps / 2) && completedSteps < totalSteps) {
      const dismissed = sessionStorage.getItem('midterm_dismissed');
      if (!dismissed) setShowMidtermBanner(true);
    }
  }, [completedSteps, totalSteps]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading, mirrorMoment]);

  const handleChat = async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput;
    setChatInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setChatLoading(true);
    try {
      const data = await chat(msg);
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      if (data.mirror_moment) {
        setMirrorMoment(data.mirror_moment);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `错误: ${e.message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleMirrorReaction = async (action) => {
    if (!mirrorMoment) return;
    try {
      await reactToInsight(mirrorMoment.insight_id, action, null);
    } catch (_) {}
    if (action === 'confirmed') {
      setMessages(prev => [...prev, { role: 'assistant', content: `✅ 记下了。${mirrorMoment.summary}` }]);
    } else if (action === 'dismissed') {
      setMessages(prev => [...prev, { role: 'assistant', content: '好的，这个观察可能不太准确，忽略就好。' }]);
    }
    setMirrorMoment(null);
  };

  const loadInsights = async () => {
    try {
      const data = await getInsights();
      setInsights(data.insights || []);
      setShowInsights(!showInsights);
    } catch (_) {}
  };

  const handleStartQuiz = async () => {
    if (!currentStep) return;
    try {
      const data = await completeStep(currentStep.step_id);
      setQuizData(data);
      setQuizAnswers(Array.isArray(data.quiz) ? data.quiz.map(() => '') : ['']);
      setQuizResult(null);
      setQuizOpen(true);
    } catch (e) {
      setErrorMsg(e.message);
    }
  };

  const handleSubmitQuiz = async () => {
    if (!quizData) return;
    setQuizSubmitting(true);
    try {
      const data = await submitQuiz(quizData.step.step_id, quizAnswers, quizData.quiz);
      setQuizResult(data);
      if (data.passed) {
        setTimeout(async () => {
          await refresh();
          if (data.all_steps_completed) {
            setQuizOpen(false);
          }
        }, 1500);
      }
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setQuizSubmitting(false);
    }
  };

  const handleStartFinalExam = async () => {
    try {
      const data = await startFinalExam();
      if (data.already_passed) {
        setErrorMsg(data.message);
        return;
      }
      setExamData(data.exam);
      setExamAnswers(data.exam.map(() => ''));
      setExamResult(null);
      setExamOpen(true);
    } catch (e) {
      setErrorMsg(e.message);
    }
  };

  const handleSubmitFinalExam = async () => {
    setExamSubmitting(true);
    try {
      const data = await submitFinalExam(examAnswers);
      setExamResult(data);
      if (data.passed) {
        setTimeout(() => {
          refresh();
          window.location.href = '/report';
        }, 2000);
      }
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setExamSubmitting(false);
    }
  };

  const allDone = state.progress === 100;

  const handleMidtermCheck = async () => {
    setMidtermLoading(true);
    try {
      const data = await getMidtermCheck();
      if (data.questions && data.questions.length > 0) {
        setMidtermQuestions(data.questions);
        setMidtermAnswers(data.questions.map(() => ''));
        setMidtermOpen(true);
      }
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setMidtermLoading(false);
    }
  };

  const handleMidtermDismiss = () => {
    setShowMidtermBanner(false);
    sessionStorage.setItem('midterm_dismissed', '1');
  };

  // Suggested chat prompts based on current step
  const suggestedPrompts = (() => {
    if (!currentStep) return [];
    const base = [
      '帮我理解这个步骤的核心概念',
      '给我一个具体的例子',
    ];
    if (currentStep.type === 'knowledge') {
      base.push('这个知识点在实际中怎么应用？', '我容易在什么地方犯错？');
    } else if (currentStep.type === 'habit') {
      base.push('帮我制定一个具体的行动方案', '我怎么克服坚持不下去的问题？');
    } else {
      base.push('帮我分析我可能存在的思维误区', '有什么练习可以帮我改善？');
    }
    return base;
  })();

  /* ───── Drawer Sidebar Content ───── */
  const drawerContent = (
    <div className="w-72 bg-white h-full overflow-y-auto shadow-xl">
      <div className="p-4 border-b border-black/10">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-notion-black">学习计划</h2>
          <button onClick={() => setDrawerOpen(false)} className="text-notion-warm-gray-400 hover:text-notion-black text-lg leading-none">&times;</button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 bg-black/5 rounded-full h-1.5">
            <div
              className="bg-notion-blue h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${state.progress}%` }}
            />
          </div>
          <span className="text-xs font-medium text-notion-warm-gray-500">{state.progress}%</span>
        </div>
      </div>

      <div className="p-2">
        {steps.map((step) => {
          const status = stepStatuses[String(step.step_id)] || 'pending';
          const isCurrent = step.step_id === currentStepId;
          return (
            <div
              key={step.step_id}
              className={`p-3 rounded-lg mb-1 transition-colors ${
                isCurrent ? 'bg-notion-badge-bg border border-notion-blue/20' : ''
              } ${status === 'completed' ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start gap-2">
                <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  status === 'completed' ? 'bg-notion-green text-white' :
                  isCurrent ? 'bg-notion-blue text-white' : 'bg-black/5 text-notion-warm-gray-500'
                }`}>
                  {status === 'completed' ? '✓' : step.step_id}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-notion-black truncate">{step.title}</p>
                  <span className={`text-xs ${
                    step.type === 'knowledge' ? 'text-notion-blue' : 'text-notion-green'
                  }`}>
                    {step.type === 'knowledge' ? '知识' : '习惯'} · {step.duration_days}天
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {allDone && (
          <button
            onClick={() => { setDrawerOpen(false); handleStartFinalExam(); }}
            className="w-full mt-4 p-3 notion-btn-primary rounded-lg text-center"
          >
            开始最终考核
          </button>
        )}

        {/* Insight Panel */}
        <div className="mt-4 pt-3 border-t border-black/10">
          <button
            onClick={() => window.location.href = '/diagnose'}
            className="w-full mb-3 p-2 text-sm text-notion-warm-gray-400 hover:text-notion-blue border border-black/5 hover:border-notion-blue/20 rounded-lg transition-colors text-center"
          >
            🔄 重新评估
          </button>

          <button
            onClick={loadInsights}
            className="w-full flex items-center justify-between text-sm text-notion-warm-gray-500 hover:text-notion-black transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <span>💡</span>
              <span>我的洞察</span>
            </span>
            <span className="text-xs">{showInsights ? '▲' : '▼'}</span>
          </button>

          <div className="mt-3 pt-3 border-t border-black/5">
            <AchievementBadge compact={true} />
          </div>
          {showInsights && (
            <div className="mt-2 space-y-1.5">
              {insights.length === 0 ? (
                <p className="text-xs text-notion-warm-gray-300 p-2">暂无洞察，继续学习后会自动发现模式</p>
              ) : insights.slice(0, 5).map(ins => (
                <div key={ins.id} className={`text-xs p-2 rounded-lg border ${
                  ins.status === 'confirmed' ? 'bg-green-50/50 border-green-200/40' :
                  ins.status === 'dismissed' ? 'opacity-40 border-black/5' :
                  'bg-amber-50/40 border-amber-200/30'
                }`}>
                  <p className="font-medium text-notion-black truncate">{ins.summary}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-notion-warm-gray-300">{ins.occurrence_count}次</span>
                    <span className="text-notion-warm-gray-300">·</span>
                    <span className={ins.status === 'confirmed' ? 'text-notion-green' : ins.status === 'dismissed' ? 'text-notion-warm-gray-300' : 'text-amber-600'}>
                      {ins.status === 'confirmed' ? '已确认' : ins.status === 'dismissed' ? '已忽略' : ins.status === 'surfaced' ? '已展示' : '待观察'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] relative">
      {/* Error toast */}
      {errorMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-red-50 text-red-600 text-sm px-4 py-2 rounded-lg border border-red-200 shadow-sm animate-pulse"
          onClick={() => setErrorMsg('')}>
          {errorMsg} <span className="text-red-400 ml-2 cursor-pointer">✕</span>
        </div>
      )}

      {/* Drawer overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/20" onClick={() => setDrawerOpen(false)} />
          <div className="relative z-50 flex">
            {drawerContent}
          </div>
        </div>
      )}

      {/* Compact top bar */}
      <div className="shrink-0 flex items-center gap-3 px-3 py-2 border-b border-black/5">
        <button
          onClick={() => setDrawerOpen(true)}
          className="shrink-0 w-8 h-8 rounded-lg border border-black/10 flex items-center justify-center text-notion-warm-gray-500 hover:bg-notion-warm-white hover:text-notion-black transition-colors"
          title="学习计划"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
        <div className="flex-1 min-w-0">
          {currentStep && !allDone ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-notion-blue">步骤 {currentStepId}/{totalSteps}</span>
              <span className="text-sm text-notion-black truncate">{currentStep.title}</span>
            </div>
          ) : allDone ? (
            <span className="text-sm font-semibold text-notion-green">所有步骤已完成</span>
          ) : (
            <span className="text-sm text-notion-warm-gray-500">学习计划</span>
          )}
        </div>
        <span className="shrink-0 text-xs text-notion-warm-gray-400">{state.progress}%</span>
      </div>

      {/* Midterm banner — inline compact */}
      {showMidtermBanner && !allDone && (
        <div className="shrink-0 flex items-center gap-3 px-3 py-2 bg-purple-50/60 border-b border-purple-100/50">
          <span className="text-sm">📊</span>
          <span className="text-xs text-purple-700 flex-1">
            进度过半（{completedSteps}/{totalSteps}），做个快速复查？
          </span>
          <button
            onClick={handleMidtermCheck}
            disabled={midtermLoading}
            className="shrink-0 text-xs px-2.5 py-1 rounded-md bg-purple-600 text-white hover:opacity-90 disabled:opacity-50"
          >
            {midtermLoading ? '...' : '做复查'}
          </button>
          <button
            onClick={handleMidtermDismiss}
            className="shrink-0 text-xs text-purple-400 hover:text-purple-600"
          >
            ✕
          </button>
        </div>
      )}

      {/* Chat messages — full remaining space */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center mt-10">
            <p className="text-4xl mb-3">💬</p>
            <p className="text-sm text-notion-warm-gray-300 mb-4">向你的 AI 导师提问，或点击下方话题开始讨论</p>
            <div className="flex flex-wrap justify-center gap-2 max-w-sm mx-auto">
              {suggestedPrompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => { setChatInput(prompt); }}
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
          const dateLabel = msg.created_at ? formatDateLabel(msg.created_at) : null;

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
                <div className={`max-w-[80%] px-4 py-2.5 text-sm leading-relaxed ${
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
        {chatLoading && (
          <div className="flex justify-start">
            <div className="bg-notion-warm-white px-4 py-2.5 rounded-xl rounded-bl-sm border border-black/10 text-sm text-notion-warm-gray-500">
              思考中...
            </div>
          </div>
        )}
        {mirrorMoment && (
          <div className="flex justify-start">
            <div className="max-w-[85%] px-4 py-3 rounded-xl rounded-bl-sm border-2 border-amber-300/50 bg-amber-50/80 text-sm">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-base">💡</span>
                <span className="text-xs font-semibold text-amber-700">洞察发现</span>
              </div>
              <p className="text-notion-black leading-relaxed">{mirrorMoment.summary}</p>
              <p className="text-xs text-notion-warm-gray-500 mt-1">已观察到 {mirrorMoment.occurrence_count} 次</p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => { setMirrorMoment(null); setChatInput('我想深入聊聊这个观察'); }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-notion-blue text-white hover:opacity-90 transition-opacity"
                >
                  再聊聊
                </button>
                <button
                  onClick={() => handleMirrorReaction('confirmed')}
                  className="text-xs px-3 py-1.5 rounded-lg bg-notion-green text-white hover:opacity-90 transition-opacity"
                >
                  记下了
                </button>
                <button
                  onClick={() => handleMirrorReaction('dismissed')}
                  className="text-xs px-3 py-1.5 rounded-lg border border-black/10 text-notion-warm-gray-500 hover:bg-notion-warm-white transition-colors"
                >
                  不太对
                </button>
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input — compact with inline complete button */}
      <div className="shrink-0 px-3 py-2 border-t border-black/10">
        <div className="flex gap-2 items-center">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleChat()}
            placeholder="输入问题..."
            className="notion-input flex-1 rounded-lg"
          />
          <button
            onClick={handleChat}
            disabled={chatLoading}
            className="notion-btn-primary px-4 py-2 disabled:opacity-50"
          >
            发送
          </button>
          {currentStep && !allDone && (
            <button
              onClick={handleStartQuiz}
              className="shrink-0 px-3 py-2 text-xs rounded-lg text-white hover:opacity-90 transition-opacity"
              style={{ background: '#1aae39' }}
              title="标记为已完成（开始考核）"
            >
              ✓ 完成
            </button>
          )}
        </div>
      </div>

      {/* Quiz Modal */}
      {quizOpen && quizData && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-notion-featured shadow-notion-deep w-full max-w-lg max-h-[90vh] sm:max-h-[80vh] overflow-y-auto p-4 sm:p-6">
            <h3 className="text-[17px] font-bold text-notion-black mb-1" style={{ letterSpacing: '-0.25px' }}>
              步骤考核
            </h3>
            <p className="text-sm text-notion-warm-gray-500 mb-4">{quizData.step.title}</p>

            {quizResult ? (
              <div className={`p-4 rounded-lg mb-4 border ${
                quizResult.passed
                  ? 'bg-green-50/60 border-notion-green/20'
                  : 'bg-red-50/60 border-red-300/40'
              }`}>
                <p className={`font-semibold ${quizResult.passed ? 'text-notion-green' : 'text-red-600'}`}>
                  {quizResult.passed ? '考核通过！' : '未通过'}
                </p>
                <p className="text-sm text-notion-warm-gray-500 mt-2">{quizResult.feedback}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(Array.isArray(quizData.quiz) ? quizData.quiz : [quizData.quiz]).map((q, i) => (
                  <div key={i} className="p-4 rounded-lg bg-notion-warm-white/60 border border-black/5">
                    <p className="text-sm font-medium text-notion-black mb-2">
                      {i + 1}. {q.question}
                    </p>
                    {q.options ? (
                      <div className="space-y-1">
                        {q.options.map((opt, j) => (
                          <label key={j} className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm transition-colors ${
                            quizAnswers[i] === opt ? 'bg-notion-badge-bg text-notion-blue' : 'hover:bg-notion-warm-white'
                          }`}>
                            <input
                              type="radio"
                              name={`q${i}`}
                              value={opt}
                              checked={quizAnswers[i] === opt}
                              onChange={() => {
                                const next = [...quizAnswers];
                                next[i] = opt;
                                setQuizAnswers(next);
                              }}
                              className="accent-notion-blue"
                            />
                            {opt}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <textarea
                          value={quizAnswers[i] || ''}
                          onChange={(e) => {
                            const next = [...quizAnswers];
                            next[i] = e.target.value;
                            setQuizAnswers(next);
                          }}
                          placeholder={
                            q.passing_criteria_hint
                              ? `${q.passing_criteria_hint}（建议 50 字以上）`
                              : '请详细描述你的理解和具体做法（建议 50 字以上）...'
                          }
                          className="notion-input w-full h-24 rounded-lg text-sm resize-none"
                        />
                        <div className="flex justify-between px-0.5">
                          <span className="text-xs text-notion-warm-gray-300">
                            提示：越具体越容易通过
                          </span>
                          <span className={`text-xs ${(quizAnswers[i] || '').length < 30 ? 'text-notion-warm-gray-300' : 'text-notion-warm-gray-500'}`}>
                            {(quizAnswers[i] || '').length} 字
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-4">
              {!quizResult ? (
                <>
                  <button onClick={() => setQuizOpen(false)} className="notion-btn-secondary px-4 py-2">
                    取消
                  </button>
                  <button
                    onClick={handleSubmitQuiz}
                    disabled={quizSubmitting}
                    className="notion-btn-primary px-6 py-2 disabled:opacity-50"
                  >
                    {quizSubmitting ? '评估中...' : '提交考核'}
                  </button>
                </>
              ) : quizResult.passed ? (
                <button onClick={() => setQuizOpen(false)} className="notion-btn-primary px-6 py-2">
                  继续
                </button>
              ) : (
                <button onClick={() => { setQuizOpen(false); }} className="notion-btn-primary px-6 py-2">
                  继续学习
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Final Exam Modal */}
      {examOpen && examData && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-notion-featured shadow-notion-deep w-full max-w-lg max-h-[90vh] sm:max-h-[80vh] overflow-y-auto p-4 sm:p-6">
            <h3 className="text-[17px] font-bold text-notion-black mb-1" style={{ letterSpacing: '-0.25px' }}>
              最终考核
            </h3>
            <p className="text-sm text-notion-warm-gray-500 mb-4">综合评估你的学习成果</p>

            {examResult ? (
              <div className={`p-4 rounded-lg mb-4 border ${
                examResult.passed
                  ? 'bg-green-50/60 border-notion-green/20'
                  : 'bg-red-50/60 border-red-300/40'
              }`}>
                <p className={`font-semibold text-lg ${examResult.passed ? 'text-notion-green' : 'text-red-600'}`}>
                  {examResult.passed ? '恭喜通过！' : '未通过'}
                </p>
                <p className="text-sm text-notion-warm-gray-500 mt-1">总分：{examResult.total_score}分</p>
                {examResult.report && (
                  <p className="text-sm text-notion-warm-gray-500 mt-2 whitespace-pre-wrap">{examResult.report}</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {examData.map((q, i) => (
                  <div key={i} className="p-4 rounded-lg bg-notion-warm-white/60 border border-black/5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="notion-badge" style={{
                        background: q.type === 'knowledge' ? '#f2f9ff' : '#f0fdf4',
                        color: q.type === 'knowledge' ? '#0075de' : '#1aae39',
                      }}>
                        {q.type === 'knowledge' ? '知识' : '反思'}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-notion-black mb-2">{q.question}</p>
                    <textarea
                      value={examAnswers[i] || ''}
                      onChange={(e) => {
                        const next = [...examAnswers];
                        next[i] = e.target.value;
                        setExamAnswers(next);
                      }}
                      placeholder={
                        q.type === 'knowledge'
                          ? '结合你学到的知识，给出详细的解释和举例（建议 80 字以上）...'
                          : '描述你的真实经历、感受和具体改善行动（建议 80 字以上）...'
                      }
                      className="notion-input w-full h-24 rounded-lg text-sm resize-none"
                    />
                    <div className="flex justify-between mt-1 px-0.5">
                      <span className="text-xs text-notion-warm-gray-300">
                        {q.type === 'knowledge' ? '提示：包含概念解释 + 实际应用' : '提示：包含具体事例 + 反思总结'}
                      </span>
                      <span className={`text-xs ${(examAnswers[i] || '').length < 50 ? 'text-notion-warm-gray-300' : 'text-notion-warm-gray-500'}`}>
                        {(examAnswers[i] || '').length} 字
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-4">
              {!examResult ? (
                <>
                  <button onClick={() => setExamOpen(false)} className="notion-btn-secondary px-4 py-2">
                    取消
                  </button>
                  <button
                    onClick={handleSubmitFinalExam}
                    disabled={examSubmitting}
                    className="notion-btn-primary px-6 py-2 disabled:opacity-50"
                    style={{ background: '#dd5b00' }}
                    onMouseEnter={e => e.target.style.background = '#b34900'}
                    onMouseLeave={e => e.target.style.background = '#dd5b00'}
                  >
                    {examSubmitting ? '评估中...' : '提交最终考核'}
                  </button>
                </>
              ) : (
                <button onClick={() => setExamOpen(false)} className="notion-btn-primary px-6 py-2">
                  关闭
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Midterm Recheck Modal */}
      {midtermOpen && midtermQuestions.length > 0 && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-notion-featured shadow-notion-deep w-full max-w-lg max-h-[90vh] sm:max-h-[80vh] overflow-y-auto p-4 sm:p-6">
            <h3 className="text-[17px] font-bold text-notion-black mb-1" style={{ letterSpacing: '-0.25px' }}>
              学习进度复查
            </h3>
            <p className="text-sm text-notion-warm-gray-500 mb-4">看看你之前的弱点是否有改善</p>

            <div className="space-y-3">
              {midtermQuestions.map((q, i) => (
                <div key={i} className="p-4 rounded-lg bg-notion-warm-white/60 border border-black/5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="notion-badge text-[10px]" style={{ background: '#f3e8ff', color: '#7c3aed' }}>
                      {q.weakness}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-notion-black mb-3">{q.question}</p>
                  <div className="space-y-1">
                    {['从不', '很少', '有时', '经常', '总是'].map((opt, j) => (
                      <label key={j} className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm transition-colors ${
                        midtermAnswers[i] === opt ? 'bg-purple-50 text-purple-700' : 'hover:bg-notion-warm-white'
                      }`}>
                        <input
                          type="radio"
                          name={`midterm_q${i}`}
                          value={opt}
                          checked={midtermAnswers[i] === opt}
                          onChange={() => {
                            const next = [...midtermAnswers];
                            next[i] = opt;
                            setMidtermAnswers(next);
                          }}
                          className="accent-purple-600"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => { setMidtermOpen(false); handleMidtermDismiss(); }} className="notion-btn-secondary px-4 py-2">
                跳过
              </button>
              <button
                onClick={() => {
                  const allAnswered = midtermAnswers.every(a => a);
                  if (!allAnswered) { setErrorMsg('请回答所有问题'); return; }
                  setMidtermOpen(false);
                  handleMidtermDismiss();
                  const summary = midtermQuestions.map((q, i) => `${q.weakness}：${midtermAnswers[i]}`).join('，');
                  setMessages(prev => [...prev, { role: 'assistant', content: `📊 中期复查结果：${summary}\n\n你已经走了这么远，继续保持！如果有任何困惑，随时和我聊。` }]);
                }}
                className="notion-btn-primary px-6 py-2"
                style={{ background: '#7c3aed' }}
              >
                查看结果
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
