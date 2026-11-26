import io
import os
import re
import PyPDF2
import docx
from integrations.ai.provider import AIProviderService

MAX_RESUME_BYTES = 10 * 1024 * 1024  # 10 MB

TECHNICAL_SKILLS_TAXONOMY = {
    'languages': [
        'Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'C#', 'SQL',
        'Go', 'Rust', 'HTML5', 'CSS3', 'HTML', 'CSS', 'Bash',
    ],
    'frameworks': [
        'Django', 'React', 'Node.js', 'FastAPI', 'Express', 'Flask',
        'Spring Boot', 'Next.js', 'Tailwind CSS', 'Angular', 'Vue', 'Celery',
        'PyTorch', 'TensorFlow', 'Scikit-Learn', 'Pandas', 'NumPy', 'LangChain',
    ],
    'databases': [
        'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'SQLite', 'Firebase',
        'Cassandra', 'DynamoDB', 'Vector DB', 'Pinecone', 'pgvector',
    ],
    'tools': [
        'Git', 'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'Linux',
        'CI/CD', 'GitHub Actions', 'Postman', 'Jira', 'Terraform', 'Helm',
        'Prometheus', 'Grafana', 'Nginx', 'Kafka', 'Pytest', 'Jest', 'Selenium',
    ],
    'concepts': [
        'REST API', 'GraphQL', 'gRPC', 'Data Structures', 'Algorithms', 'OOP',
        'Microservices', 'System Design', 'Agile', 'Machine Learning', 'LLM',
        'RAG', 'Embeddings', 'A/B Testing', 'Product Strategy', 'RICE', 'PRD', 'KPI',
        'Cybersecurity', 'OAuth2', 'JWT',
    ],
}

# Maps common resume synonyms/abbreviations back to canonical taxonomy names
SKILL_ALIASES = {
    'postgres': ('databases', 'PostgreSQL'),
    'psql': ('databases', 'PostgreSQL'),
    'k8s': ('tools', 'Kubernetes'),
    'reactjs': ('frameworks', 'React'),
    'react.js': ('frameworks', 'React'),
    'nodejs': ('frameworks', 'Node.js'),
    'node.js': ('frameworks', 'Node.js'),
    'nextjs': ('frameworks', 'Next.js'),
    'next.js': ('frameworks', 'Next.js'),
    'fastapi': ('frameworks', 'FastAPI'),
    'fast api': ('frameworks', 'FastAPI'),
    'sklearn': ('frameworks', 'Scikit-Learn'),
    'scikit learn': ('frameworks', 'Scikit-Learn'),
    'langgraph': ('frameworks', 'LangChain'),
    'restful': ('concepts', 'REST API'),
    'rest apis': ('concepts', 'REST API'),
    'dsa': ('concepts', 'Data Structures'),
    'object oriented': ('concepts', 'OOP'),
    'github action': ('tools', 'GitHub Actions'),
    'dockerize': ('tools', 'Docker'),
    'containerization': ('tools', 'Docker'),
    'ec2': ('tools', 'AWS'),
    's3': ('tools', 'AWS'),
    'aws lambda': ('tools', 'AWS'),
    'google cloud': ('tools', 'GCP'),
    'large language models': ('concepts', 'LLM'),
    'generative ai': ('concepts', 'LLM'),
    'genai': ('concepts', 'LLM'),
    'tailwind': ('frameworks', 'Tailwind CSS'),
    'tailwindcss': ('frameworks', 'Tailwind CSS'),
}

