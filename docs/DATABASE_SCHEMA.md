# SmartHire AI — Database Schema Documentation

## Entity Relationship Overview

```
+------------------+         +---------------------+
|      User        | 1     * |       Resume        |
|------------------+---------+---------------------+
| id (UUID, PK)    |         | id (UUID, PK)       |
| email (Unique)   |         | user_id (FK)        |
| full_name        |         | file_name           |
| role (Enum)      |         | ats_score           |
| headline         |         | skills_extracted    |
| created_at       |         | missing_skills      |
+--------+---------+         +---------------------+
         | 1
         |
         | *
+--------v-------------+     1   1 +---------------------+
|   InterviewSession   +-----------+     Evaluation      |
|----------------------+           |---------------------+
| id (UUID, PK)        |           | id (UUID, PK)       |
| candidate_id (FK)    |           | session_id (FK, Unq)|
| domain               |           | communication_score |
| category             |           | confidence_score    |
| difficulty           |           | technical_score     |
| status (Enum)        |           | professionalism_sc  |
| proctoring_flagged   |           | overall_score       |
| started_at           |           | rating_band         |
| completed_at         |           | strengths (JSON)    |
+--------+-------------+           | weaknesses (JSON)   |
         | 1                       | question_evals(JSON)|
         |                         +---------------------+
         | *
+--------v-------------+     1   * +---------------------+
|  InterviewQuestion   +-----------+   InterviewAnswer   |
|----------------------+           |---------------------+
| id (UUID, PK)        |           | id (UUID, PK)       |
| session_id (FK)      |           | session_id (FK)     |
| order (Int)          |           | question_id (FK)    |
| competency           |           | transcript_text     |
| prompt               |           | code_text           |
| expected_keywords    |           | wpm (Int)           |
| model_answer         |           | filler_words_count  |
+----------------------+           | eye_contact_pct     |
                                   +---------------------+
```

## Tables & Constraints

1. **User (`accounts_user`)**:
   - Custom user model extending `AbstractUser`.
   - `id`: UUID primary key.
   - `role`: Text choices (`candidate`, `recruiter`, `admin`).
   - `email`: Unique email identifier for authentication.

2. **Resume (`resumes_resume`)**:
   - Stores extracted skills, parsed metadata, and ATS scores.
   - `skills_extracted`: JSONField storing categorized skills (`languages`, `frameworks`, `databases`, `tools`).
   - `missing_skills`: JSONField storing gaps relative to target benchmark.

3. **InterviewSession (`interviews_interviewsession`)**:
   - Manages interview state machine: `DRAFT` -> `READY` -> `IN_PROGRESS` -> `COMPLETED`.
   - Tracks duration, proctoring flags, timestamps, and current active question.

4. **InterviewQuestion (`interviews_interviewquestion`)**:
   - Tailored questions with expected keywords and model answers for automated scoring comparison.

5. **InterviewAnswer (`interviews_interviewanswer`)**:
   - Per-question answers supporting dual input modes (`speech` audio transcript or `code`).
   - Stores real-time speech telemetry (`wpm`, `filler_words_count`, `eye_contact_percentage`).

6. **Evaluation (`evaluations_evaluation`)**:
   - Stores authoritative deterministic 4-pillar scores:
     $$\text{Overall} = (C \times 0.30) + (K \times 0.25) + (T \times 0.30) + (P \times 0.15)$$
   - Qualitative AI feedback: strengths, weaknesses, remediation suggestions, practice recommendations, learning resources.

7. **AuditLog (`core_auditlog`)**:
   - Immutable security and diagnostics log stream capturing auth attempts, API transactions, and vision proctoring flags.
