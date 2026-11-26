/**
 * SmartHire AI — Production API Client v2
 * Handles authenticated REST requests, JWT refresh rotation, and explicit error propagation.
 */

const USE_REAL_BACKEND = true;
const BASE_URL = window.SMARTHIRE_API_BASE || (window.location.port === '8000' ? '' : 'http://127.0.0.1:8000');

class SmartHireAPI {
  constructor() {
    this.baseUrl = BASE_URL;
    this.useReal = USE_REAL_BACKEND;
  }

  getToken() {
    try {
      return sessionStorage.getItem('upskill_token') || localStorage.getItem('upskill_token') || null;
    } catch (e) {
      return null;
    }
  }

  getRefreshToken() {
    try {
      return sessionStorage.getItem('upskill_refresh') || localStorage.getItem('upskill_refresh') || null;
    } catch (e) {
      return null;
    }
  }

  setSession(accessToken, user, refreshToken = null) {
    try {
      sessionStorage.setItem('upskill_token', accessToken);
      sessionStorage.setItem('upskill_user', JSON.stringify(user));
      localStorage.setItem('upskill_token', accessToken);
      localStorage.setItem('upskill_user', JSON.stringify(user));
      if (refreshToken) {
        sessionStorage.setItem('upskill_refresh', refreshToken);
        localStorage.setItem('upskill_refresh', refreshToken);
      }
    } catch (e) {
      console.warn('Session storage write restricted:', e);
    }
  }

