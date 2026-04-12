import { useState, useRef, useEffect, useCallback } from 'react';
import { startDiagnose, submitDiagnoseAnswer, submitAssessmentAnswer, completeAssessment, submitSelfRatings, submitValidationAnswers, resumeAssessment } from '../api.js';
import ScaleSelector from './ScaleSelector.jsx';
import DeepAssessment from './DeepAssessment.jsx';

const AUTO_ADVANCE_MS = 500;

export default function Diagnosis({ refresh, isReassessment }) {
  // Common state
  const [phase, setPhase] = useState('idle'); // idle | loading | self_rating | answering | validating | generating | done
  const [weaknesses, setWeaknesses] = useState([]);
  const [scaleScores, setScaleScores] = useState(null);
  const [strengths, setStrengths] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [showDeepAssessment, setShowDeepAssessment] = useState(false);

  // Character/integrated mode — all items cached locally
  const [sessionId, setSessionId] = useState(null);
  const [allItems, setAllItems] = useState([]);       // all questions from server
  const [answers, setAnswers] = useState({});           // { itemId: responseText }
  const [navIndex, setNavIndex] = useState(0);          // current position
  const [scales, setScales] = useState([]);             // scale metadata for display
  const [showScaleInfo, setShowScaleInfo] = useState(false);
  const autoTimerRef = useRef(null);

  // Skill mode — self rating
  const [mode, setMode] = useState(null);
  const [domain, setDomain] = useState('');
  const [knowledgeAreas, setKnowledgeAreas] = useState([]);
  const [selfRatings, setSelfRatings] = useState({});

  // Skill mode — validation
  const [validateItems, setValidateItems] = useState([]);
  const [validationAnswers, setValidationAnswers] = useState({});

  // Derived: how far the user has answered (count of answered items, since they answer in order)
  const highestAnswered = Object.keys(answers).length;

  const currentItem = allItems[navIndex] || null;
  const currentAnswer = currentItem ? answers[currentItem.item_id] : undefined;
  const selectedOption = currentAnswer !== undefined
    ? currentItem.options.indexOf(currentAnswer)
    : null;

  // Clear auto-advance timer on unmount
  useEffect(() => () => clearTimeout(autoTimerRef.current), []);

  // On mount: check for in-progress assessment to resume
  useEffect(() => {
    if (phase !== 'idle') return;
    resumeAssessment()
      .then(data => {
        if (!data.has_session) return;
        if (data.mode === 'skill') {
          setMode('skill');
          setDomain(data.domain);
          setSessionId(data.session_id);
          if (data.phase === 'self_rating' && data.template) {
            setKnowledgeAreas(data.template.knowledge_areas || []);
            setPhase('self_rating');
          } else if (data.phase === 'validation') {
            setSelfRatings(data.self_ratings || {});
            setValidateItems(data.validate_areas || []);
            setPhase('validating');
          }
        } else {
          // character / integrated
          setMode(data.mode);
          setSessionId(data.session_id);
          setAllItems(data.items || []);
          setAnswers(data.answers || {});
          setNavIndex(data.answered_count || 0);
          setPhase('answering');
        }
      })
      .catch(() => {}); // No active session — user starts fresh
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (phase !== 'answering' || allItems.length === 0) return;

    const handler = (e) => {
      if (e.key === 'ArrowLeft' && navIndex > 0) {
        clearTimeout(autoTimerRef.current);
        setNavIndex(i => i - 1);
      }
      if (e.key === 'ArrowRight' && navIndex < allItems.length - 1 && answers[allItems[navIndex]?.item_id]) {
        // Only allow forward if current item is answered
        clearTimeout(autoTimerRef.current);
        setNavIndex(i => i + 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, navIndex, allItems, answers]);

  const handleStart = async () => {
    if (isReassessment) {
      if (!confirm('重新评估将覆盖之前的评估结果。确定要重新开始吗？')) return;
    }
    setPhase('loading');
    try {
      const data = await startDiagnose();
      setMode(data.mode);

      if (data.mode === 'skill' && data.phase === 'self_rating') {
        setSessionId(data.session_id);
        setDomain(data.domain);
        setKnowledgeAreas(data.knowledge_areas);
        setPhase('self_rating');
      } else if (data.phase === 'scale') {
        // New format: all items upfront
        setSessionId(data.session_id);
        setAllItems(data.items);
        setScales(data.scales || []);
        setAnswers({});
        setNavIndex(0);
        setPhase('answering');
      } else {
        // Legacy fallback (AI-generated questions)
        setSessionId(null);
        setAllItems([{
          item_id: data.question_id,
          question: data.question,
          options: data.options,
          dimension: data.dimension,
          sub_dimension: data.sub_dimension,
          type: data.type,
          index: 0,
          total: data.total,
        }]);
        setAnswers({});
        setNavIndex(0);
        setPhase('answering');
      }
    } catch (e) {
      alert(e.message);
      setPhase('idle');
    }
  };

  // Handle option selection → save answer + auto-advance
  const handleSelectOption = useCallback((idx) => {
    if (!currentItem) return;
    const responseText = currentItem.options[idx];

    // Save answer locally
    setAnswers(prev => ({ ...prev, [currentItem.item_id]: responseText }));

    // Fire-and-forget submit to backend
    if (sessionId) {
      submitAssessmentAnswer(sessionId, currentItem.item_id, responseText).catch(() => {});
    }

    // Auto-advance after delay (unless last item)
    clearTimeout(autoTimerRef.current);
    if (navIndex < allItems.length - 1) {
      autoTimerRef.current = setTimeout(() => {
        setNavIndex(prev => prev + 1);
      }, AUTO_ADVANCE_MS);
    } else {
      // Last item — auto-complete after delay
      autoTimerRef.current = setTimeout(() => {
        handleComplete();
      }, AUTO_ADVANCE_MS);
    }
  }, [currentItem, sessionId, navIndex, allItems.length]);

  // Complete assessment
  const handleComplete = async () => {
    clearTimeout(autoTimerRef.current);
    setPhase('generating');
    try {
      if (sessionId) {
        const report = await completeAssessment(sessionId);
        setWeaknesses(report.weaknesses || []);
        setScaleScores(report.scale_scores || null);
        setStrengths(report.strengths || []);
      }
    } catch {
      // Report generation might fail
    }
    setPhase('done');
  };

  // Legacy answer handler (for AI-generated questions)
  const handleLegacySubmit = async (idx) => {
    if (!currentItem) return;
    const answer = currentItem.options[idx];
    const score = idx + 1;
    const maxScore = currentItem.options.length;

    setSubmitting(true);
    try {
      const data = await submitDiagnoseAnswer(navIndex, answer, score, maxScore);
      if (data.done) {
        setWeaknesses(data.weaknesses);
        setScaleScores(data.scale_scores || null);
        setPhase('done');
      } else {
        setAllItems(prev => [...prev, {
          item_id: data.question_id,
          question: data.next_question,
          options: data.options,
          dimension: data.dimension,
          sub_dimension: data.sub_dimension,
          type: data.type,
          index: navIndex + 1,
          total: data.total,
        }]);
        setNavIndex(prev => prev + 1);
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Skill: submit self-ratings
  const handleSubmitSelfRatings = async () => {
    if (Object.keys(selfRatings).length < knowledgeAreas.length) {
      alert('请为所有知识区域评分');
      return;
    }
    setSubmitting(true);
    try {
      const data = await submitSelfRatings(sessionId, selfRatings);
      if (data.items && data.items.length > 0) {
        setValidateItems(data.items);
        setValidationAnswers({});
        setPhase('validating');
      } else {
        const result = await submitValidationAnswers(sessionId, []);
        setWeaknesses(result.weaknesses || []);
        setStrengths(result.strengths || []);
        setPhase('done');
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Skill: submit validation answers
  const handleSubmitValidation = async () => {
    setSubmitting(true);
    try {
      const answers = Object.entries(validationAnswers).map(([itemId, answer]) => ({
        item_id: itemId,
        answer,
      }));
      const result = await submitValidationAnswers(sessionId, answers);
      setWeaknesses(result.weaknesses || []);
      setStrengths(result.strengths || []);
      setPhase('done');
    } catch (e) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ========================
  // Render phases
  // ========================

  if (phase === 'idle') {
    return (
      <div className="max-w-xl mx-auto text-center py-8">
        <div className="text-6xl mb-6">🔍</div>
        <h2 className="text-[26px] font-bold text-notion-black mb-3" style={{ letterSpacing: '-0.625px', lineHeight: 1.23 }}>
          综合评估
        </h2>
        <p className="text-base text-notion-warm-gray-500 mb-4">
          基于标准化心理量表和领域知识评估，科学测量你的成长状态
        </p>
        <div className="flex items-center justify-center gap-4 mb-8 text-sm text-notion-warm-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-notion-warm-white flex items-center justify-center text-xs">⏱</span>
            约 5-8 分钟
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-notion-warm-white flex items-center justify-center text-xs">📊</span>
            标准化量表，可追踪进步
          </span>
        </div>
        <button onClick={handleStart} className="notion-btn-primary px-8 py-2.5">
          开始评估
        </button>
      </div>
    );
  }

  if (phase === 'loading' || phase === 'generating') {
    return (
      <div className="max-w-xl mx-auto text-center py-20">
        <div className="animate-spin text-4xl mb-4">⏳</div>
        <p className="text-notion-warm-gray-500">
          {phase === 'loading' ? '正在加载评估量表...' : '正在生成评估报告...'}
        </p>
      </div>
    );
  }

  // ========================
  // Skill: Self-rating phase
  // ========================
  if (phase === 'self_rating') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="notion-badge">技能评估</span>
            <span className="text-sm text-notion-warm-gray-500">{domain}</span>
          </div>
          <h3 className="text-[20px] font-bold text-notion-black">知识掌握程度自评</h3>
          <p className="text-sm text-notion-warm-gray-500 mt-1">
            为以下知识区域评估你目前的掌握程度（0=完全不了解，5=精通）
          </p>
        </div>

        <div className="space-y-3">
          {knowledgeAreas.map((area) => (
            <div key={area.id} className="notion-card p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold text-notion-black">{area.name}</p>
                  <p className="text-xs text-notion-warm-gray-500">{area.prompt}</p>
                </div>
                <span className="notion-badge text-[10px]">{area.bloom_level}</span>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <span className="text-xs text-notion-warm-gray-300">0</span>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="1"
                  value={selfRatings[area.id] ?? 2}
                  onChange={(e) => setSelfRatings(prev => ({ ...prev, [area.id]: parseInt(e.target.value) }))}
                  className="flex-1 accent-notion-blue"
                />
                <span className="text-xs text-notion-warm-gray-300">5</span>
                <span className="text-sm font-bold text-notion-blue w-6 text-right">{selfRatings[area.id] ?? 2}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end mt-4">
          <button
            onClick={handleSubmitSelfRatings}
            disabled={submitting}
            className="notion-btn-primary px-6 py-2 disabled:opacity-50"
          >
            {submitting ? '处理中...' : '提交自评'}
          </button>
        </div>
      </div>
    );
  }

  // ========================
  // Skill: Validation phase
  // ========================
  if (phase === 'validating') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h3 className="text-[20px] font-bold text-notion-black">知识验证</h3>
          <p className="text-sm text-notion-warm-gray-500 mt-1">
            请回答以下问题，帮助我们验证你的自评结果
          </p>
        </div>

        <div className="space-y-4">
          {validateItems.map((item) => (
            <div key={item.id} className="notion-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="notion-badge text-[10px]" style={{ background: '#f2f9ff', color: '#0075de' }}>
                  {item.area_name}
                </span>
                <span className="notion-badge text-[10px]">{item.bloom_level}</span>
              </div>
              <p className="text-sm text-notion-black mb-3">{item.question}</p>
              <textarea
                value={validationAnswers[item.id] || ''}
                onChange={(e) => setValidationAnswers(prev => ({ ...prev, [item.id]: e.target.value }))}
                placeholder="请详细描述你的理解（建议 50 字以上）..."
                className="notion-input w-full h-24 rounded-lg text-sm resize-none"
              />
              <div className="flex justify-end mt-1">
                <span className={`text-xs ${(validationAnswers[item.id] || '').length < 30 ? 'text-notion-warm-gray-300' : 'text-notion-warm-gray-500'}`}>
                  {(validationAnswers[item.id] || '').length} 字
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end mt-4">
          <button
            onClick={handleSubmitValidation}
            disabled={submitting}
            className="notion-btn-primary px-6 py-2 disabled:opacity-50"
          >
            {submitting ? '分析中...' : '提交验证'}
          </button>
        </div>
      </div>
    );
  }

  // ========================
  // Done phase — with scale scores
  // ========================
  if (phase === 'done') {
    // Deep Assessment overlay
    if (showDeepAssessment) {
      return (
        <DeepAssessment
          assessmentSessionId={sessionId}
          weaknesses={weaknesses}
          isConsultation={mode === 'consultation'}
          onDone={(profile) => {
            // Profile saved; proceed to next step
            refresh();
            window.location.href = mode === 'consultation' ? '/consult' : '/plan';
          }}
          onSkip={() => {
            refresh();
            window.location.href = mode === 'consultation' ? '/consult' : '/plan';
          }}
        />
      );
    }

    return (
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-[26px] font-bold text-notion-black mb-2" style={{ letterSpacing: '-0.625px', lineHeight: 1.23 }}>
            评估完成
          </h2>
          <p className="text-base text-notion-warm-gray-500">
            发现了 {weaknesses.length} 个需要改善的方面
          </p>
        </div>

        {scaleScores && Object.keys(scaleScores).length > 0 && (
          <div className="notion-card p-6 mb-4">
            <h3 className="text-sm font-bold text-notion-black mb-4">量表评分</h3>
            <div className="space-y-3">
              {Object.entries(scaleScores).map(([id, s]) => (
                <div key={id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-notion-black">{s.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold" style={{ color: s.color }}>{s.label}</span>
                      <span className="text-xs text-notion-warm-gray-300">{s.avg}/{s.max_per_item}</span>
                      {s.percentile && <span className="text-xs text-notion-warm-gray-300">P{s.percentile}</span>}
                    </div>
                  </div>
                  <div className="w-full bg-black/5 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${(s.avg / s.max_per_item) * 100}%`,
                        backgroundColor: s.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {weaknesses.length > 0 && (
          <div className="notion-card p-6 mb-4">
            <h3 className="text-sm font-bold text-notion-black mb-3">待提升领域</h3>
            <div className="space-y-2">
              {weaknesses.map((w, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-notion-warm-white/60">
                  <span className="notion-badge" style={{
                    background: w.type === 'knowledge' ? '#f2f9ff' : w.type === 'personality' ? '#fff7ed' : '#f0fdf4',
                    color: w.type === 'knowledge' ? '#0075de' : w.type === 'personality' ? '#dd5b00' : '#1aae39',
                  }}>
                    {w.type === 'knowledge' ? '知识' : w.type === 'personality' ? '性格' : '习惯'}
                  </span>
                  <span className="flex-1 text-sm text-notion-black">{w.name}</span>
                  <span className={`text-xs font-semibold ${
                    w.severity === 'high' ? 'text-notion-orange' :
                    w.severity === 'medium' ? 'text-yellow-600' : 'text-notion-green'
                  }`}>
                    {w.severity === 'high' ? '严重' : w.severity === 'medium' ? '中等' : '轻微'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {strengths.length > 0 && (
          <div className="notion-card p-6 mb-4">
            <h3 className="text-sm font-bold text-notion-black mb-3">优势领域</h3>
            <div className="flex flex-wrap gap-2">
              {strengths.map((s, i) => (
                <span key={i} className="notion-badge" style={{ background: '#f0fdf4', color: '#1aae39' }}>
                  {s.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Deep Assessment entry — only for growth mode with weaknesses; consultation skips directly to chat */}
        {mode !== 'consultation' && weaknesses.length > 0 && sessionId ? (
          <div className="notion-card p-5 mb-4 border border-purple-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-purple-50 flex items-center justify-center text-base">🔬</div>
              <div>
                <h4 className="text-[15px] font-bold text-notion-black">深入了解（可选）</h4>
                <p className="text-xs text-notion-warm-gray-400">约 5 分钟，AI 一对一深度对话</p>
              </div>
            </div>
            <p className="text-sm text-notion-warm-gray-500 mb-3 leading-relaxed">
              量表提供了基础数据，但 AI 可以通过深度对话帮你发现行为背后的思维模式。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeepAssessment(true)}
                className="notion-btn-primary px-4 py-1.5 text-sm"
              >
                开始深度探索
              </button>
              <button
                onClick={() => { refresh(); window.location.href = '/plan'; }}
                className="px-4 py-1.5 text-sm text-notion-warm-gray-400 hover:text-notion-warm-gray-600 transition-colors"
              >
                跳过，直接制定计划
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center mt-6">
            <button
              onClick={() => { refresh(); window.location.href = mode === 'consultation' ? '/consult' : '/plan'; }}
              className="notion-btn-primary px-8 py-2.5"
            >
              {mode === 'consultation' ? '开始 AI 咨询' : '制定成长计划'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ========================
  // Answering phase — with auto-advance + arrow navigation
  // ========================
  const total = allItems.length;
  const answeredCount = Object.keys(answers).length;
  const progressPct = total > 0 ? (answeredCount / total) * 100 : 0;
  const isLastItem = navIndex === total - 1;
  const isCurrentAnswered = !!answers[currentItem?.item_id];
  const allAnswered = answeredCount === total;
  const isLegacy = !sessionId;

  const onOptionSelect = (idx) => {
    if (isLegacy) {
      handleLegacySubmit(idx);
    } else {
      handleSelectOption(idx);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Scale info toggle */}
      {scales.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setShowScaleInfo(!showScaleInfo)}
            className="flex items-center gap-1.5 text-xs text-notion-warm-gray-400 hover:text-notion-warm-gray-500 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2"/><path d="M8 7v4M8 5.5v0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            {showScaleInfo ? '收起量表说明' : '本评估使用的量表及科学依据'}
          </button>
          {showScaleInfo && (
            <div className="mt-3 space-y-2">
              {scales.map(s => (
                <div key={s.id} className="notion-card p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-notion-black">{s.name}</span>
                    <span className="text-xs text-notion-warm-gray-400">{s.item_count} 题</span>
                  </div>
                  <p className="text-xs text-notion-warm-gray-500 mb-1">{s.description}</p>
                  <div className="flex items-center gap-3 text-[11px] text-notion-warm-gray-400">
                    <span>Cronbach α = {s.reliability}</span>
                    {s.norms?.general && <span>常模 N = {s.norms.general.n}</span>}
                  </div>
                  <p className="text-[11px] text-notion-warm-gray-300 mt-1 italic">{s.source}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-notion-warm-gray-500 mb-2">
          <span>
            {currentItem?.scale_name ? `${currentItem.scale_name} · ` : ''}
            问题 {navIndex + 1} / {total}
          </span>
          <span>{Math.round(progressPct)}% 已完成</span>
        </div>
        <div className="w-full bg-black/5 rounded-full h-1.5">
          <div
            className="bg-notion-blue h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Question card */}
      <div className="notion-card p-6">
        <div className="flex items-center gap-2 mb-3">
          {currentItem?.dimension && (
            <span className="notion-badge text-[11px]">
              {currentItem.sub_dimension || currentItem.dimension}
            </span>
          )}
          {currentItem?.type && (
            <span className="notion-badge text-[11px]" style={{
              background: currentItem.type === 'knowledge' ? '#f2f9ff'
                : currentItem.type === 'habit' ? '#f0fdf4' : '#fff7ed',
              color: currentItem.type === 'knowledge' ? '#0075de'
                : currentItem.type === 'habit' ? '#1aae39' : '#dd5b00',
            }}>
              {currentItem.type === 'knowledge' ? '知识' : currentItem.type === 'habit' ? '习惯' : '性格'}
            </span>
          )}
          {currentItem?.scale_name && (
            <span className="text-xs text-notion-warm-gray-300">{currentItem.scale_name}</span>
          )}
        </div>
        <p className="text-[17px] text-notion-black leading-relaxed">{currentItem?.question}</p>

        <div className="border-t border-black/5 my-4" />

        <p className="text-xs text-notion-warm-gray-500 mb-3">请选择最符合你实际情况的选项：</p>
        <ScaleSelector
          options={currentItem?.options}
          value={selectedOption}
          onChange={onOptionSelect}
        />
      </div>

      {/* Navigation arrows */}
      <div className="flex items-center justify-between mt-4">
        <button
          onClick={() => { clearTimeout(autoTimerRef.current); setNavIndex(i => i - 1); }}
          disabled={navIndex === 0}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-notion-warm-gray-500 hover:bg-notion-warm-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          上一题
        </button>

        {/* Dot indicators */}
        <div className="flex items-center gap-1">
          {total > 0 && total <= 50 && (
            <div className="flex gap-0.5">
              {allItems.map((item, i) => (
                <div
                  key={item.item_id}
                  className={`w-1.5 h-1.5 rounded-full transition-all cursor-pointer ${
                    i === navIndex
                      ? 'bg-notion-blue w-3'
                      : answers[item.item_id]
                        ? 'bg-notion-blue/40'
                        : 'bg-black/10'
                  }`}
                  onClick={() => {
                    // Only navigate to answered items or current boundary
                    if (i <= highestAnswered || i === navIndex) {
                      clearTimeout(autoTimerRef.current);
                      setNavIndex(i);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {allAnswered && isLastItem ? (
          <button
            onClick={handleComplete}
            className="notion-btn-primary px-6 py-2"
          >
            查看报告
          </button>
        ) : isCurrentAnswered && navIndex < total - 1 ? (
          <button
            onClick={() => { clearTimeout(autoTimerRef.current); setNavIndex(i => i + 1); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-notion-warm-gray-500 hover:bg-notion-warm-white transition-all"
          >
            下一题
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        ) : (
          <div className="px-4 py-2 text-xs text-notion-warm-gray-300">
            选择后自动进入下一题
          </div>
        )}
      </div>
    </div>
  );
}