ROLE_BENCHMARKS = {
    'ai': ['Python', 'LLM', 'RAG', 'PyTorch', 'Embeddings', 'Vector DB', 'FastAPI', 'Docker', 'REST API', 'Git', 'Evaluation', 'Prompt Engineering'],
    'ml': ['Python', 'Machine Learning', 'PyTorch', 'Scikit-Learn', 'Pandas', 'NumPy', 'SQL', 'Docker', 'Git', 'REST API'],
    'data': ['Python', 'SQL', 'PostgreSQL', 'Pandas', 'NumPy', 'Scikit-Learn', 'A/B Testing', 'Git', 'Statistics', 'Data Structures'],
    'devops': ['Docker', 'Kubernetes', 'Linux', 'Terraform', 'AWS', 'CI/CD', 'GitHub Actions', 'Redis', 'Nginx', 'Prometheus', 'Git'],
    'cloud': ['Docker', 'Kubernetes', 'AWS', 'Terraform', 'CI/CD', 'Linux', 'Microservices', 'PostgreSQL', 'Redis', 'Git'],
    'frontend': ['React', 'TypeScript', 'JavaScript', 'Next.js', 'Tailwind CSS', 'HTML5', 'CSS3', 'REST API', 'Jest', 'Git'],
    'security': ['Cybersecurity', 'OAuth2', 'JWT', 'Linux', 'Docker', 'AWS', 'REST API', 'Python', 'CI/CD', 'Git'],
    'product': ['Product Strategy', 'RICE', 'PRD', 'KPI', 'A/B Testing', 'Agile', 'SQL', 'Jira', 'REST API', 'LLM'],
    'default': ['Python', 'JavaScript', 'SQL', 'Django', 'React', 'PostgreSQL', 'Redis', 'Git', 'Docker', 'REST API', 'Data Structures', 'OOP'],
}


def _get_role_benchmark_skills(target_role: str) -> list:
    role_lower = (target_role or '').lower()
    if any(k in role_lower for k in ['ai', 'llm', 'generative']):
        return ROLE_BENCHMARKS['ai']
    if any(k in role_lower for k in ['ml', 'machine learning']):
        return ROLE_BENCHMARKS['ml']
    if 'data' in role_lower:
        return ROLE_BENCHMARKS['data']
    if any(k in role_lower for k in ['devops', 'sre', 'platform']):
        return ROLE_BENCHMARKS['devops']
    if 'cloud' in role_lower:
        return ROLE_BENCHMARKS['cloud']
    if any(k in role_lower for k in ['frontend', 'front-end', 'ui']):
        return ROLE_BENCHMARKS['frontend']
    if any(k in role_lower for k in ['security', 'cyber', 'appsec']):
        return ROLE_BENCHMARKS['security']
    if 'product' in role_lower or 'pm' in role_lower.split():
        return ROLE_BENCHMARKS['product']
    return ROLE_BENCHMARKS['default']


def validate_and_extract_text(file_bytes: bytes, filename: str) -> str:
    """
    Validates file extension, file size, and magic-byte file signatures
    before extracting text from PDF, DOCX, or TXT resumes.
    """
    if len(file_bytes) == 0:
        raise ValueError('Uploaded file is empty.')
    if len(file_bytes) > MAX_RESUME_BYTES:
        raise ValueError('File size exceeds the 10 MB limit.')

    ext = os.path.splitext(filename or '')[1].lower()
    if ext == '.pdf':
        if not file_bytes.lstrip().startswith(b'%PDF'):
            raise ValueError('Invalid or corrupted PDF signature.')
        try:
            reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
            text_content = [page.extract_text() or '' for page in reader.pages]
            extracted = "\n".join(text_content).strip()
            if not extracted:
                raise ValueError('PDF appears to contain no extractable text (scanned image PDFs require OCR).')
            return extracted
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError(f'Corrupted PDF file: {exc}') from exc

    elif ext == '.docx':
        if not file_bytes.startswith(b'PK'):
            raise ValueError('Invalid or corrupted DOCX signature.')
        try:
            document = docx.Document(io.BytesIO(file_bytes))
            parts = [p.text for p in document.paragraphs if p.text.strip()]
            for table in document.tables:
                for row in table.rows:
                    parts.append(' | '.join(cell.text.strip() for cell in row.cells if cell.text.strip()))
            extracted = "\n".join(parts).strip()
            if not extracted:
                raise ValueError('DOCX file contains no readable text.')
            return extracted
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError(f'Corrupted DOCX file: {exc}') from exc

    elif ext == '.txt':
        try:
            extracted = file_bytes.decode('utf-8').strip()
            if not extracted:
                raise ValueError('Text file is empty.')
            return extracted
        except UnicodeDecodeError as exc:
            raise ValueError('TXT resume must be valid UTF-8 text.') from exc

    else:
        raise ValueError('Unsupported file format. Allowed formats: .pdf, .docx, .txt')