  getUser() {
    try {
      const data = sessionStorage.getItem('upskill_user') || localStorage.getItem('upskill_user');
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  clearSession() {
    try {
      ['upskill_token', 'upskill_refresh', 'upskill_user'].forEach((k) => {
        sessionStorage.removeItem(k);
        localStorage.removeItem(k);
      });
    } catch (e) {}
  }

  async logout() {
    const refresh = this.getRefreshToken();
    const token = this.getToken();
    if (refresh && token) {
      try {
        await fetch(`${this.baseUrl}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ refresh }),
        });
      } catch (e) {}
    }
    this.clearSession();
    window.location.href = 'index.html';
  }

  async tryRefreshToken() {
    const refresh = this.getRefreshToken();
    if (!refresh) return false;
    try {
      const resp = await fetch(`${this.baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      });
      if (!resp.ok) return false;
      const data = await resp.json();
      if (data.access) {
        sessionStorage.setItem('upskill_token', data.access);
        localStorage.setItem('upskill_token', data.access);
        if (data.refresh) {
          sessionStorage.setItem('upskill_refresh', data.refresh);
          localStorage.setItem('upskill_refresh', data.refresh);
        }
        return true;
      }
    } catch (e) {}
    return false;
  }

  async request(endpoint, options = {}, retryOn401 = true) {
    const headers = { ...(options.headers || {}) };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401 && retryOn401 && !endpoint.includes('/auth/')) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        return this.request(endpoint, options, false);
      }
      this.clearSession();
      window.location.href = 'index.html';
      throw new Error('Session expired. Please sign in again.');
    }

    if (!response.ok) {
      let msg = `Request failed (${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson.error) msg = errJson.error;
        else if (errJson.detail) msg = errJson.detail;
        else if (errJson.message) msg = errJson.message;
        else {
          const firstKey = Object.keys(errJson)[0];
          if (firstKey) {
            const val = errJson[firstKey];
            msg = `${firstKey}: ${Array.isArray(val) ? val.join(', ') : val}`;
          }
        }
      } catch (e) {}
      const err = new Error(msg);
      err.status = response.status;
      throw err;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/pdf') || contentType.includes('text/csv')) {
      return await response.blob();
    }
    return await response.json();
  }

  // --- Health ---
  checkHealth() {
    return this.request('/api/core/health/ready');
  }

  // --- Auth & Account Endpoints ---
  login(email, password) {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  register(data) {
    return this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  getProfile() {
    return this.request('/api/auth/me');
  }

  updateProfile(data) {
    return this.request('/api/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  changePassword(current_password, new_password) {
    return this.request('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password }),
    });
  }

  forgotPassword(email) {
    return this.request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  resetPassword(token, new_password) {
    return this.request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, new_password }),
    });
  }

  exportUserData() {
    return this.request('/api/auth/export-data');
  }

  deactivateAccount() {
    return this.request('/api/auth/me', { method: 'DELETE' });
  }

  // --- Resume Endpoints ---
  analyzeResume(formDataOrPayload) {
    const body = formDataOrPayload instanceof FormData ? formDataOrPayload : JSON.stringify(formDataOrPayload);
    return this.request('/api/resume/analyze', { method: 'POST', body });
  }

  getResumeHistory() {
    return this.request('/api/resume/history');
  }

  deleteResume(id) {
    return this.request(`/api/resume/${id}`, { method: 'DELETE' });
  }

  // --- Interview Endpoints ---
  startInterview(config) {
    return this.request('/api/interview/start', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  getSession(sessionId) {
    return this.request(`/api/interview/${sessionId}`);
  }

  submitAnswer(answerData) {
    return this.request('/api/interview/answer', {
      method: 'POST',
      body: JSON.stringify(answerData),
    });
  }

  finishInterview(sessionId) {
    return this.request('/api/interview/finish', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    });
  }

  getInterviewHistory() {
    return this.request('/api/interview/history');
  }

  shareSession(sessionId, shared_with_recruiters) {
    return this.request(`/api/interview/${sessionId}/share`, {
      method: 'PATCH',
      body: JSON.stringify({ shared_with_recruiters }),
    });
  }

  // --- Evaluations & Analytics ---
  getLatestEvaluation(sessionId = null) {
    const q = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
    return this.request(`/api/evaluations/latest${q}`);
  }

  getInsights(sessionId = null) {
    const q = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
    return this.request(`/api/analytics/insights${q}`);
  }

  getSkillGap() {
    return this.request('/api/analytics/skill-gap');
  }

  toggleMilestone(milestone_key, completed) {
    return this.request('/api/analytics/skill-gap/milestone', {
      method: 'PATCH',
      body: JSON.stringify({ milestone_key, completed }),
    });
  }

  // --- Reports ---
  downloadPdfReport(sessionId = null) {
    const q = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
    return this.request(`/api/reports/download-pdf${q}`);
  }

  // --- Recruiter Endpoints ---
  getRecruiterCandidates() {
    return this.request('/api/recruiter/candidates');
  }

  reviewCandidateSession(sessionId, payload) {
    return this.request(`/api/recruiter/candidates/${sessionId}/review`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  assignAssessment(payload) {
    return this.request('/api/recruiter/assign', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  compareCandidates(sessionIds) {
    return this.request(`/api/recruiter/compare?session_ids=${encodeURIComponent(sessionIds.join(','))}`);
  }

  exportRecruiterCsv() {
    return this.request('/api/recruiter/export-csv');
  }

  getRecruiterTemplates() {
    return this.request('/api/recruiter/templates');
  }

  saveRecruiterTemplate(data) {
    return this.request('/api/recruiter/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // --- Admin Endpoints ---
  getAdminOverview() {
    return this.request('/api/admin-terminal/overview');
  }

  getAdminUsers() {
    return this.request('/api/admin-terminal/users');
  }

  updateAdminUser(userId, data) {
    return this.request(`/api/admin-terminal/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  getAdminLogs(level = '') {
    const query = level ? `?level=${encodeURIComponent(level)}` : '';
    return this.request(`/api/admin-terminal/logs${query}`);
  }

  getAdminSettings() {
    return this.request('/api/admin-terminal/settings');
  }

  updateAdminSettings(settings) {
    return this.request('/api/admin-terminal/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  }
}

window.API = new SmartHireAPI();
