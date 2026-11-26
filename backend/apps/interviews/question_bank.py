from apps.integrations_helper import get_ai_questions_safe

QUESTION_BANK = [
    # --- Software Engineering (Technical) ---
    {
        "id": "tech-01",
        "category": "Technical",
        "domain": "Software Engineering",
        "difficulty": "Mid-Level",
        "competency": "Object-Oriented Programming & Architecture",
        "prompt": "Can you explain the four core principles of Object-Oriented Programming (OOP)—Encapsulation, Abstraction, Inheritance, and Polymorphism—and give a concrete practical example of polymorphism?",
        "expected_keywords": ["encapsulation", "abstraction", "inheritance", "polymorphism", "overriding", "interface"],
        "model_answer": "Encapsulation bundles data and methods operating on that data within classes, restricting direct access. Abstraction hides complex implementation details, exposing only necessary interfaces. Inheritance allows a derived class to reuse properties and behaviors from a base class. Polymorphism allows methods to perform different tasks based on the object via overloading or runtime overriding."
    },
    {
        "id": "tech-02",
        "category": "Technical",
        "domain": "Software Engineering",
        "difficulty": "Mid-Level",
        "competency": "Networking & Protocols",
        "prompt": "Explain the 7 layers of the OSI model and contrast TCP versus UDP in terms of reliability, header overhead, and production use cases.",
        "expected_keywords": ["physical", "data link", "network", "transport", "session", "presentation", "application", "tcp", "udp", "handshake", "reliable"],
        "model_answer": "The 7 OSI layers from bottom to top are: Physical, Data Link, Network, Transport, Session, Presentation, Application. TCP is connection-oriented and reliable via a 3-way handshake and congestion control, ideal for HTTP/HTTPS. UDP is connectionless with minimal overhead, ideal for real-time audio/video streaming and DNS."
    },
    {
        "id": "tech-03",
        "category": "Technical",
        "domain": "Software Engineering",
        "difficulty": "Mid-Level",
        "competency": "Web Architecture & REST API Design",
        "prompt": "What is a REST API? How does the frontend communicate with backend services, and how are stateless authentication tokens (such as JWT) handled securely?",
        "expected_keywords": ["rest", "stateless", "http", "get", "post", "jwt", "bearer", "headers", "cors", "signature"],
        "model_answer": "A REST API uses standard HTTP verbs (GET, POST, PUT, DELETE) on resource URIs without server-side session state. Frontends communicate via Fetch/Axios, transmitting JWTs in Authorization Bearer headers verified by cryptographic signature, paired with strict CORS allowlists and token expiration/rotation."
    },
    {
        "id": "tech-04",
        "category": "Technical",
        "domain": "Software Engineering",
        "difficulty": "Junior",
        "competency": "Python Fundamentals & Problem Solving",
        "prompt": "How do you handle exceptions cleanly in Python? Explain how to swap two variables without a temporary third variable and when to use context managers.",
        "expected_keywords": ["try", "except", "finally", "tuple", "unpacking", "with", "context", "resource"],
        "model_answer": "Python handles exceptions via try/except/else/finally blocks, catching specific exception subclasses rather than bare except. Swapping without a third variable uses tuple unpacking (`a, b = b, a`). Context managers (`with`) guarantee deterministic cleanup of files, locks, or DB connections."
    },
    {
        "id": "tech-08",
        "category": "Technical",
        "domain": "Software Engineering",
        "difficulty": "Senior",
        "competency": "Distributed Systems & Rate Limiting",
        "prompt": "Design a distributed rate limiter for a high-throughput API gateway. Compare Token Bucket vs Sliding Window Log and explain how you avoid race conditions in Redis.",
        "expected_keywords": ["redis", "token bucket", "sliding window", "lua", "atomic", "ttl", "race condition", "throughput"],
        "model_answer": "Token Bucket allows controlled bursts while enforcing steady-state rate; Sliding Window Log gives exact boundaries at higher memory cost. In Redis, execute check-and-decrement atomically inside a single-threaded Lua script (or Redis transaction) with key TTLs to eliminate read-modify-write race conditions across gateway nodes."
    },
    {
        "id": "tech-09",
        "category": "Technical",
        "domain": "Software Engineering",
        "difficulty": "Senior",
        "competency": "Concurrency & Idempotency",
        "prompt": "How do you guarantee idempotent payment or interview-submission APIs under client retries and concurrent requests?",
        "expected_keywords": ["idempotency", "transaction", "unique", "select_for_update", "lock", "retry", "atomic", "key"],
        "model_answer": "Enforce an idempotency key or unique database constraint combined with an ACID transaction and row-level locking (SELECT FOR UPDATE). Duplicate retries return the persisted result safely without mutating state or triggering duplicate side effects."
    },
    {
        "id": "tech-10",
        "category": "Technical",
        "domain": "Software Engineering",
        "difficulty": "Junior",
        "competency": "Frontend Performance & Security",
        "prompt": "Explain how Cross-Site Scripting (XSS) and CSRF occur in web applications, and how modern frontends and REST APIs mitigate both.",
        "expected_keywords": ["xss", "escape", "sanitize", "csrf", "cors", "httponly", "csp", "token"],
        "model_answer": "XSS injects executable scripts into DOM; mitigate via output escaping (textContent/escapeHtml), input validation, and Content-Security-Policy (CSP). CSRF tricks authenticated browsers into unwanted requests; mitigate via SameSite cookies, CSRF tokens, or stateless Authorization Bearer headers paired with strict CORS allowlists."
    },
    {
        "id": "tech-11",
        "category": "Technical",
        "domain": "Software Engineering",
        "difficulty": "Mid-Level",
        "competency": "Algorithms & Data Structures",
        "prompt": "Given an array of integers and a target sum, write or explain an O(n) algorithm to find two indices that add up to the target, and contrast its time/space trade-off against sorting.",
        "expected_keywords": ["hash", "dictionary", "map", "o(n)", "complement", "space", "sorting", "two pointer"],
        "model_answer": "Use a hash map storing value -> index as we iterate: for each element x, check if (target - x) exists in the map. This achieves O(n) time and O(n) space, whereas sorting + two pointers uses O(n log n) time and O(1) extra space."
    },

    # --- AI/ML ---
    {
        "id": "aiml-01",
        "category": "Technical",
        "domain": "AI/ML",
        "difficulty": "Mid-Level",
        "competency": "Modern AI & Transformer Architectures",
        "prompt": "What is a Large Language Model (LLM), how does transformer self-attention work, and how do you mitigate hallucinations and prompt injection in production systems?",
        "expected_keywords": ["transformer", "attention", "tokens", "embeddings", "grounding", "rag", "validation", "sanitization", "prompt injection"],
        "model_answer": "An LLM is a neural network trained on token sequences. Self-attention computes query-key-value weights across tokens regardless of distance. Production hardening uses RAG grounding, strict JSON schema validation (e.g., Pydantic), and untrusted-input isolation to defend against prompt injection."
    },
    {
        "id": "aiml-02",
        "category": "Technical",
        "domain": "AI/ML",
        "difficulty": "Mid-Level",
        "competency": "Retrieval-Augmented Generation (RAG)",
        "prompt": "Walk through the end-to-end architecture of a production RAG pipeline: chunking, hybrid retrieval, reranking, and evaluation metrics.",
        "expected_keywords": ["chunking", "embeddings", "vector", "bm25", "hybrid", "rerank", "precision", "faithfulness", "context"],
        "model_answer": "Split documents with semantic/overlap chunking, index dense embeddings alongside sparse BM25 lexical search for hybrid retrieval, apply a cross-encoder reranker on top-K results, and measure context recall, groundedness/faithfulness, and end-to-end answer accuracy."
    },
    {
        "id": "aiml-03",
        "category": "Technical",
        "domain": "AI/ML",
        "difficulty": "Senior",
        "competency": "Fine-Tuning vs Prompt Engineering",
        "prompt": "When should a team choose LoRA/QLoRA fine-tuning over prompt engineering or RAG, and what data governance risks must be managed?",
        "expected_keywords": ["lora", "fine-tuning", "rag", "latency", "cost", "pii", "drift", "eval"],
        "model_answer": "Use RAG for dynamic factual knowledge; use prompt engineering first for rapid iteration. Choose LoRA fine-tuning when teaching specialized output formats, domain tone, or distilling a large model into a smaller low-latency model—while scrubbing PII, versioning training sets, and gating deployment on regression evals."
    },
    {
        "id": "aiml-04",
        "category": "Technical",
        "domain": "AI/ML",
        "difficulty": "Junior",
        "competency": "ML Fundamentals & Evaluation",
        "prompt": "Explain the bias-variance trade-off and why accuracy alone is misleading on imbalanced classification datasets.",
        "expected_keywords": ["bias", "variance", "overfitting", "underfitting", "precision", "recall", "f1", "roc", "imbalanced"],
        "model_answer": "High bias causes underfitting (missing signal); high variance causes overfitting (memorizing noise). On imbalanced datasets (e.g., 99% negative), a trivial classifier gets 99% accuracy—so evaluate precision, recall, F1, PR-AUC, and calibration instead."
    },
    {
        "id": "aiml-05",
        "category": "Technical",
        "domain": "AI/ML",
        "difficulty": "Mid-Level",
        "competency": "MLOps & Production Reliability",
        "prompt": "How do you detect and handle data drift, concept drift, and silent model degradation in a deployed ML inference service?",
        "expected_keywords": ["drift", "monitoring", "distribution", "psi", "kl", "shadow", "canary", "rollback", "latency"],
        "model_answer": "Monitor input feature distributions (PSI/KL divergence), prediction confidence shifts, and delayed ground-truth labels. Use shadow/canary rollouts, automated alerting, and fast model-registry rollback."
    },

    # --- Data Science ---
    {
        "id": "ds-01",
        "category": "Technical",
        "domain": "Data Science",
        "difficulty": "Mid-Level",
        "competency": "Databases, PostgreSQL & Query Optimization",
        "prompt": "How do B-Tree indexes speed up PostgreSQL queries, how do you diagnose N+1 ORM queries, and when should you use database transactions?",
        "expected_keywords": ["postgresql", "index", "b-tree", "explain", "n+1", "select_related", "transaction", "acid", "atomic"],
        "model_answer": "B-Tree indexes maintain balanced sorted key pointers for O(log n) lookups instead of sequential scans. N+1 queries are diagnosed via query profiling and resolved with select_related/prefetch_related joins. ACID transactions ensure multi-table updates commit or roll back atomically."
    },
    {
        "id": "ds-02",
        "category": "Technical",
        "domain": "Data Science",
        "difficulty": "Mid-Level",
        "competency": "Experimentation & A/B Testing",
        "prompt": "How do you design an A/B test from hypothesis to rollout? Explain sample size, p-value, statistical power, and peeking pitfalls.",
        "expected_keywords": ["hypothesis", "sample size", "power", "p-value", "significance", "randomization", "peeking", "mde"],
        "model_answer": "Define primary metric, MDE, alpha (e.g. 0.05), and power (0.80) upfront to compute required sample size. Ensure proper randomization unit and avoid repeated peeking (or use sequential testing) to prevent inflated false positives."
    },
    {
        "id": "ds-03",
        "category": "Technical",
        "domain": "Data Science",
        "difficulty": "Junior",
        "competency": "SQL Analytics & Window Functions",
        "prompt": "Explain the difference between ROW_NUMBER(), RANK(), and DENSE_RANK() in SQL, and when to use CTEs versus subqueries.",
        "expected_keywords": ["row_number", "rank", "dense_rank", "partition", "order by", "cte", "with", "window"],
        "model_answer": "ROW_NUMBER assigns unique sequential integers; RANK leaves gaps on ties; DENSE_RANK assigns consecutive integers without gaps on ties. CTEs (WITH) improve readability, modularity, and support recursive queries."
    },
    {
        "id": "ds-04",
        "category": "Technical",
        "domain": "Data Science",
        "difficulty": "Senior",
        "competency": "Feature Engineering & Leakage Prevention",
        "prompt": "What is target/data leakage in ML pipelines, and how do you architect time-series cross-validation and feature stores to prevent it?",
        "expected_keywords": ["leakage", "split", "pipeline", "time-series", "rolling", "cross-validation", "feature store", "scaler"],
        "model_answer": "Data leakage occurs when future or target-derived information enters training features (e.g., fitting scalers before train/test split). Prevent it by fitting transformers strictly inside CV folds, using expanding/rolling time splits, and enforcing point-in-time joins in feature stores."
    },

    # --- DevOps & Cloud ---
    {
        "id": "devops-01",
        "category": "Technical",
        "domain": "DevOps & Cloud",
        "difficulty": "Mid-Level",
        "competency": "Docker, Kubernetes & Distributed Caching",
        "prompt": "How do multi-stage Docker builds improve production container security and image size, and how would you use Redis for caching and distributed task queues?",
        "expected_keywords": ["docker", "multi-stage", "non-root", "redis", "cache", "ttl", "celery", "queue", "kubernetes"],
        "model_answer": "Multi-stage Docker builds separate compile-time dependencies from the minimal runtime image and run as a non-root user to minimize attack surface. Redis serves both as a low-latency TTL cache (cache-aside pattern) and a message broker for Celery background workers."
    },
    {
        "id": "devops-02",
        "category": "Technical",
        "domain": "DevOps & Cloud",
        "difficulty": "Mid-Level",
        "competency": "Kubernetes Orchestration & Resilience",
        "prompt": "Contrast liveness, readiness, and startup probes in Kubernetes, and explain how PodDisruptionBudgets and HPA protect production availability.",
        "expected_keywords": ["liveness", "readiness", "startup", "kubernetes", "hpa", "pdb", "pod", "autoscaling", "rolling"],
        "model_answer": "Startup probe gates slow-starting containers; readiness removes unhealthy pods from Service endpoints; liveness restarts deadlocked containers. PDBs guarantee minimum available replicas during voluntary drains while HPA scales pods on CPU/custom metrics."
    },
    {
        "id": "devops-03",
        "category": "Technical",
        "domain": "DevOps & Cloud",
        "difficulty": "Senior",
        "competency": "CI/CD, Deployment Strategies & Observability",
        "prompt": "Compare Blue-Green vs Canary deployments and explain how OpenTelemetry metrics, logs, and distributed traces speed up incident MTTR.",
        "expected_keywords": ["blue-green", "canary", "rollback", "opentelemetry", "metrics", "logs", "tracing", "slo", "mttr"],
        "model_answer": "Blue-Green switches 100% traffic between two identical environments for instant rollback; Canary gradually shifts traffic (1% -> 10% -> 100%) gated on SLO error budgets. OpenTelemetry correlates trace IDs across logs, metrics, and spans to pinpoint root-cause microservices fast."
    },
    {
        "id": "devops-04",
        "category": "Technical",
        "domain": "DevOps & Cloud",
        "difficulty": "Junior",
        "competency": "Cloud Security & Infrastructure as Code",
        "prompt": "What are the principles of least-privilege IAM, Infrastructure as Code (Terraform), and secrets management in cloud environments?",
        "expected_keywords": ["iam", "least privilege", "terraform", "state", "secrets", "rotation", "env", "kms"],
        "model_answer": "Grant scoped roles rather than wildcard permissions, manage cloud resources declaratively with versioned IaC (remote locked state), and inject encrypted secrets at runtime via Secrets Manager/Vault rather than committing credentials to Git."
    },

    # --- Product Management ---
    {
        "id": "pm-01",
        "category": "Technical",
        "domain": "Product Management",
        "difficulty": "Mid-Level",
        "competency": "Product Prioritization & Roadmapping",
        "prompt": "How do you prioritize competing feature requests across enterprise customers, technical debt, and growth initiatives? Walk through a concrete framework like RICE.",
        "expected_keywords": ["rice", "reach", "impact", "confidence", "effort", "trade-off", "roadmap", "metrics"],
        "model_answer": "Score initiatives systematically using RICE (Reach * Impact * Confidence / Effort), balance short-term revenue asks with platform reliability/tech debt budgets, and validate assumptions with lightweight prototypes before full engineering investment."
    },
    {
        "id": "pm-02",
        "category": "Technical",
        "domain": "Product Management",
        "difficulty": "Mid-Level",
        "competency": "Metrics, Funnels & Root-Cause Diagnosis",
        "prompt": "Suppose interview completion rate on SmartHire AI drops by 15% week-over-week. How do you diagnose whether it is a product UX issue, technical outage, or traffic mix shift?",
        "expected_keywords": ["funnel", "segment", "cohort", "browser", "latency", "error", "telemetry", "ab test", "hypothesis"],
        "model_answer": "Segment the drop by device, browser, region, user cohort, and acquisition channel; correlate against backend error rates/p95 latency and recent deployments; inspect step-by-step funnel drop-off (setup -> mic check -> Q1 -> submit) to isolate root cause."
    },
    {
        "id": "pm-03",
        "category": "Technical",
        "domain": "Product Management",
        "difficulty": "Senior",
        "competency": "AI Product Strategy & Responsible AI",
        "prompt": "When shipping an AI-powered candidate assessment product, how do you balance automation speed with fairness, explainability, and legal/ethical compliance?",
        "expected_keywords": ["fairness", "bias", "explainability", "human-in-the-loop", "consent", "privacy", "guardrails", "rubric"],
        "model_answer": "Enforce transparent deterministic rubrics, camera-optional equity, human-in-the-loop final hiring decisions, explicit candidate consent, and continuous fairness/drift audits across cohorts rather than opaque black-box rejections."
    },
    {
        "id": "pm-04",
        "category": "Technical",
        "domain": "Product Management",
        "difficulty": "Junior",
        "competency": "PRD Writing & Cross-Functional Execution",
        "prompt": "What are the essential sections of a clear Product Requirements Document (PRD), and how do you align engineering and design on edge cases?",
        "expected_keywords": ["problem", "persona", "goals", "metrics", "acceptance criteria", "scope", "edge cases", "milestones"],
        "model_answer": "A strong PRD defines problem statement, target personas, success metrics/guardrails, user flows, explicit non-goals, acceptance criteria, and failure/edge-case states reviewed early in design/engineering critiques."
    },

    # --- HR ---
    {
        "id": "hr-01",
        "category": "HR",
        "domain": "Human Resources",
        "difficulty": "Standard",
        "competency": "Self-Introduction & Career Alignment",
        "prompt": "Please introduce yourself, highlight your technical background and impactful projects, and explain what motivates you to pursue this role.",
        "expected_keywords": ["background", "education", "projects", "impact", "collaboration", "growth", "skills"],
        "model_answer": "Follow Present-Past-Future structure: current expertise and stack, previous key projects with measurable outcomes, and future alignment with the team's engineering goals."
    },
    {
        "id": "hr-02",
        "category": "HR",
        "domain": "Human Resources",
        "difficulty": "Standard",
        "competency": "Self-Awareness & Continuous Growth",
        "prompt": "What do you consider your greatest engineering strength, and what is one technical or communication area you have actively worked to improve recently?",
        "expected_keywords": ["strength", "improvement", "feedback", "learning", "action", "measurable", "growth"],
        "model_answer": "Pair a concrete technical strength backed by evidence with an authentic improvement area showing specific deliberate actions and measurable progress."
    },
    {
        "id": "hr-03",
        "category": "HR",
        "domain": "Human Resources",
        "difficulty": "Standard",
        "competency": "Ownership & Learning Agility",
        "prompt": "Tell me about a complex new technology or domain you had to learn under tight timelines. How did you ramp up quickly and deliver?",
        "expected_keywords": ["learn", "documentation", "prototype", "feedback", "delivery", "ownership", "impact"],
        "model_answer": "Describe breaking down core concepts, reading official docs, building a small validated proof-of-concept, seeking peer code reviews, and delivering production value reliably."
    },
    {
        "id": "hr-04",
        "category": "HR",
        "domain": "Human Resources",
        "difficulty": "Standard",
        "competency": "Career Vision & Culture Fit",
        "prompt": "What kind of engineering culture brings out your best work, and what impact do you want to make in your first 90 days?",
        "expected_keywords": ["culture", "collaboration", "feedback", "ownership", "90 days", "onboarding", "impact"],
        "model_answer": "Highlight psychological safety, high engineering bar, clear ownership, and a concrete 30-60-90 day plan: ship small fixes early, understand architecture/metrics, then lead meaningful features."
    },

    # --- Behavioral (STAR) ---
    {
        "id": "behav-01",
        "category": "Behavioral",
        "domain": "Workplace Effectiveness",
        "difficulty": "Standard",
        "competency": "Conflict Resolution & Team Collaboration",
        "prompt": "Describe a situation where you had an architectural or technical disagreement with a teammate. How did you resolve it, and what was the final result?",
        "expected_keywords": ["situation", "task", "action", "result", "data", "trade-off", "consensus", "outcome"],
        "model_answer": "Use the STAR method: outline the Situation and Task, explain the objective Action taken (e.g., benchmarking trade-offs or building a quick prototype), and share the measurable Result."
    },
    {
        "id": "behav-02",
        "category": "Behavioral",
        "domain": "Workplace Effectiveness",
        "difficulty": "Standard",
        "competency": "Incident Triage & Deadline Execution",
        "prompt": "Tell me about a time a critical bug or unexpected blocker surfaced right before a release deadline. How did you prioritize and resolve it?",
        "expected_keywords": ["prioritize", "root cause", "logs", "triage", "communicate", "deadline", "fix", "verification"],
        "model_answer": "Detail rapid incident triage, isolating root cause from logs/reproduction tests, transparent stakeholder communication, verified hotfix rollout, and post-mortem prevention."
    },
    {
        "id": "behav-03",
        "category": "Behavioral",
        "domain": "Workplace Effectiveness",
        "difficulty": "Standard",
        "competency": "Ownership & Learning from Mistakes",
        "prompt": "Describe a time you made a technical mistake or shipped a change that caused an issue. How did you own it and prevent recurrence?",
        "expected_keywords": ["mistake", "rollback", "blameless", "postmortem", "test", "monitoring", "prevention", "result"],
        "model_answer": "Own the mistake transparently without blaming others, describe fast mitigation/rollback, and detail systemic safeguards added (automated tests, alerts, deployment gates)."
    },
    {
        "id": "behav-04",
        "category": "Behavioral",
        "domain": "Workplace Effectiveness",
        "difficulty": "Standard",
        "competency": "Navigating Ambiguity",
        "prompt": "Tell me about a project where requirements were ambiguous or changing frequently. How did you create clarity and keep delivery on track?",
        "expected_keywords": ["ambiguity", "stakeholders", "assumptions", "prototype", "iterate", "milestones", "result"],
        "model_answer": "Show how you interviewed stakeholders, documented explicit assumptions, delivered iterative milestones for early feedback, and avoided wasted engineering effort."
    },

    # --- Aptitude ---
    {
        "id": "apt-01",
        "category": "Aptitude",
        "domain": "Logical Reasoning",
        "difficulty": "Standard",
        "competency": "Quantitative Estimation & Reliability Math",
        "prompt": "If an API cluster handles 1,200 requests per minute with a 99.5% success rate, how many failed requests occur over a continuous 24-hour window?",
        "expected_keywords": ["1440", "1728000", "0.5%", "8640", "minutes", "rate"],
        "model_answer": "24 hours = 1,440 minutes. Total requests = 1,440 * 1,200 = 1,728,000. Failure rate = 0.5% = 0.005. Failed requests = 1,728,000 * 0.005 = 8,640 failed requests."
    },
    {
        "id": "apt-02",
        "category": "Aptitude",
        "domain": "Logical Reasoning",
        "difficulty": "Standard",
        "competency": "Algorithmic Complexity & Scaling",
        "prompt": "An unindexed SQL table lookup scales linearly at O(N) taking 40ms for 100,000 rows. Roughly how fast would an O(log2 N) B-Tree index lookup be if each comparison takes 0.5ms, and why?",
        "expected_keywords": ["logarithmic", "o(log n)", "binary", "comparisons", "8.5", "17", "tree"],
        "model_answer": "log2(100,000) is ~16.6 (17 comparisons). At 0.5ms per tree level comparison, it takes roughly 8.5ms, and scaling to 10 million rows only adds ~7 comparisons instead of 100x latency."
    },
    {
        "id": "apt-03",
        "category": "Aptitude",
        "domain": "Logical Reasoning",
        "difficulty": "Standard",
        "competency": "Cache Hit Ratio & Effective Latency",
        "prompt": "A Redis cache lookup takes 2ms and a database query takes 52ms. If your cache hit rate improves from 60% to 90%, what is the reduction in average read latency?",
        "expected_keywords": ["22", "7", "15", "68%", "latency", "hit", "miss"],
        "model_answer": "At 60% hit rate: (0.60 * 2) + (0.40 * 52) = 1.2 + 20.8 = 22.0ms. At 90% hit rate: (0.90 * 2) + (0.10 * 52) = 1.8 + 5.2 = 7.0ms. That reduces average read latency by 15ms (~68.2% faster)."
    },
    {
        "id": "apt-04",
        "category": "Aptitude",
        "domain": "Logical Reasoning",
        "difficulty": "Standard",
        "competency": "Concurrency & Throughput Estimation",
        "prompt": "A worker service processes each background job in 250ms on average. How many concurrent worker threads are needed to sustain 200 jobs per second without queue backlog (Little's Law)?",
        "expected_keywords": ["50", "little", "200", "0.25", "concurrency", "workers", "throughput"],
        "model_answer": "By Little's Law (L = lambda * W): 200 jobs/sec * 0.25 sec = 50 concurrent workers minimum (plus headroom such as 60-65 workers for p95 spikes)."
    },
]


