export type UserRole = 'candidate' | 'recruiter' | 'admin';

export interface User {
  id: string;
  email: string;
  username: string;
  full_name: string;
  role: UserRole;
  headline: string;
  target_role: string;
  organization: string;
  phone: string;
  bio: string;
  avatar_url: string;
  is_email_verified: boolean;
  recording_consent: boolean;
  webcam_consent: boolean;
  is_active: boolean;
  created_at: string;
}

export interface InterviewQuestion {
  id: string;
  order: number;
  category: string;
  competency: string;
  prompt: string;
  expected_keywords: string[];
}

export interface InterviewAnswer {
  id: string;
  question: string;
  input_mode: 'speech' | 'code' | 'text';
  language: string;
  transcript_text: string;
  code_text: string;
  wpm: number;
  filler_words_count: number;
  filler_words_detected: Array<{ word: string; count: number }>;
  eye_contact_percentage: number;
  duration_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface InterviewSession {
  id: string;
  candidate: string;
  candidate_email: string;
  candidate_name: string;
  domain: string;
  category: string;
  difficulty: string;
  duration_minutes: number;
  focus_skills: string[];
  status: string;
  current_question_index: number;
  total_questions: number;
  proctoring_flagged: boolean;
  camera_enabled: boolean;
  recording_consent: boolean;
  is_recruiter_assigned: boolean;
  shared_with_recruiters: boolean;
  deadline: string | null;
  recruiter_status: string;
  recruiter_notes: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  remaining_total_seconds?: number;
  deadline_passed?: boolean;
  overall_score?: number | null;
  rating_band?: string | null;
  questions: InterviewQuestion[];
  answers: InterviewAnswer[];
}

export interface QuestionEvaluation {
  order: number;
  competency: string;
  prompt: string;
  candidate_response: string;
  model_answer: string;
  critique: string;
  strengths: string;
  improvements: string;
  wpm: number;
  filler_words_count: number;
  score: number;
}

export interface Evaluation {
  id: string;
  session: string;
  has_data?: boolean;
  candidate_name?: string;
  verification_digest?: string;
  session_domain?: string;
  session_difficulty?: string;
  session_date?: string;
  shared_with_recruiters?: boolean;
  communication_score: number;
  confidence_score: number;
  technical_relevance_score: number;
  professionalism_score: number;
  overall_score: number;
  rating_band: string;
  strengths: string[];
  weaknesses: string[];
  improvement_suggestions: string[];
  practice_recommendations: string[];
  learning_resources: Array<{ title: string; url: string; domain?: string }>;
  question_evaluations: QuestionEvaluation[];
  created_at: string;
}

export interface InsightsResponse {
  has_data: boolean;
  session_id?: string;
  domain?: string;
  difficulty?: string;
  shared_with_recruiters?: boolean;
  total_sessions: number;
  overall_score: number;
  rating_band: string;
  pillars: Record<string, { weight: string; score: number; metric: string }>;
  progression: Array<{
    session_id: string;
    session: string;
    overall: number;
    technical: number;
    communication: number;
    confidence: number;
    professionalism: number;
    date: string;
  }>;
  radar: Array<{ subject: string; candidate: number; benchmark: number }>;
  question_evaluations: QuestionEvaluation[];
  history: Array<{
    session_id: string;
    domain: string;
    category: string;
    difficulty: string;
    overall_score: number;
    rating_band: string;
    shared_with_recruiters: boolean;
    date: string;
  }>;
  feedback: {
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
    practice_recommendations?: string[];
    resources: Array<{ title: string; url: string; domain?: string }>;
  };
}

export interface ResumeRecord {
  id: string;
  user: string;
  file_name: string;
  file_size_bytes: number;
  processing_status: string;
  error_message: string;
  target_role: string;
  ats_score: number;
  executive_summary: string;
  skills_extracted: Record<string, string[]>;
  missing_skills: string[];
  experience: Array<{ detail?: string; role?: string }>;
  education: Array<{ detail?: string; degree?: string }>;
  certifications: Array<{ detail?: string }>;
  projects: Array<{ detail?: string }>;
  created_at: string;
}

export interface SkillGapResponse {
  has_data?: boolean;
  target_role: string;
  overall_match_percentage: number;
  missing_skills: string[];
  role_comparison: Array<{
    skill: string;
    required: number;
    candidate: number;
    status: string;
  }>;
  weak_areas: Array<{
    topic: string;
    impact: string;
    detail: string;
    recommendation: string;
  }>;
  roadmap: Array<{
    week: string;
    focus: string;
    milestones: Array<{ key: string; task: string; done: boolean }>;
    resources: Array<{ name: string; url: string }>;
  }>;
}

export interface RecruiterCandidate {
  session_id: string;
  candidate_name: string;
  candidate_email: string;
  domain: string;
  difficulty: string;
  target_role: string;
  date: string;
  scores: {
    overall: number | null;
    technical: number | null;
    communication: number | null;
    confidence: number | null;
    professionalism: number | null;
    rating_band: string;
  };
  proctoring_flagged: boolean;
  recruiter_status: string;
  recruiter_notes: string;
  is_recruiter_assigned: boolean;
  shared_with_recruiters: boolean;
  status: string;
  telemetry: {
    avg_wpm: number;
    total_fillers: number;
    avg_eye_contact: number | null;
    answered_count: number;
    total_questions: number;
  };
  question_evaluations: QuestionEvaluation[];
  strengths: string[];
  weaknesses: string[];
}

export interface InterviewTemplate {
  id: string;
  created_by: string;
  created_by_name: string;
  title: string;
  description: string;
  domain: string;
  level: string;
  category: string;
  duration_minutes: number;
  time_limit_per_question: number;
  question_count: number;
  target_skills: string[];
  is_active: boolean;
  created_at: string;
}

export interface AdminOverview {
  db_status: string;
  db_engine: string;
  db_ping_ms: number | null;
  llm_backend: string;
  integrations?: {
    gemini_configured: boolean;
    groq_configured: boolean;
    openai_configured: boolean;
    ollama_configured: boolean;
    smtp_configured: boolean;
    google_oauth_configured: boolean;
    github_sso_configured: boolean;
  };
  llm_latency_ms: number;
  registered_users: number;
  candidate_count: number;
  recruiter_count: number;
  total_sessions: number;
  total_evaluations: number;
  total_resumes: number;
  token_consumption_total: number;
  estimated_total_cost: string;
  background_jobs_completed: number;
  background_jobs_failed: number;
  maintenance_mode: boolean;
  uptime_seconds: number;
  system_uptime: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'AUTH' | string;
  event_type: string;
  user_email: string;
  message: string;
}

export interface MentorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  input_source: 'text' | 'voice';
  provider: string;
  created_at: string;
}

export interface MentorContextSummary {
  target_role: string;
  has_resume: boolean;
  ats_score: number | null;
  completed_sessions: number;
  latest_score: number | null;
}

export interface MentorChatHistoryResponse {
  messages: MentorMessage[];
  context_summary: MentorContextSummary;
  suggested_prompts: string[];
}