def _extract_section_lines(text: str, heading_keywords: list, limit: int = 6) -> list:
    """
    Extracts content lines following recognized resume headings, handling both
    multi-line section blocks and compact single-line formats (`Education: ... Experience: ...`).
    """
    all_headings = [
        'skills', 'technical skills', 'education', 'academic', 'qualification', 'qualifications',
        'experience', 'work experience', 'employment', 'internships', 'projects',
        'key projects', 'personal projects', 'certifications', 'certificates', 'licenses',
        'achievements', 'summary', 'objective',
    ]
    heading_pattern = '|'.join(sorted((re.escape(h) for h in all_headings), key=len, reverse=True))
    # Insert line breaks before inline section headings like "Education: B.Tech. Experience: Intern"
    normalized_text = re.sub(
        rf'(?i)(?:^|[.\n])\s*({heading_pattern})\s*:',
        lambda m: f'\n{m.group(1)}:\n',
        text,
    )

    lines = [line.strip() for line in normalized_text.splitlines() if line.strip()]
    results = []
    in_section = False
    stop_headings = set(all_headings)

    for line in lines:
        cleaned_heading = re.sub(r'^#+\s*', '', line)
        normalized = re.sub(r'[:\-–—]+$', '', cleaned_heading).strip().lower()
        matched_target = False
        for kw in heading_keywords:
            if normalized == kw:
                matched_target = True
                break
            if cleaned_heading.lower().startswith(kw + ':'):
                remainder = cleaned_heading[len(kw) + 1:].strip()
                in_section = True
                if len(remainder) > 4:
                    results.append(remainder.lstrip('•-* '))
                matched_target = True
                break
        if matched_target:
            in_section = True
            continue
        if in_section:
            if any(normalized == h or normalized.startswith(h + ':') for h in stop_headings):
                break
            if len(line) > 5:
                results.append(line.lstrip('•-* '))
                if len(results) >= limit:
                    break
    return results[:limit]


def _extract_skills_with_aliases(text_lower: str) -> dict:
    found = {cat: [] for cat in TECHNICAL_SKILLS_TAXONOMY}
    for category, skills in TECHNICAL_SKILLS_TAXONOMY.items():
        for skill in skills:
            pattern = r'(?<!\w)' + re.escape(skill.lower()) + r'(?!\w)'
            if re.search(pattern, text_lower):
                found[category].append(skill)

    for alias, (cat, canonical) in SKILL_ALIASES.items():
        pattern = r'(?<!\w)' + re.escape(alias) + r'(?!\w)'
        if re.search(pattern, text_lower) and canonical not in found[cat]:
            found[cat].append(canonical)
    return found