def get_questions_for_interview(
    domain="Software Engineering",
    category="Technical",
    difficulty="Mid-Level",
    count=5,
    focus_skills=None,
    user_email="system",
):
    """
    Attempts structured AI generation via AIProviderService when external keys are configured,
    with seamless deduplicated fallback to skill-prioritized curated questions.
    """
    focus_skills = [s.strip() for s in (focus_skills or []) if str(s).strip()]
    collected = []
    seen_prompts = set()

    ai_questions = get_ai_questions_safe(domain, category, difficulty, count, focus_skills, user_email)
    if ai_questions:
        for q in ai_questions:
            norm_prompt = (q.get("prompt") or "").strip().lower()
            if norm_prompt and norm_prompt not in seen_prompts:
                seen_prompts.add(norm_prompt)
                collected.append(q)
        if len(collected) >= count:
            return collected[:count]

    skills_lower = [s.lower() for s in focus_skills]
    domain_tokens = [
        tok for tok in domain.lower().replace('/', ' ').replace('&', ' ').split()
        if len(tok) >= 2 and tok not in {'engineer', 'developer', 'manager', 'analyst', 'and', 'the', 'for'}
    ]

    def score_question(q):
        score = 0
        if q["category"].lower() == category.lower():
            score += 60
        if q["domain"].lower() == domain.lower():
            score += 35
        if q["difficulty"].lower() == difficulty.lower():
            score += 12
        text_blob = (q["domain"] + " " + q["prompt"] + " " + q["competency"] + " " + " ".join(q["expected_keywords"])).lower()
        for tok in domain_tokens:
            if tok in text_blob:
                score += 18
        for sk in skills_lower:
            if sk in text_blob:
                score += 25
        return score

    ranked = sorted(QUESTION_BANK, key=score_question, reverse=True)
    for q in ranked:
        norm_prompt = q["prompt"].strip().lower()
        if norm_prompt not in seen_prompts:
            seen_prompts.add(norm_prompt)
            collected.append(q)
            if len(collected) >= count:
                break
    return collected[:count]
