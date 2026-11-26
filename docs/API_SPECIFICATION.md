# SmartHire AI — API Specification

**Base URL**: `http://127.0.0.1:8000/api`  
**Interactive Swagger Docs**: `http://127.0.0.1:8000/api/docs/`  
**OpenAPI Schema**: `http://127.0.0.1:8000/api/schema/`  
**Authentication**: Bearer JWT (`Authorization: Bearer <access_token>`)

---

## Endpoints Summary

### Authentication & Account Management (`/api/auth/`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register a new Candidate account (enforces `role='candidate'`) |
| `POST` | `/api/auth/login` | Public | Authenticate user, return JWT access & rotating refresh tokens |
| `POST` | `/api/auth/logout` | Bearer | Blacklist refresh token & audit sign-out |
| `POST` | `/api/auth/refresh` | Public | Rotate refresh token for fresh access token |
| `GET/PATCH/DELETE` | `/api/auth/me` | Bearer | Read/update profile & privacy consents, or deactivate account |
| `POST` | `/api/auth/change-password` | Bearer | Change current user password |
| `POST` | `/api/auth/forgot-password` | Public | Issue password reset token (enumeration-safe) |
| `POST` | `/api/auth/reset-password` | Public | Complete password reset using valid token |
| `POST` | `/api/auth/verify-email` | Public | Verify email token |
| `POST` | `/api/auth/resend-verification` | Bearer | Re-issue email verification token |
| `GET` | `/api/auth/providers` | Public | Discover enabled auth / OAuth2 providers |
| `GET` | `/api/auth/export-data` | Bearer | Export user's complete profile, resumes, evaluations, milestones, and interviews as JSON |

### Resumes & ATS Parser (`/api/resume/`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/resume/analyze` | Bearer | Parse `.pdf`/`.docx`/`.txt` (magic-byte validated) or raw text, compute ATS score |
| `GET` | `/api/resume/history` | Bearer | List authenticated user's uploaded resume versions |
| `GET/DELETE` | `/api/resume/<uuid:pk>` | Owner/Admin | View or delete specific resume version |

### Interview Engine (`/api/interview/`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/interview/start` | Bearer | Initialize interview session and synthesize/rank questions |
| `GET/DELETE` | `/api/interview/<uuid:pk>` | Owner/Recruiter* | Recover active session state, questions, answers, server timer, or delete practice session |
| `POST` | `/api/interview/<uuid:pk>/cancel` | Owner/Admin | Cancel an active or ready interview session |
| `POST` | `/api/interview/<uuid:pk>/telemetry` | Owner | Record proctoring telemetry events and threshold flags |
| `POST` | `/api/interview/answer` | Owner | Idempotently save/update speech or code answer + compute WPM/fillers |
| `POST` | `/api/interview/finish` | Owner | Atomically complete session & run 4-pillar deterministic evaluation |
| `PATCH` | `/api/interview/<uuid:pk>/share` | Owner | Toggle `shared_with_recruiters` privacy permission |
| `GET` | `/api/interview/history` | Bearer | List user's historical & assigned interview sessions |

### Evaluations & Analytics (`/api/evaluations/`, `/api/analytics/`, `/api/reports/`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/evaluations/latest` | Owner/Recruiter* | Fetch evaluation breakdown (`?session_id=` optional) |
| `GET` | `/api/analytics/insights` | Bearer | Real DB progression trend, radar comparison, and Q&A breakdown |
| `GET` | `/api/analytics/skill-gap` | Bearer | Role benchmarks, weak areas, and persistent roadmap milestones |
| `PATCH` | `/api/analytics/skill-gap/milestone` | Bearer | Persist completion toggle for a roadmap milestone |
| `GET` | `/api/reports/download-pdf` | Owner/Recruiter* | Stream certified ReportLab PDF dossier with HMAC digest header |
| `GET` | `/api/reports/verify/<uuid:pk>` | Owner/Recruiter* | Verify tamper-resistant dossier HMAC-SHA256 digest |

### Recruiter Operations (`/api/recruiter/`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/recruiter/candidates` | Recruiter/Admin | List authorized (assigned or candidate-shared) assessments & stats |
| `PATCH` | `/api/recruiter/candidates/<uuid:pk>/review` | Recruiter/Admin | Persist `recruiter_status` (`shortlisted`/`flagged_for_review`/`rejected`) & notes |
| `POST` | `/api/recruiter/assign` | Recruiter/Admin | Assign an interview assessment to a candidate by email |
| `GET` | `/api/recruiter/compare` | Recruiter/Admin | Side-by-side comparison across `?session_ids=id1,id2` |
| `GET` | `/api/recruiter/export-csv` | Recruiter/Admin | Download CSV export of authorized candidate evaluations |
| `GET/POST` | `/api/recruiter/templates` | Recruiter/Admin | List or create standardized interview templates |
| `GET/PATCH/DELETE` | `/api/recruiter/templates/<uuid:pk>` | Recruiter/Admin | Inspect, update, or archive a specific interview template |

### Admin Terminal & Health (`/api/admin-terminal/`, `/api/core/`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/admin-terminal/overview` | Admin | Live DB health/ping, uptime, token spend, user/session counts, job status |
| `GET/POST` | `/api/admin-terminal/users` | Admin | List/search user accounts or provision new role accounts |
| `PATCH` | `/api/admin-terminal/users/<uuid:pk>` | Admin | Update user role, toggle active status, or issue password reset |
| `GET` | `/api/admin-terminal/logs` | Admin | Query immutable `AuditLog` stream (`?level=INFO|WARN|ERROR`) |
| `GET/POST` | `/api/admin-terminal/settings` | Admin | Read or persist `PlatformConfig` (LLM provider, temperature, maintenance) |
| `GET` | `/api/core/health/live` | Public | Liveness probe |
| `GET` | `/api/core/health/ready` | Public | Readiness probe (verifies database connection) |
