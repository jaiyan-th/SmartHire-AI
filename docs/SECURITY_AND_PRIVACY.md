# SmartHire AI — Security, Threat Model & Privacy Documentation

## 1. Security Controls Implemented

1. **Authentication & Session Management**:
   - Password hashing using Django's PBKDF2-SHA256 (`AUTH_PASSWORD_VALIDATORS` enforcing minimum 8 chars, similarity, common password, and numeric checks).
   - Short-lived JWT access tokens (`120m`) + rotating refresh tokens (`7d`) with **token blacklisting** (`rest_framework_simplejwt.token_blacklist`) on rotation and logout.
   - Generic error messages (`"Invalid email or password."`) and constant-response password recovery (`ForgotPasswordView`) preventing account enumeration.
   - Scoped rate limiting (`AnonRateThrottle`, `UserRateThrottle`, `auth_login`: 15/min, `auth_register`: 10/min, `ai_ops`: 40/min).

2. **Authorization, RBAC & Privilege Escalation Prevention**:
   - Public registration (`POST /api/auth/register`) strictly forces `role='candidate'`. Role elevation is restricted exclusively to authenticated Administrators via `PATCH /api/admin-terminal/users/<id>`.
   - Backend-enforced permission classes (`IsAuthenticated`, `IsRecruiter`, `IsAdminUserRole`) on every endpoint.
   - Resource ownership validation preventing IDOR on resumes, interview sessions, evaluations, and PDF reports.
   - Strict privacy isolation: Recruiters cannot view a candidate's private mock interviews unless `is_recruiter_assigned=True` OR the candidate explicitly enables `shared_with_recruiters=True`.

3. **Input, Upload & Prompt-Injection Hardening**:
   - File upload validation enforcing 10 MB size limits, allowed extensions (`.pdf`, `.docx`, `.txt`), basename sanitization, and magic-byte signature verification (`%PDF` / `PK`).
   - Untrusted text (resumes and candidate answers) is sanitized and isolated inside explicit delimiters before passing to optional external LLM providers (`integrations/ai/provider.py`), with Pydantic JSON schema validation.
   - XSS escaping (`window.escapeHtml()`) on all dynamic DOM insertions across the frontend.
   - Security headers enforced via `RequestCorrelationAndSecurityMiddleware` (`X-Request-ID`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`) and explicit `CORS_ALLOWED_ORIGINS` allowlists.

## 2. Privacy & Responsible AI Safeguards

- **Camera-Optional Fairness**: Candidates who disable or lack a webcam are never penalized in confidence scoring (`backend/apps/evaluations/engine.py`). Missing visual data is never interpreted as poor performance.
- **No Emotion/Biometric Hiring Scoring**: Facial expressions or inferred emotions are never used in recruiter hiring scores.
- **Explicit Consent & User Data Control**: Explicit recording and optional webcam consents are tracked per user and per session; candidates can export all personal data (`GET /api/auth/export-data`) or deactivate their account (`DELETE /api/auth/me`) from the Profile & Privacy modal.
- **Auditability**: All authentication, role changes, platform settings updates, resume actions, and recruiter reviews are written to `AuditLog`.
