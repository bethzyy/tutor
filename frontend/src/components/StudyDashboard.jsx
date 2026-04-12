import { useState } from 'react';
import { chat, completeStep, submitQuiz, startFinalExam, submitFinalExam, reactToInsight, getInsights } from '../api.js';
import AchievementBadge from './AchievementBadge.jsx';

export default function StudyDashboard({ state, refresh }) {
  const steps = state.plan?.steps || [];
  const stepStatuses = state.step_statuses || {};
  const currentStepId = state.current_step_id;
  const currentStep = steps.find(s => s.step_id === currentStepId);

  // Chat state — restore from saved history
  const [messages, setMessages] = useState(() => {
    return (state.chat_history || []).map(m => ({ role: m.role, content: m.content }));
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

  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 h-[calc(100vh-8rem)]">
      {/* Error toast */}
      {errorMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-red-50 text-red-600 text-sm px-4 py-2 rounded-lg border border-red-200 shadow-sm animate-pulse"
          onClick={() => setErrorMsg('')}>
          {errorMsg} <span className="text-red-400 ml-2 cursor-pointer">✕</span>
        </div>
      )}
      {/* Left: Step List — collapsible on mobile */}
      <div className={`lg:w-80 shrink-0 notion-card overflow-y-auto ${!sidebarOpen ? 'hidden lg:block' : ''}`}>
        <div className="p-4 border-b border-black/10">
          <h2 className="text-[15px] font-bold text-notion-black">学习计划</h2>
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
              onClick={handleStartFinalExam}
              className="w-full mt-4 p-3 notion-btn-primary rounded-lg text-center"
            >
              开始最终考核
            </button>
          )}

          {/* Insight Panel */}
          <div className="mt-4 pt-3 border-t border-black/10">
            {/* Re-assess button */}
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

            {/* Achievements */}
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

      {/* Right: Chat Area — Notion clean style */}
      <div className="flex-1 notion-card flex flex-col overflow-hidden">
        {/* Mobile sidebar toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="lg:hidden px-4 py-2 border-b border-black/10 text-sm font-medium text-notion-warm-gray-500 hover:bg-notion-warm-white transition-colors"
        >
          {sidebarOpen ? '隐藏计划 ▲' : '显示计划 ▼'}
        </button>
        {/* Current step info */}
        {currentStep && (
          <div className="p-4 border-b border-black/10 bg-notion-warm-white/60">
            <p className="text-xs font-semibold text-notion-blue uppercase tracking-wide">当前步骤</p>
            <p className="text-[15px] font-semibold text-notion-black mt-0.5">{currentStep.title}</p>
            <p className="text-xs text-notion-warm-gray-500 mt-1">
              针对：{currentStep.weaknesses_targeted?.join('、')}
            </p>
          </div>
        )}

        {allDone && (
          <div className="p-4 border-b border-black/10 bg-amber-50/60">
            <p className="text-sm font-semibold text-notion-orange">所有步骤已完成！</p>
            <p className="text-xs text-notion-warm-gray-500 mt-1">点击左侧的"开始最终考核"来检验学习成果</p>
          </div>
        )}

        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-notion-blue text-white rounded-xl rounded-br-sm'
                  : 'bg-notion-warm-white text-notion-black rounded-xl rounded-bl-sm border border-black/10'
              }`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
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
        </div>

        {/* Chat input + action buttons */}
        <div className="p-4 border-t border-black/10">
          <div className="flex gap-2">
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
          </div>
          {currentStep && !allDone && (
            <button
              onClick={handleStartQuiz}
              className="w-full mt-3 notion-btn-primary px-4 py-2 rounded-lg text-center"
              style={{ background: '#1aae39' }}
              onMouseEnter={e => e.target.style.background = '#158a2f'}
              onMouseLeave={e => e.target.style.background = '#1aae39'}
            >
              标记为已完成（开始考核）
            </button>
          )}
        </div>
      </div>

      {/* Quiz Modal — Notion card style */}
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
    </div>
  );
}
