const BASE = '/api';

// Token management
function getToken() {
  return localStorage.getItem('tutor_access_token') || '';
}

function getRefreshToken() {
  return localStorage.getItem('tutor_refresh_token') || '';
}

function setTokens(access, refresh) {
  localStorage.setItem('tutor_access_token', access);
  if (refresh) localStorage.setItem('tutor_refresh_token', refresh);
}

function clearTokens() {
  localStorage.removeItem('tutor_access_token');
  localStorage.removeItem('tutor_refresh_token');
  localStorage.removeItem('tutor_user_id');
}

// Active user ID — stored in localStorage
function getUserId() {
  return parseInt(localStorage.getItem('tutor_user_id') || '0', 10);
}

function setUserId(id) {
  localStorage.setItem('tutor_user_id', String(id));
}

let isRefreshing = false;
let refreshPromise = null;

async function refreshAccessToken() {
  if (isRefreshing) return refreshPromise;
  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const rt = getRefreshToken();
      if (!rt) throw new Error('No refresh token');
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTokens(data.access, data.refresh);
      return data.access;
    } catch {
      clearTokens();
      window.location.href = '/';
      throw new Error('登录已过期，请重新登录');
    } finally {
      isRefreshing = false;
    }
  })();
  return refreshPromise;
}

async function request(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(`${BASE}${url}`, {
    headers,
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`服务器返回非JSON响应 (HTTP ${res.status})`);
  }
  if (res.status === 401 && token && !url.includes('/auth/')) {
    // Try refreshing token once
    const newToken = await refreshAccessToken();
    const retryRes = await fetch(`${BASE}${url}`, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${newToken}` },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    try {
      data = await retryRes.json();
    } catch {
      throw new Error(`服务器返回非JSON响应 (HTTP ${retryRes.status})`);
    }
    if (!retryRes.ok) throw new Error(data.error || '请求失败');
    return data;
  }
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

export const getState = () => request('/state');
export const setMode = (mode) => request('/state/set_mode', { method: 'POST', body: { mode } });
export const classifyGoal = (goal) => request('/state/classify_goal', { method: 'POST', body: { goal } });

export const startDiagnose = () => request('/diagnose/start', { method: 'POST' });
export const submitDiagnoseAnswer = (questionId, answer, score, maxScore) =>
  request('/diagnose/answer', { method: 'POST', body: { question_id: questionId, answer, score, max_score: maxScore } });

// Assessment API (new standardized system)
export const startAssessment = (mode, domain) => request('/assessment/start', { method: 'POST', body: { mode, domain } });
export const submitAssessmentAnswer = (sessionId, itemId, responseText) =>
  request('/assessment/answer', { method: 'POST', body: { session_id: sessionId, item_id: itemId, response_text: responseText } });
export const completeAssessment = (sessionId) =>
  request('/assessment/complete', { method: 'POST', body: { session_id: sessionId } });
export const getAssessmentReport = (sessionId) =>
  request('/assessment/report', { method: 'POST', body: { session_id: sessionId } });
export const getLatestAssessmentReport = () => request('/assessment/report');
export const resumeAssessment = () => request('/assessment/resume');
export const submitSelfRatings = (sessionId, ratings) =>
  request('/diagnose/self-rate', { method: 'POST', body: { session_id: sessionId, ratings } });
export const submitValidationAnswers = (sessionId, answers) =>
  request('/diagnose/validate', { method: 'POST', body: { session_id: sessionId, answers } });

// Deep Assessment API (Stage 2: AI follow-up)
export const startDeepAssessment = (sessionId) =>
  request('/deep-assessment/start', { method: 'POST', body: { session_id: sessionId } });
export const startDeepChat = (sessionId) =>
  request('/deep-assessment/chat/start', { method: 'POST', body: { session_id: sessionId } });
export const chatDeep = (sessionId, message) =>
  request('/deep-assessment/chat', { method: 'POST', body: { session_id: sessionId, message } });
export const resumeDeepChat = () => request('/deep-assessment/chat/resume');
export const submitDeepAnswer = (sessionId, round, answers) =>
  request('/deep-assessment/answer', { method: 'POST', body: { session_id: sessionId, round, answers } });
export const getDeepProfile = () => request('/deep-assessment/profile');

export const generatePlan = (goal) => request('/plan/generate_plan', { method: 'POST', body: { goal } });
export const savePlan = (plan) => request('/plan/save_plan', { method: 'POST', body: { plan } });

export const chat = (message) => request('/chat', { method: 'POST', body: { message } });

export const completeStep = (stepId) => request('/step/complete_step', { method: 'POST', body: { step_id: stepId } });

// Insights
export const getInsights = (status) => request(`/insights${status ? `?status=${status}` : ''}`);
export const getMirrorMoment = () => request('/insights/mirror');
export const reactToInsight = (id, action, reflection) =>
  request(`/insights/${id}/reflect`, { method: 'POST', body: { action, reflection } });
export const submitQuiz = (stepId, answers, quiz) => request('/step/submit_quiz', { method: 'POST', body: { step_id: stepId, answers, quiz } });

export const startFinalExam = () => request('/final_exam', { method: 'POST' });
export const submitFinalExam = (answers) => request('/final_exam/submit', { method: 'POST', body: { answers } });

// User management
export const getUsers = () => request('/users');
export const createUser = (name) => request('/users', { method: 'POST', body: { name } });
export const updateUser = (id, data) => request(`/users/${id}`, { method: 'PATCH', body: data });
export const deleteUser = (id) => request(`/users/${id}`, { method: 'DELETE' });

// Auth API
export const register = async (nickname, password) => {
  const data = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname, password }),
  }).then(r => r.json());
  if (!data.access) throw new Error(data.error || '注册失败');
  setTokens(data.access, data.refresh);
  setUserId(data.user.id);
  return data.user;
};

export const login = async (nickname, password) => {
  const data = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname, password }),
  }).then(r => r.json());
  if (!data.access) throw new Error(data.error || '登录失败');
  setTokens(data.access, data.refresh);
  setUserId(data.user.id);
  return data.user;
};

export const loginAsGuest = async () => {
  const data = await fetch(`${BASE}/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }).then(r => r.json());
  if (!data.access) throw new Error(data.error || '访客登录失败');
  setTokens(data.access, data.refresh);
  setUserId(data.user.id);
  return data.user;
};

export const isLoggedIn = () => !!getToken();

export const logout = () => {
  clearTokens();
  window.location.href = '/';
};

export { getUserId, setUserId, getToken, clearTokens };
