import io
import os
import re
import PyPDF2
import docx

MAX_RESUME_BYTES = 10 * 1024 * 1024  # 10 MB

TECHNICAL_SKILLS_TAXONOMY = {
    'languages': ['Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'C#', 'SQL', 'Go', 'Rust', 'HTML5', 'CSS3', 'HTML', 'CSS'],
    'frameworks': ['Django', 'React', 'Node.js', 'FastAPI', 'Express', 'Flask', 'Spring Boot', 'Next.js', 'Tailwind CSS', 'Angular', 'Vue'],
    'databases': ['PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'SQLite', 'Firebase', 'Cassandra', 'DynamoDB'],
    'tools': ['Git', 'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'Linux', 'CI/CD', 'GitHub Actions', 'Postman', 'Jira', 'Terraform'],
    'concepts': ['REST API', 'Data Structures', 'Algorithms', 'OOP', 'Microservices', 'System Design', 'Agile', 'Machine Learning', 'LLM']
}


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


def _extract_section_lines(text: str, heading_keywords: list, limit: int = 4) -> list:
    """Extracts genuine bullet/content lines following a recognized resume section heading."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    results = []
    in_section = False
    stop_headings = {'skills', 'technical skills', 'education', 'experience', 'work experience', 'internships', 'projects', 'certifications', 'achievements', 'summary', 'objective'}

    for line in lines:
        normalized = re.sub(r'[:\-–—]+$', '', line).strip().lower()
        if any(normalized == kw or normalized.startswith(kw + ' ') for kw in heading_keywords):
            in_section = True
            continue
        if in_section:
            if normalized in stop_headings:
                break
            if len(line) > 8:
                results.append(line.lstrip('•-* '))
                if len(results) >= limit:
                    break
    return results


def analyze_resume_text(text: str, target_role: str = 'Software Engineer', job_description: str = '') -> dict:
    """
    Extracts structured skills, education, experience, certifications, and projects
    strictly from the provided resume text (never inventing missing details),
    and calculates ATS alignment against target role and optional JD.
    """
    text_lower = text.lower()
    found_skills = {cat: [] for cat in TECHNICAL_SKILLS_TAXONOMY}

    for category, skills in TECHNICAL_SKILLS_TAXONOMY.items():
        for skill in skills:
            pattern = r'(?<!\w)' + re.escape(skill.lower()) + r'(?!\w)'
            if re.search(pattern, text_lower):
                found_skills[category].append(skill)

    all_extracted = [s for sublist in found_skills.values() for s in sublist]

    # Determine benchmark skills: from JD if provided, else role default
    jd_lower = (job_description or '').lower()
    jd_skills = []
    if jd_lower.strip():
        for skills in TECHNICAL_SKILLS_TAXONOMY.values():
            for skill in skills:
                pattern = r'(?<!\w)' + re.escape(skill.lower()) + r'(?!\w)'
                if re.search(pattern, jd_lower) and skill not in jd_skills:
                    jd_skills.append(skill)

    if jd_skills:
        benchmark_skills = jd_skills
    else:
        benchmark_skills = ['Python', 'JavaScript', 'SQL', 'Django', 'React', 'PostgreSQL', 'Redis', 'Git', 'Docker', 'REST API', 'Data Structures', 'OOP']

    matched_benchmark = [s for s in benchmark_skills if s in all_extracted]
    missing_skills = [s for s in benchmark_skills if s not in all_extracted]

    # Authentic section parsing (only report what is actually found in the text)
    exp_lines = _extract_section_lines(text, ['experience', 'work experience', 'employment', 'internships'])
    edu_lines = _extract_section_lines(text, ['education', 'academic', 'qualification', 'qualifications'])
    proj_lines = _extract_section_lines(text, ['projects', 'key projects', 'personal projects'])
    cert_lines = _extract_section_lines(text, ['certifications', 'certificates', 'licenses'])

    # Deterministic ATS match score
    benchmark_ratio = len(matched_benchmark) / max(len(benchmark_skills), 1)
    skill_points = round(benchmark_ratio * 55)
    breadth_points = min(len(all_extracted) * 2, 15)
    has_contact = 10 if ('@' in text or 'linkedin' in text_lower or 'github' in text_lower) else 0
    has_edu = 10 if (edu_lines or any(w in text_lower for w in ['bachelor', 'b.tech', 'b.e', 'master', 'm.tech', 'b.sc', 'university', 'degree'])) else 0
    has_exp_or_proj = 10 if (exp_lines or proj_lines or 'project' in text_lower or 'experience' in text_lower) else 0

    ats_score = min(max(skill_points + breadth_points + has_contact + has_edu + has_exp_or_proj, 15), 98)

    if all_extracted:
        summary = (
            f"Extracted {len(all_extracted)} verified skills ({', '.join(all_extracted[:6])}"
            f"{'...' if len(all_extracted) > 6 else ''}) matching {len(matched_benchmark)}/{len(benchmark_skills)} "
            f"target criteria for {target_role}."
        )
    else:
        summary = f"No standard technical taxonomy keywords detected for {target_role}. Review extracted text or include explicit technical skills."

    return {
        'ats_score': ats_score,
        'executive_summary': summary,
        'skills_extracted': found_skills,
        'missing_skills': missing_skills,
        'experience': [{'detail': line} for line in exp_lines],
        'education': [{'detail': line} for line in edu_lines],
        'projects': [{'detail': line} for line in proj_lines],
        'certifications': [{'detail': line} for line in cert_lines],
        'total_skills_count': len(all_extracted),
    }
