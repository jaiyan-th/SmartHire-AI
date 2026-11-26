# SmartHire AI — AI-Powered Mock Interview & Candidate Assessment Platform

[![CI Pipeline](https://github.com/smarthire-ai/smarthire-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/smarthire-ai/smarthire-ai/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Django: 5.2 LTS](https://img.shields.io/badge/Django-5.2%20LTS-092E20?logo=django)](https://djangoproject.com/)
[![Design: Lavender Blush](https://img.shields.io/badge/Design-Lavender%20Blush-8b7cf6)](frontend/css/styles.css)
[![Infosys Springboard Capstone](https://img.shields.io/badge/Capstone-Infosys%20Springboard-ec6bb0)](https://springboard.infosys.com/)

---

## 1. Project Overview

**SmartHire AI** is a production-grade, AI-powered interview preparation and candidate assessment platform. Built for students, job seekers, university career cells, and enterprise recruitment teams, it provides:

- **Multi-Discipline Mock Interviews**: Technical, HR, Behavioral (STAR method), and Quantitative Aptitude.
- **ATS Resume Analyzer**: Ingests candidate PDF/DOCX resumes, extracts key skills, and calculates job description alignment.
- **Real-Time Telemetry**: Browser webcam and microphone analysis with gaze stability and speaking cadence (WPM).
- **Deterministic 4-Pillar Scoring Engine**:
  $$\text{Overall Score} = (C \times 0.30) + (K \times 0.25) + (T \times 0.30) + (P \times 0.15)$$
- **Talent Intelligence & Recruiter Portal**: Candidate roster filtering, comparative candidate benchmarking, and template builder.
- **Administrative Governance Terminal**: Connection pool monitoring, live dark-plum diagnostics console, and AI model controls.
- **Certified PDF Dossier Downloads**: Downloadable, tamper-resistant PDF dossiers with verification codes.

---

## 2. Technology Stack

- **Frontend**: Vanilla HTML5, Modern CSS3 (Lavender Blush Design System), Modular ES6 JavaScript. Zero npm build friction.
- **Backend**: Python 3.12+, Django 5.2 LTS, Django REST Framework, SimpleJWT.
- **Database**: Dual architecture: PostgreSQL (Production/Docker) with SQLite fallback for immediate local execution.
- **AI & ML Integration**: Groq Llama-3.1-8B-Instant, OpenAI GPT-4o-mini, PyPDF2 resume parsing, and Web Speech/Audio APIs.
- **DevOps**: Docker, Docker Compose, GitHub Actions CI/CD.

---

## 3. Quick Start Guide

### Prerequisites
- Python 3.10+ (Tested on Python 3.12 / 3.14)
- Git

### 1. Clone & Setup Virtual Environment
```bash
git clone https://github.com/smarthire-ai/smarthire-ai.git
cd smarthire-ai

python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
```

### 2. Run Database Migrations & Seed Data
```bash
python backend/manage.py migrate
python backend/manage.py seed_data
```

### 3. Launch the Backend REST API
```bash
python backend/manage.py runserver 127.0.0.1:8000
```
Backend API will be active at `http://127.0.0.1:8000/`.

### 4. Serve the Frontend
In a separate terminal:
```bash
python -m http.server 5500 --directory frontend
```
Visit `http://localhost:5500/` in any modern web browser.

---

## 4. One-Click Demo Accounts

| Role | Email | Password | Access Privileges |
|---|---|---|---|
| **Candidate** | `candidate@demo.com` | `Demo@1234` | Resume ATS, Mock Interview Room, Skill Gap, Insights |
| **Recruiter** | `recruiter@demo.com` | `Demo@1234` | Candidate Roster, Dossier Review, Interview Template Builder |
| **Administrator** | `admin@demo.com` | `Demo@1234` | System Diagnostics, User RBAC Management, AI Settings |

*(One-click demo account chips are directly clickable on the login card.)*

---

## 5. Architectural Blueprint & Page Directory

```
smarthire-ai/
├── frontend/
│   ├── index.html              # Authentication (Login / Register / Demo Chips)
│   ├── home.html               # Project Hub (Hero, 5-stage pipeline, deep dives)
│   ├── interview.html          # Live Mock Interview Room (PIP Camera, Speech/Code)
│   ├── resume.html             # ATS Resume Parser & Gap Matrix
│   ├── skill-gap.html          # Skill Gap Roadmap & Checklists
│   ├── insights.html           # Performance Analytics, Progression & Radar
│   ├── recruiter.html          # Recruiter Portal & Candidate Dossiers
│   ├── admin.html              # Admin Governance Terminal & Dark Plum Console
│   ├── report-download.html    # Certified Printable Evaluation Dossier
│   ├── css/styles.css          # Lavender Blush Light Theme Design System
│   ├── js/api-v2.js            # REST API Client with Fallback Simulation
│   └── js/app.js               # Shared Floating Navbar, Toast, Guards, Rubric
├── backend/
│   ├── apps/
│   │   ├── accounts/           # User Model, RBAC, SimpleJWT Views
│   │   ├── resumes/            # PyPDF2 Extractor, ATS Matcher
│   │   ├── interviews/         # Session State Machine, Question Bank, Telemetry
│   │   ├── evaluations/        # 4-Pillar Scoring Engine (Deterministic Math)
│   │   ├── analytics/          # Multi-session Progression & Benchmark Data
│   │   ├── reports/            # ReportLab PDF Dossier Generator
│   │   └── core/               # Health Checks, Audit Logs, Admin Endpoints
│   ├── config/                 # Settings, URLs, WSGI, ASGI
│   └── manage.py
├── docker-compose.yml          # Production Orchestration (Nginx, Gunicorn, PG, Redis)
├── Dockerfile.backend
├── Dockerfile.frontend
├── requirements.txt
└── IMPLEMENTATION_TRACKER.md
```

---

## 6. Running Tests

Run the complete test suite:
```bash
python backend/manage.py test tests --verbosity=2
```
All 8 integration and unit tests pass with 100% success rate:
- Authentication, Registration, and JWT token rotation
- Deterministic 4-pillar calculation and rating band boundaries
- Interview session lifecycle and speech analysis
- PyPDF2 resume parsing and ATS scoring

---

## 7. Production Docker Deployment

Deploy with Docker Compose:
```bash
docker-compose up --build -d
```
Services initialized:
- PostgreSQL database on port `5432`
- Redis cache & broker on port `6379`
- Gunicorn Django API backend on port `8000`
- Nginx static frontend on port `5500`

---

## 8. License & Acknowledgments

Developed as part of the **Infosys Springboard Capstone Project (AI & Talent Intelligence track)**. Released under the MIT License.
