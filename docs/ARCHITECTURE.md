# SmartHire AI — System Architecture & Design

## 1. System Overview

**SmartHire AI** is a production-grade, AI-driven candidate assessment and mock interview preparation platform. It provides candidates with automated role-based and resume-tailored mock interviews with real-time speech and video-facing observations, deterministic scoring across four pillars, and detailed feedback. It also enables recruiters to create interview templates, evaluate candidates, and review compliance-audited dossiers.

## 2. Architectural Blueprint

```
+-----------------------------------------------------------------------------------+
|                                 CLIENT LAYER                                      |
|  - Vanilla HTML5 / Modern CSS3 (Lavender Blush Theme) / Modular ES6 JavaScript    |
|  - Real-time Web Audio API / Web Speech API / Camera Video Stream                 |
|  - Recharts / Chart.js Data Visualizations & High-Contrast PDF Dossier Printing    |
+------------------------------------------+----------------------------------------+
                                           | HTTP / REST (JWT Bearer Token)
                                           v
+-----------------------------------------------------------------------------------+
|                           APPLICATION GATEWAY & REST API                          |
|  - Django 5.2 LTS + Django REST Framework                                         |
|  - SimpleJWT Authentication & RBAC (Candidate, Recruiter, Admin)                 |
|  - CORS & Security Middleware (Rate Limiting, Security Headers)                   |
+---------------------+-------------------------------+-----------------------------+
                      |                               |
                      v                               v
+-----------------------------+     +-------------------------------+
|    DOMAIN APPLICATION APPS  |     |   ASYNC PROCESSING & WORKERS  |
|  - accounts (Users, RBAC)   |     |   - Celery Task Queue         |
|  - resumes (PDF, Skills)    |     |   - Redis Broker & Cache      |
|  - interviews (Lifecycle)   |     |   - Background Resume Parsing |
|  - evaluations (4-Pillars)  |     |   - AI Question Synthesis     |
|  - analytics (Trends, Gaps) |     |   - Audio Analysis Pipeline   |
|  - reports (PDF Dossier)    |     +---------------+---------------+
+--------------+--------------+                     |
               |                                    v
               v                    +-------------------------------+
+-----------------------------+     |       AI INTEGRATIONS         |
|      DATA PERSISTENCE       |     |  - OpenAI / Groq LLM API      |
|  - PostgreSQL (Production)  |     |  - Local Deterministic Fallback|
|  - SQLite (Local Dev)       |     |  - PyPDF2 Resume Parser       |
+-----------------------------+     +-------------------------------+
```

## 3. Four-Pillar Scoring Methodology

The scoring engine implements deterministic mathematical calculation based on validated criterion metrics:

$$\text{Overall Score} = (C \times 0.30) + (K \times 0.25) + (T \times 0.30) + (P \times 0.15)$$

Where:
- **$C$ (Communication, 30%)**: Speech clarity, grammar accuracy, filler-word frequency, speaking pace (optimal 120–160 WPM), response completeness.
- **$K$ (Confidence, 25%)**: Eye-contact consistency, facial engagement, absence of excessive hesitation, steady attention level.
- **$T$ (Technical Relevance, 30%)**: Technical accuracy, keyword relevance, domain problem-solving, structured algorithmic/conceptual explanation.
- **$P$ (Professionalism, 15%)**: Time management, structured answer format (STAR method), etiquette, professional tone.

### Rating Boundaries
- **90–100**: Excellent
- **75–89**: Good
- **60–74**: Average
- **40–59**: Needs Improvement
- **Below 40**: Poor

## 4. Role-Based Access Control (RBAC)

1. **Candidate**:
   - Upload & parse resume
   - Configure and take mock interviews (Technical, HR, Behavioral, Aptitude)
   - View transcripts, feedback, skill gaps, learning roadmap
   - Download personalized PDF dossiers
2. **Recruiter**:
   - Manage candidate rosters, search/filter by score tier and proctoring flags
   - View detailed candidate dossiers and transcripts
   - Compare multiple candidates on job-relevant criteria
   - Create and customize interview templates
3. **Administrator**:
   - Platform metrics, LLM provider settings, temperature & token limits
   - User account status, role management, password resets
   - System diagnostics and audit event logs
