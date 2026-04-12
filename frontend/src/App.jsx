import { useState, useEffect, Component } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { getState, getUserId, setUserId, isLoggedIn, clearTokens } from './api.js';
import Diagnosis from './components/Diagnosis.jsx';
import GoalSetting from './components/GoalSetting.jsx';
import PlanEditor from './components/PlanEditor.jsx';
import StudyDashboard from './components/StudyDashboard.jsx';
import FinalReport from './components/FinalReport.jsx';
import UserSwitcher from './components/UserSwitcher.jsx';
import ConsultationChat from './components/ConsultationChat.jsx';

// Error Boundary — catches rendering errors to prevent white screen
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-white p-8">
          <div className="text-center max-w-md">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-lg font-bold text-notion-black mb-2">页面出了点问题</h2>
            <p className="text-sm text-notion-warm-gray-500 mb-4">{this.state.error?.message || '未知错误'}</p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/'; }}
              className="notion-btn-primary px-6 py-2"
            >
              返回首页
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showUserSwitch, setShowUserSwitch] = useState(false);

  const refresh = async () => {
    if (!isLoggedIn()) {
      setShowUserSwitch(true);
      setLoading(false);
      return;
    }
    try {
      const s = await getState();
      setState(s);
    } catch (e) {
      console.error('Failed to load state:', e);
      clearTokens();
      setShowUserSwitch(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-notion-warm-gray-500 text-base">加载中...</div>
      </div>
    );
  }

  if (showUserSwitch || !state) {
    return <UserSwitcher />;
  }

  // Determine which view to show based on state
  const hasGoal = !!state.user?.goal;
  const isConsultation = state.user?.mode === 'consultation';
  const hasWeaknesses = state.weaknesses && state.weaknesses.length > 0;
  const hasPlan = state.plan && state.plan.steps && state.plan.steps.length > 0;
  const allDone = state.progress === 100 && hasPlan;
  const passed = state.final_exam_passed;

  const handleSwitchUser = () => {
    setShowUserSwitch(true);
  };

  return (
    <ErrorBoundary>
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-black/10 sticky top-0 z-50">
        <div className="max-w-notion mx-auto px-6 h-14 flex items-center justify-between">
          <h1
            className="text-[17px] font-bold text-notion-black cursor-pointer"
            style={{ letterSpacing: '-0.25px' }}
            onClick={() => window.location.href = '/'}
          >
            个人成长导师
          </h1>
          <div className="flex items-center gap-4">
            {hasPlan && !isConsultation && (
              <span className="text-sm text-notion-warm-gray-500">
                进度 {state.progress}%
              </span>
            )}
            <button
              onClick={handleSwitchUser}
              className="flex items-center gap-2 text-[15px] font-medium text-notion-warm-gray-500 hover:text-notion-black transition-colors"
            >
              <span className="w-6 h-6 rounded-full bg-notion-warm-white flex items-center justify-center text-xs font-bold text-notion-black">
                {(state.user?.name || 'U').charAt(0).toUpperCase()}
              </span>
              {state.user?.name || '用户'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-notion mx-auto px-6 py-8">
        <Routes>
          {!hasGoal ? (
            <>
              <Route path="/goal" element={<GoalSetting refresh={refresh} />} />
              <Route path="*" element={<Navigate to="/goal" replace />} />
            </>
          ) : isConsultation ? (
            /* Consultation mode: assessment first, then skip plan → direct chat */
            <>
              <Route path="/consult" element={<ConsultationChat state={state} refresh={refresh} />} />
              <Route path="/diagnose" element={<Diagnosis refresh={refresh} isReassessment={false} />} />
              <Route path="/goal" element={<GoalSetting refresh={refresh} />} />
              <Route path="*" element={<Navigate to={hasWeaknesses ? '/consult' : '/diagnose'} replace />} />
            </>
          ) : !hasWeaknesses ? (
            <>
              <Route path="/diagnose" element={<Diagnosis refresh={refresh} isReassessment={false} />} />
              <Route path="*" element={<Navigate to="/diagnose" replace />} />
            </>
          ) : !hasPlan ? (
            <>
              <Route path="/diagnose" element={<Diagnosis refresh={refresh} isReassessment={true} />} />
              <Route path="/plan" element={<PlanEditor state={state} refresh={refresh} />} />
              <Route path="*" element={<Navigate to="/plan" replace />} />
            </>
          ) : passed ? (
            <>
              <Route path="/diagnose" element={<Diagnosis refresh={refresh} isReassessment={true} />} />
              <Route path="/report" element={<FinalReport state={state} />} />
              <Route path="*" element={<Navigate to="/report" replace />} />
            </>
          ) : (
            <>
              <Route path="/diagnose" element={<Diagnosis refresh={refresh} isReassessment={true} />} />
              <Route path="/study" element={<StudyDashboard state={state} refresh={refresh} />} />
              <Route path="*" element={<Navigate to="/study" replace />} />
            </>
          )}
        </Routes>
      </main>
    </div>
    </ErrorBoundary>
  );
}
