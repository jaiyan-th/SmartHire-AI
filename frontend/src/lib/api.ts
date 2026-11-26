import type {
  AdminOverview,
  AuditLogEntry,
  Evaluation,
  InsightsResponse,
  InterviewSession,
  InterviewTemplate,
  MentorChatHistoryResponse,
  MentorContextSummary,
  MentorMessage,
  RecruiterCandidate,
  ResumeRecord,
  SkillGapResponse,
  User,
} from './types';

const BASE_URL =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE ||
  (typeof window !== 'undefined' && window.location.port === '8000' ? '' : '');

const TOKEN_KEY = 'upskill_token';
const REFRESH_KEY = 'upskill_refresh';
const USER_KEY = 'upskill_user';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

class SmartHireAPIClient {
  baseUrl = BASE_URL;
  private refreshingPromise: Promise<boolean> | null = null;

  getToken(): string | null {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || null;
    } catch {
      return null;
    }
  }

  getRefreshToken(): string | null {
    try {
      return sessionStorage.getItem(REFRESH_KEY) || localStorage.getItem(REFRESH_KEY) || null;
    } catch {
      return null;
    }
  }

  getUser(): User | null {
    try {
      const raw = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  }

  setSession(accessToken: string, user: User, refreshToken?: string | null) {
    try {
      sessionStorage.setItem(TOKEN_KEY, accessToken);
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
      localStorage.setItem(TOKEN_KEY, accessToken);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      if (refreshToken) {
        sessionStorage.setItem(REFRESH_KEY, refreshToken);
        localStorage.setItem(REFRESH_KEY, refreshToken);
      }
    } catch {
      // Storage blocked
    }
  }

  clearSession() {
    try {
      [TOKEN_KEY, REFRESH_KEY, USER_KEY, 'active_interview_session_id'].forEach((k) => {
        sessionStorage.removeItem(k);
        localStorage.removeItem(k);
      });
    } catch {
      // ignore
    }
  }

  private async tryRefreshToken(): Promise<boolean> {
    if (this.refreshingPromise) return this.refreshingPromise;
    const refresh = this.getRefreshToken();
    if (!refresh) return false;

    this.refreshingPromise = (async () => {
      try {
        const resp = await fetch(`${this.baseUrl}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh }),
        });
        if (!resp.ok) return false;
        const data = await resp.json();
        if (data.access) {
          sessionStorage.setItem(TOKEN_KEY, data.access);
          localStorage.setItem(TOKEN_KEY, data.access);
          if (data.refresh) {
            sessionStorage.setItem(REFRESH_KEY, data.refresh);
            localStorage.setItem(REFRESH_KEY, data.refresh);
          }
          return true;
        }
      } catch {
        return false;
      } finally {
        this.refreshingPromise = null;
      }
      return false;
    })();

    return this.refreshingPromise;
  }

  async request<T>(endpoint: string, options: RequestInit = {}, retryOn401 = true): Promise<T> {
    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string>) || {}),
    };
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
        return this.request<T>(endpoint, options, false);
      }
      this.clearSession();
      window.dispatchEvent(new CustomEvent('smarthire:unauthorized'));
      throw new ApiError('Session expired. Please sign in again.', 401);
    }

    if (!response.ok) {
      let msg = `Request failed (${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson.error) msg = String(errJson.error);
        else if (errJson.detail) msg = String(errJson.detail);
        else if (errJson.message) msg = String(errJson.message);
        else {
          const firstKey = Object.keys(errJson)[0];
          if (firstKey) {
            const val = errJson[firstKey];
            msg = `${firstKey}: ${Array.isArray(val) ? val.join(', ') : String(val)}`;
          }
        }
      } catch {
        // fallback message
      }
      throw new ApiError(msg, response.status);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/pdf') || contentType.includes('text/csv')) {
      return (await response.blob()) as unknown as T;
    }
    return (await response.json()) as T;
  }

  // Health
  checkHealth() {
    return this.request<{
      status: string;
      database: string;
      db_latency_ms?: number;
      llm_engine: string;
      speech_engine: string;
      maintenance_mode?: boolean;
    }>('/api/core/health/ready');
  }

  // Auth
  login(email: string, password: string) {
    return this.request<{
      message: string;
      user: User;
      token: string;
      tokens: { access: string; refresh: string };
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  register(data: {
    email: string;
    password: string;
    full_name: string;
    target_role?: string;
    organization?: string;
  }) {
    return this.request<{
      message: string;
      user: User;
      token: string;
      tokens: { access: string; refresh: string };
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
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
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ refresh }),
        });
      } catch {
        // ignore network errors during logout
      }
    }
    this.clearSession();
  }

  getAuthProviders() {
    return this.request<{
      jwt: boolean;
      needs_initial_setup: boolean;
      google_oauth2: { enabled: boolean };
      github_sso: { enabled: boolean };
    }>('/api/auth/providers');
  }

  bootstrapAdmin(data: { email: string; password: string; full_name: string }) {
    return this.request<{
      message: string;
      user: User;
      token: string;
      tokens: { access: string; refresh: string };
    }>('/api/auth/bootstrap-admin', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  getProfile() {
    return this.request<User>('/api/auth/me');
  }

  updateProfile(data: Partial<User>) {
    return this.request<User>('/api/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  deactivateAccount() {
    return this.request<{ message: string }>('/api/auth/me', { method: 'DELETE' });
  }

  changePassword(current_password: string, new_password: string) {
    return this.request<{ message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password }),
    });
  }

  forgotPassword(email: string) {
    return this.request<{ message: string; dev_reset_token?: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  resetPassword(token: string, new_password: string) {
    return this.request<{ message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, new_password }),
    });
  }

  resendVerification() {
    return this.request<{ message: string; verification_token_preview?: string }>('/api/auth/resend-verification', {
      method: 'POST',
    });
  }

  verifyEmail(token: string) {
    return this.request<{ message: string }>('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  exportUserData() {
    return this.request<Record<string, unknown>>('/api/auth/export-data');
  }

  // Resumes
  analyzeResume(payload: FormData | { raw_text: string; target_role: string; job_description?: string }) {
    const body = payload instanceof FormData ? payload : JSON.stringify(payload);
    return this.request<{
      message: string;
      data: ResumeRecord;
      match_score: number;
      skills: Record<string, string[]>;
      missing_skills: string[];
      summary: string;
      experience: Array<{ detail?: string }>;
      education: Array<{ detail?: string }>;
      projects: Array<{ detail?: string }>;
      certifications: Array<{ detail?: string }>;
    }>('/api/resume/analyze', { method: 'POST', body });
  }

  getResumeHistory() {
    return this.request<ResumeRecord[]>('/api/resume/history');
  }

  deleteResume(id: string) {
    return this.request<{ message: string }>(`/api/resume/${id}`, { method: 'DELETE' });
  }

  // Interviews
  startInterview(config: {
    domain: string;
    category: string;
    difficulty: string;
    duration_minutes: number;
    question_count: number;
    focus_skills: string[];
    camera_enabled: boolean;
    recording_consent: boolean;
    template_id?: string;
  }) {
    return this.request<{ message: string; session: InterviewSession; session_id: string }>('/api/interview/start', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  getSession(sessionId: string) {
    return this.request<InterviewSession>(`/api/interview/${sessionId}`);
  }

  submitAnswer(answerData: {
    session_id: string;
    question_id: string;
    input_mode: 'speech' | 'code' | 'text';
    language: string;
    transcript_text: string;
    code_text: string;
    duration_seconds: number;
    eye_contact_percentage: number;
    next_question_index?: number;
  }) {
    return this.request<{
      message: string;
      answer: InterviewSession['answers'][number];
      speech_analysis: {
        word_count: number;
        wpm: number;
        filler_count: number;
        clarity: string;
      };
      next_question_index: number;
    }>('/api/interview/answer', {
      method: 'POST',
      body: JSON.stringify(answerData),
    });
  }

  finishInterview(sessionId: string) {
    return this.request<{
      message: string;
      session_id: string;
      evaluation: Evaluation;
    }>('/api/interview/finish', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    });
  }

  cancelInterview(sessionId: string) {
    return this.request<{ session_id: string; status: string }>(`/api/interview/${sessionId}/cancel`, {
      method: 'POST',
    });
  }

  deleteInterview(sessionId: string) {
    return this.request<{ message: string }>(`/api/interview/${sessionId}`, {
      method: 'DELETE',
    });
  }

  sendProctoringTelemetry(sessionId: string, event_type: string, tab_switches: number) {
    return this.request<{ session_id: string; proctoring_flagged: boolean }>(`/api/interview/${sessionId}/telemetry`, {
      method: 'POST',
      body: JSON.stringify({ event_type, tab_switches }),
    });
  }

  getInterviewHistory() {
    return this.request<InterviewSession[]>('/api/interview/history');
  }

  shareSession(sessionId: string, shared_with_recruiters: boolean) {
    return this.request<{ session_id: string; shared_with_recruiters: boolean }>(`/api/interview/${sessionId}/share`, {
      method: 'PATCH',
      body: JSON.stringify({ shared_with_recruiters }),
    });
  }

  // Evaluations, Analytics, Reports
  getLatestEvaluation(sessionId?: string | null) {
    const q = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
    return this.request<Evaluation>(`/api/evaluations/latest${q}`);
  }

  getInsights(sessionId?: string | null) {
    const q = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
    return this.request<InsightsResponse>(`/api/analytics/insights${q}`);
  }

  getSkillGap() {
    return this.request<SkillGapResponse>('/api/analytics/skill-gap');
  }

  toggleMilestone(milestone_key: string, completed: boolean) {
    return this.request<{ milestone_key: string; completed: boolean }>('/api/analytics/skill-gap/milestone', {
      method: 'PATCH',
      body: JSON.stringify({ milestone_key, completed }),
    });
  }

  downloadPdfReport(sessionId?: string | null) {
    const q = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
    return this.request<Blob>(`/api/reports/download-pdf${q}`);
  }

  verifyDossier(sessionId: string, digest = '') {
    const q = digest ? `?digest=${encodeURIComponent(digest)}` : '';
    return this.request<{
      verified: boolean;
      verification_id: string;
      digest: string;
      candidate_name: string;
      domain: string;
      overall_score: number;
      rating_band: string;
      evaluated_at: string;
    }>(`/api/reports/verify/${sessionId}${q}`);
  }

  // Recruiter
  getRecruiterCandidates(params: Record<string, string> = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request<{
      candidates: RecruiterCandidate[];
      total_count: number;
      stats: {
        evaluated_count: number;
        average_composite: number;
        shortlisted_count: number;
        flagged_count: number;
      };
    }>(`/api/recruiter/candidates${qs ? `?${qs}` : ''}`);
  }

  reviewCandidateSession(sessionId: string, payload: { recruiter_status?: string; recruiter_notes?: string }) {
    return this.request<{
      session_id: string;
      recruiter_status: string;
      recruiter_notes: string;
      proctoring_flagged: boolean;
    }>(`/api/recruiter/candidates/${sessionId}/review`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  assignAssessment(payload: {
    candidate_email: string;
    template_id?: string | null;
    deadline?: string | null;
    domain?: string;
    difficulty?: string;
  }) {
    return this.request<{ message: string; session: InterviewSession }>('/api/recruiter/assign', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  compareCandidates(sessionIds: string[]) {
    return this.request<{
      comparisons: Array<{
        session_id: string;
        candidate_name: string;
        candidate_email: string;
        domain: string;
        difficulty: string;
        recruiter_status: string;
        overall_score: number | null;
        rating_band: string;
        technical_relevance_score: number | null;
        communication_score: number | null;
        confidence_score: number | null;
        professionalism_score: number | null;
      }>;
    }>(`/api/recruiter/compare?session_ids=${encodeURIComponent(sessionIds.join(','))}`);
  }

  exportRecruiterCsv() {
    return this.request<Blob>('/api/recruiter/export-csv');
  }

  getRecruiterTemplates() {
    return this.request<InterviewTemplate[]>('/api/recruiter/templates');
  }

  saveRecruiterTemplate(data: Partial<InterviewTemplate>) {
    return this.request<InterviewTemplate>('/api/recruiter/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  deleteRecruiterTemplate(templateId: string) {
    return this.request<{ message: string }>(`/api/recruiter/templates/${templateId}`, {
      method: 'DELETE',
    });
  }

  // Admin
  getAdminOverview() {
    return this.request<AdminOverview>('/api/admin-terminal/overview');
  }

  getAdminUsers(params: Record<string, string> = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request<User[]>(`/api/admin-terminal/users${qs ? `?${qs}` : ''}`);
  }

  createAdminUser(data: { email: string; password: string; full_name?: string; role: string }) {
    return this.request<User>('/api/admin-terminal/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updateAdminUser(userId: string, data: { role?: string; is_active?: boolean; issue_password_reset?: boolean }) {
    return this.request<User & { reset_token_issued?: boolean }>(`/api/admin-terminal/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  getAdminLogs(level = '', q = '') {
    const params = new URLSearchParams();
    if (level) params.set('level', level);
    if (q) params.set('q', q);
    const qs = params.toString();
    return this.request<AuditLogEntry[]>(`/api/admin-terminal/logs${qs ? `?${qs}` : ''}`);
  }

  getAdminSettings() {
    return this.request<{
      llm_backend: string;
      temperature: number;
      max_tokens: number;
      max_question_count: number;
      daily_token_budget: number;
      maintenance_mode: boolean;
      available_backends: string[];
    }>('/api/admin-terminal/settings');
  }

  updateAdminSettings(settings: {
    llm_backend?: string;
    temperature?: number;
    max_tokens?: number;
    max_question_count?: number;
    daily_token_budget?: number;
    maintenance_mode?: boolean;
  }) {
    return this.request<{ message: string; settings: Record<string, unknown> }>('/api/admin-terminal/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  }

  // Personalized Mentor Chatbot
  getMentorChatHistory() {
    return this.request<MentorChatHistoryResponse>('/api/core/assistant/chat');
  }

  sendMentorChat(message: string, inputSource: 'text' | 'voice' = 'text') {
    return this.request<{
      user_message: MentorMessage;
      assistant_message: MentorMessage;
      context_summary: MentorContextSummary;
      suggested_prompts: string[];
    }>('/api/core/assistant/chat', {
      method: 'POST',
      body: JSON.stringify({ message, input_source: inputSource }),
    });
  }

  clearMentorChat() {
    return this.request<{
      message: string;
      context_summary: MentorContextSummary;
      suggested_prompts: string[];
    }>('/api/core/assistant/chat', {
      method: 'DELETE',
    });
  }
}

export const api = new SmartHireAPIClient();
