from apps.integrations_helper import get_ai_questions_safe

QUESTION_BANK = [
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
        "id": "tech-05",
        "category": "Technical",
        "domain": "AI/ML",
        "difficulty": "Mid-Level",
        "competency": "Modern AI & Transformer Architectures",
        "prompt": "What is a Large Language Model (LLM), how does transformer self-attention work, and how do you mitigate hallucinations and prompt injection in production systems?",
        "expected_keywords": ["transformer", "attention", "tokens", "embeddings", "grounding", "rag", "validation", "sanitization", "prompt injection"],
        "model_answer": "An LLM is a neural network trained on token sequences. Self-attention computes query-key-value weights across tokens regardless of distance. Production hardening uses RAG grounding, strict JSON schema validation (e.g., Pydantic), and untrusted-input isolation to defend against prompt injection."
    },
    {
        "id": "tech-06",
        "category": "Technical",
        "domain": "DevOps & Cloud",
        "difficulty": "Mid-Level",
        "competency": "Docker, Kubernetes & Distributed Caching",
        "prompt": "How do multi-stage Docker builds improve production container security and image size, and how would you use Redis for caching and distributed task queues?",
        "expected_keywords": ["docker", "multi-stage", "non-root", "redis", "cache", "ttl", "celery", "queue", "kubernetes"],
        "model_answer": "Multi-stage Docker builds separate compile-time dependencies from the minimal runtime image and run as a non-root user to minimize attack surface. Redis serves both as a low-latency TTL cache (cache-aside pattern) and a message broker for Celery background workers."
    },
    {
        "id": "tech-07",
        "category": "Technical",
        "domain": "Data Science",
        "difficulty": "Mid-Level",
        "competency": "Databases, PostgreSQL & Query Optimization",
        "prompt": "How do B-Tree indexes speed up PostgreSQL queries, how do you diagnose N+1 ORM queries, and when should you use database transactions?",
        "expected_keywords": ["postgresql", "index", "b-tree", "explain", "n+1", "select_related", "transaction", "acid", "atomic"],
        "model_answer": "B-Tree indexes maintain balanced sorted key pointers for O(log n) lookups instead of sequential scans. N+1 queries are diagnosed via query profiling and resolved with select_related/prefetch_related joins. ACID transactions ensure multi-table updates commit or roll back atomically."
    },
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
    }
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
    with seamless fallback to skill-prioritized curated questions.
    """
    focus_skills = focus_skills or []
    ai_questions = get_ai_questions_safe(domain, category, difficulty, count, focus_skills, user_email)
    if ai_questions and len(ai_questions) >= count:
        return ai_questions[:count]

    skills_lower = [s.lower() for s in focus_skills if s]

    def score_question(q):
        score = 0
        if q["category"].lower() == category.lower():
            score += 50
        if q["domain"].lower() == domain.lower():
            score += 20
        if q["difficulty"].lower() == difficulty.lower():
            score += 10
        text_blob = (q["prompt"] + " " + q["competency"] + " " + " ".join(q["expected_keywords"])).lower()
        for sk in skills_lower:
            if sk in text_blob:
                score += 25
        return score

    ranked = sorted(QUESTION_BANK, key=score_question, reverse=True)
    return ranked[:count]