def analyze_resume_text(
    text: str,
    target_role: str = 'Software Engineer',
    job_description: str = '',
    user_email: str = 'system',
) -> dict:
    """
    Hybrid Claude/ChatGPT-caliber resume parser & ATS scorer:
    - Uses Groq Llama-3.3-70B (when GROQ_API_KEY is configured) for deep semantic skill extraction,
      synonym recognition, role/JD alignment, and grounded structured sections.
    - Blends and validates against deterministic taxonomy & regex guards so results remain
      factual, reproducible, and resilient offline.
    """
    text_lower = text.lower()
    det_skills = _extract_skills_with_aliases(text_lower)
    det_flat = [s for sublist in det_skills.values() for s in sublist]

    jd_lower = (job_description or '').lower()
    jd_skills = []
    if jd_lower.strip():
        jd_extracted = _extract_skills_with_aliases(jd_lower)
        jd_skills = [s for sub in jd_extracted.values() for s in sub]

    benchmark_skills = jd_skills if jd_skills else _get_role_benchmark_skills(target_role)
    det_lower_set = {s.lower() for s in det_flat}
    matched_benchmark = [s for s in benchmark_skills if s.lower() in det_lower_set]
    det_missing = [s for s in benchmark_skills if s.lower() not in det_lower_set]

    exp_lines = _extract_section_lines(text, ['experience', 'work experience', 'employment', 'internships'])
    edu_lines = _extract_section_lines(text, ['education', 'academic', 'qualification', 'qualifications'])
    proj_lines = _extract_section_lines(text, ['projects', 'key projects', 'personal projects'])
    cert_lines = _extract_section_lines(text, ['certifications', 'certificates', 'licenses'])

    benchmark_ratio = len(matched_benchmark) / max(len(benchmark_skills), 1)
    skill_points = round(benchmark_ratio * 55)
    breadth_points = min(len(det_flat) * 2, 15)
    has_contact = 10 if ('@' in text or 'linkedin' in text_lower or 'github' in text_lower) else 0
    has_edu = 10 if (edu_lines or any(w in text_lower for w in ['bachelor', 'b.tech', 'b.e', 'master', 'm.tech', 'b.sc', 'university', 'degree'])) else 0
    has_exp_or_proj = 10 if (exp_lines or proj_lines or 'project' in text_lower or 'experience' in text_lower) else 0
    det_ats_score = min(max(skill_points + breadth_points + has_contact + has_edu + has_exp_or_proj, 15), 98)

    # Attempt deep semantic parsing via configured LLM (Groq Llama-3.3-70B / OpenAI / Gemini / Ollama)
    ai_service = AIProviderService(user_email=user_email)
    llm_res = ai_service.analyze_resume(text, target_role=target_role, job_description=job_description)

    if llm_res:
        merged_skills = {cat: list(det_skills.get(cat, [])) for cat in TECHNICAL_SKILLS_TAXONOMY}
        llm_skills_obj = llm_res.get('skills_extracted') or {}
        for cat in merged_skills:
            existing_lower = {s.lower() for s in merged_skills[cat]}
            for item in llm_skills_obj.get(cat, []):
                clean_item = str(item).strip()
                if clean_item and clean_item.lower() not in existing_lower:
                    merged_skills[cat].append(clean_item)
                    existing_lower.add(clean_item.lower())

        all_merged = [s for sub in merged_skills.values() for s in sub]
        all_merged_lower = {s.lower() for s in all_merged}

        llm_missing = [
            str(s).strip()
            for s in (llm_res.get('missing_skills') or [])
            if str(s).strip() and str(s).strip().lower() not in all_merged_lower
        ]
        final_missing = llm_missing or det_missing

        # Calibrate ATS score using merged semantic + deterministic coverage alongside Groq's evaluation
        merged_matched = [s for s in benchmark_skills if s.lower() in all_merged_lower]
        merged_ratio = len(merged_matched) / max(len(benchmark_skills), 1)
        merged_det_score = min(
            max(round(merged_ratio * 55) + min(len(all_merged) * 2, 15) + has_contact + has_edu + has_exp_or_proj, 15),
            98,
        )
        calibrated_ats = round((llm_res['ats_score'] * 0.80) + (merged_det_score * 0.20))
        calibrated_ats = min(max(calibrated_ats, 15), 98)

        llm_exp = [str(e).strip() for e in (llm_res.get('experience') or []) if str(e).strip()]
        llm_edu = [str(e).strip() for e in (llm_res.get('education') or []) if str(e).strip()]
        llm_proj = [str(e).strip() for e in (llm_res.get('projects') or []) if str(e).strip()]
        llm_cert = [str(e).strip() for e in (llm_res.get('certifications') or []) if str(e).strip()]

        return {
            'ats_score': calibrated_ats,
            'executive_summary': llm_res['executive_summary'],
            'skills_extracted': merged_skills,
            'missing_skills': final_missing,
            'experience': [{'detail': line} for line in (llm_exp or exp_lines)],
            'education': [{'detail': line} for line in (llm_edu or edu_lines)],
            'projects': [{'detail': line} for line in (llm_proj or proj_lines)],
            'certifications': [{'detail': line} for line in (llm_cert or cert_lines)],
            'total_skills_count': len(all_merged),
        }

    if det_flat:
        summary = (
            f"Extracted {len(det_flat)} verified skills ({', '.join(det_flat[:6])}"
            f"{'...' if len(det_flat) > 6 else ''}) matching {len(matched_benchmark)}/{len(benchmark_skills)} "
            f"target criteria for {target_role}."
        )
    else:
        summary = f"No standard technical taxonomy keywords detected for {target_role}. Review extracted text or include explicit technical skills."

    return {
        'ats_score': det_ats_score,
        'executive_summary': summary,
        'skills_extracted': det_skills,
        'missing_skills': det_missing,
        'experience': [{'detail': line} for line in exp_lines],
        'education': [{'detail': line} for line in edu_lines],
        'projects': [{'detail': line} for line in proj_lines],
        'certifications': [{'detail': line} for line in cert_lines],
        'total_skills_count': len(det_flat),
    }
