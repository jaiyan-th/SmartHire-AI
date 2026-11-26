import re
from integrations.ai.provider import AIProviderService

DOMAIN_RESOURCES = {
    'Software Engineering': [
        {"title": "System Design Primer & Scalability Patterns", "url": "https://github.com/donnemartin/system-design-primer", "domain": "Architecture"},
        {"title": "MDN Web Docs — HTTP & REST Architecture", "url": "https://developer.mozilla.org/en-US/docs/Web/HTTP", "domain": "Web Engineering"},
        {"title": "Official Python 3 Documentation", "url": "https://docs.python.org/3/", "domain": "Programming"},
    ],
    'AI/ML': [
        {"title": "Hugging Face LLM & Transformer Course", "url": "https://huggingface.co/learn/llm-course/", "domain": "AI/ML"},
        {"title": "Retrieval-Augmented Generation Evaluation Guide", "url": "https://docs.ragas.io/", "domain": "RAG & Evals"},
        {"title": "OWASP Top 10 for LLM Applications", "url": "https://genai.owasp.org/llm-top-10/", "domain": "AI Security"},
    ],
    'Data Science': [
        {"title": "PostgreSQL Performance & Indexing Tips", "url": "https://www.postgresql.org/docs/current/performance-tips.html", "domain": "Databases"},
        {"title": "Scikit-Learn User Guide — Model Evaluation", "url": "https://scikit-learn.org/stable/modules/model_evaluation.html", "domain": "Data Science"},
        {"title": "Trustworthy Online Controlled Experiments (A/B Testing)", "url": "https://experimentguide.com/", "domain": "Experimentation"},
    ],
    'DevOps & Cloud': [
        {"title": "Docker Multi-Stage & Security Best Practices", "url": "https://docs.docker.com/build/building/best-practices/", "domain": "Containers"},
        {"title": "Kubernetes Official Production Best Practices", "url": "https://kubernetes.io/docs/setup/best-practices/", "domain": "Orchestration"},
        {"title": "Google SRE Book — Service Level Objectives", "url": "https://sre.google/sre-book/service-level-objectives/", "domain": "SRE"},
    ],
    'Product Management': [
        {"title": "Intercom on Product Management & Prioritization", "url": "https://www.intercom.com/resources/books/intercom-product-management", "domain": "Product Strategy"},
        {"title": "Google PAIR — People + AI Guidebook", "url": "https://pair.withgoogle.com/guidebook", "domain": "AI Product"},
        {"title": "Reforge — Product Metrics & Funnel Analysis", "url": "https://www.reforge.com/blog", "domain": "Analytics"},
    ],
}


def compute_overall_score(comm: float, conf: float, tech: float, prof: float) -> float:
    """
    Computes deterministic overall composite score:
    Overall = Communication * 0.30 + Confidence * 0.25 + TechnicalRelevance * 0.30 + Professionalism * 0.15
    """
    overall = (comm * 0.30) + (conf * 0.25) + (tech * 0.30) + (prof * 0.15)
    return round(overall, 2)


def get_rating_band(score: float) -> str:
    if score >= 90:
        return "Excellent"
    elif score >= 75:
        return "Good"
    elif score >= 60:
        return "Average"
    elif score >= 40:
        return "Needs Improvement"
    return "Poor"


def _has_structured_code(code_text: str) -> bool:
    if not code_text:
        return False
    return bool(re.search(r'\b(def |class |function |const |let |SELECT |FROM |WHERE |try:|catch|return )\b', code_text, re.IGNORECASE))


def evaluate_completed_interview(session):
    """
    Calculates deterministic 4-pillar scores and evidence-based critique
    from the session's actual submitted answers and telemetry.
    """
    from .models import Evaluation

    answers = list(session.answers.select_related('question').all())
    questions = list(session.questions.all().order_by('order'))
    user_email = session.candidate.email if session.candidate else 'anonymous'
    ai_service = AIProviderService(user_email=user_email)

    question_evaluations = []
    accum_comm = []
    accum_conf = []
    accum_tech = []
    accum_prof = []

    total_wpm = 0
    wpm_samples = 0
    total_fillers = 0
    eye_samples = []
    answered_count = 0

    for q in questions:
        ans = next((a for a in answers if a.question_id == q.id), None)
        transcript = (ans.transcript_text or '').strip() if ans else ''
        code = (ans.code_text or '').strip() if ans else ''
        user_text = (transcript + '\n' + code).strip()

        if ans and user_text:
            answered_count += 1
            words = user_text.split()
            words_len = len(words)
            is_code_heavy = ans.input_mode == 'code' or (len(code) > len(transcript))

            matched_keywords = [kw for kw in (q.expected_keywords or []) if kw.lower() in user_text.lower()]
            keyword_ratio = len(matched_keywords) / max(len(q.expected_keywords or []), 1)

            ai_critique = ai_service.evaluate_answer(
                prompt_text=q.prompt,
                model_answer=q.model_answer,
                expected_keywords=q.expected_keywords or [],
                candidate_answer=user_text,
            )

            if ai_critique:
                tech_q = round(min(max(ai_critique['technical_score'], 0), 100), 1)
                critique_text = ai_critique['critique']
                strengths_text = ai_critique['strengths']
                improvements_text = ai_critique['improvements']
            else:
                depth_bonus = min(words_len * 0.45, 22)
                code_bonus = 6.0 if is_code_heavy and _has_structured_code(code) else 0.0
                tech_q = round(min(max(42 + (keyword_ratio * 38) + depth_bonus + code_bonus, 30), 96), 1)
                critique_text = (
                    f"Matched {len(matched_keywords)}/{max(len(q.expected_keywords or []), 1)} expected concepts "
                    f"({', '.join(matched_keywords[:4]) if matched_keywords else 'general terminology'}) across {words_len} tokens."
                )
                if is_code_heavy:
                    strengths_text = f"Submitted structured {ans.language} code/written solution for '{q.competency}'."
                elif ans.wpm > 0:
                    strengths_text = f"Addressed '{q.competency}' with {ans.wpm} WPM cadence."
                else:
                    strengths_text = f"Provided structured written response for '{q.competency}'."

                missing_kw = [kw for kw in (q.expected_keywords or []) if kw not in matched_keywords]
                improvements_text = (
                    f"Incorporate missing concepts such as: {', '.join(missing_kw[:3])}."
                    if missing_kw
                    else "Add concrete production trade-offs, complexity bounds, and edge-case examples."
                )

            wpm = ans.wpm or 0
            if wpm > 0 and not is_code_heavy:
                total_wpm += wpm
                wpm_samples += 1
            total_fillers += ans.filler_words_count

            if is_code_heavy:
                comm_q = 80.0 + min(words_len * 0.25, 12.0) + (4.0 if _has_structured_code(code) else 0.0)
            else:
                comm_q = 82.0 + min(words_len * 0.2, 12.0)
                if wpm > 0 and (wpm < 95 or wpm > 185):
                    comm_q -= 10.0
                if ans.filler_words_count > 2:
                    comm_q -= min((ans.filler_words_count - 2) * 3.0, 18.0)
            comm_q = round(min(max(comm_q, 35.0), 97.0), 1)

            # Camera-optional fairness: never penalize candidates when camera is off
            if session.camera_enabled and ans.eye_contact_percentage > 0:
                eye_samples.append(ans.eye_contact_percentage)
                conf_q = round(min(max((ans.eye_contact_percentage * 0.6) + (comm_q * 0.4), 40.0), 97.0), 1)
            else:
                hesitation_penalty = min(ans.filler_words_count * 3.5, 20.0)
                conf_q = round(min(max(86.0 - hesitation_penalty + min(words_len * 0.15, 8.0), 45.0), 95.0), 1)

            time_ok = 10 <= (ans.duration_seconds or 30) <= 180
            prof_q = 85.0 if time_ok else 72.0
            if words_len >= 20:
                prof_q += 5.0
            prof_q = round(min(prof_q, 96.0), 1)

            accum_comm.append(comm_q)
            accum_conf.append(conf_q)
            accum_tech.append(tech_q)
            accum_prof.append(prof_q)

            question_evaluations.append({
                'order': q.order,
                'competency': q.competency,
                'prompt': q.prompt,
                'candidate_response': user_text,
                'model_answer': q.model_answer,
                'critique': critique_text,
                'strengths': strengths_text,
                'improvements': improvements_text,
                'wpm': 0 if is_code_heavy else ans.wpm,
                'filler_words_count': ans.filler_words_count,
                'score': round((tech_q + comm_q) / 2, 1),
            })
        else:
            accum_comm.append(20.0)
            accum_conf.append(25.0)
            accum_tech.append(0.0)
            accum_prof.append(40.0)
            question_evaluations.append({
                'order': q.order,
                'competency': q.competency,
                'prompt': q.prompt,
                'candidate_response': 'No answer submitted.',
                'model_answer': q.model_answer,
                'critique': 'Question was skipped or remained unanswered before submission.',
                'strengths': 'None recorded for this item.',
                'improvements': 'Ensure every prompt receives a concise structured response within the timer.',
                'wpm': 0,
                'filler_words_count': 0,
                'score': 0.0,
            })

    base_comm = round(sum(accum_comm) / len(accum_comm), 1) if accum_comm else 0.0
    base_conf = round(sum(accum_conf) / len(accum_conf), 1) if accum_conf else 0.0
    base_tech = round(sum(accum_tech) / len(accum_tech), 1) if accum_tech else 0.0
    base_prof = round(sum(accum_prof) / len(accum_prof), 1) if accum_prof else 0.0

    overall_score = compute_overall_score(base_comm, base_conf, base_tech, base_prof)
    rating_band = get_rating_band(overall_score)

    avg_wpm = int(round(total_wpm / wpm_samples)) if wpm_samples else 0
    avg_eye = round(sum(eye_samples) / len(eye_samples), 1) if eye_samples else None

    strengths = []
    if answered_count == len(questions) and len(questions) > 0:
        strengths.append(f"Completed all {len(questions)}/{len(questions)} interview prompts within session constraints.")
    if 110 <= avg_wpm <= 165:
        strengths.append(f"Maintained an optimal speaking pace averaging {avg_wpm} WPM.")
    if avg_eye is not None and avg_eye >= 80:
        strengths.append(f"Strong camera engagement with {avg_eye}% eye-contact stability.")
    if base_tech >= 75:
        strengths.append("Demonstrated solid technical relevance and core terminology coverage.")
    if not strengths:
        strengths.append("Completed interview simulation and recorded baseline telemetry for improvement tracking.")

    weaknesses = []
    if answered_count < len(questions):
        weaknesses.append(f"Left {len(questions) - answered_count} question(s) unanswered, reducing technical relevance score.")
    if total_fillers > 3:
        weaknesses.append(f"Detected {total_fillers} verbal hesitation fillers ('um', 'like', 'basically') across responses.")
    if base_tech < 75:
        weaknesses.append("Answers missed several domain keywords expected in reference technical criteria.")
    if not weaknesses:
        weaknesses.append("Can further elevate responses with quantified production metrics and architecture edge-case analysis.")

    improvement_suggestions = [
        "Replace verbal fillers with brief 2-second deliberate pauses when organizing technical explanations.",
        "Structure behavioral answers explicitly using STAR (Situation, Task, Action, Result) with measurable outcomes.",
    ]
    if base_tech < 75:
        improvement_suggestions.append(f"Review core {session.domain} concepts and include concrete time/space/latency trade-offs.")

    low_competencies = [qe['competency'] for qe in question_evaluations if qe['score'] < 75]
    practice_recommendations = [
        f"Run a targeted {session.domain} drill focusing on {low_competencies[0] if low_competencies else 'core architecture trade-offs'}."
    ]
    practice_recommendations.append("Compare each submitted response against the reference model answers in the breakdown below.")

    if answered_count > 0:
        ai_summary = ai_service.synthesize_interview_feedback({
            'domain': session.domain,
            'category': session.category,
            'difficulty': session.difficulty,
            'overall_score': overall_score,
            'technical_score': base_tech,
            'communication_score': base_comm,
            'confidence_score': base_conf,
            'professionalism_score': base_prof,
            'avg_wpm': avg_wpm,
            'total_fillers': total_fillers,
            'answered_count': answered_count,
            'total_questions': len(questions),
            'questions_breakdown': [
                {
                    'competency': qe['competency'],
                    'score': qe['score'],
                    'critique': qe['critique'],
                }
                for qe in question_evaluations
            ],
        })
        if ai_summary:
            if ai_summary.get('strengths'):
                strengths = ai_summary['strengths'][:4]
            if ai_summary.get('weaknesses'):
                weaknesses = ai_summary['weaknesses'][:4]
            if ai_summary.get('improvement_suggestions'):
                improvement_suggestions = ai_summary['improvement_suggestions'][:4]
            if ai_summary.get('practice_recommendations'):
                practice_recommendations = ai_summary['practice_recommendations'][:3]

    learning_resources = DOMAIN_RESOURCES.get(session.domain, DOMAIN_RESOURCES['Software Engineering'])

    evaluation, _ = Evaluation.objects.update_or_create(
        session=session,
        defaults={
            'communication_score': base_comm,
            'confidence_score': base_conf,
            'technical_relevance_score': base_tech,
            'professionalism_score': base_prof,
            'overall_score': overall_score,
            'rating_band': rating_band,
            'strengths': strengths,
            'weaknesses': weaknesses,
            'improvement_suggestions': improvement_suggestions,
            'practice_recommendations': practice_recommendations,
            'learning_resources': learning_resources,
            'question_evaluations': question_evaluations,
        },
    )

    return {
        'id': str(evaluation.id),
        'overall_score': evaluation.overall_score,
        'rating_band': evaluation.rating_band,
        'communication_score': evaluation.communication_score,
        'confidence_score': evaluation.confidence_score,
        'technical_relevance_score': evaluation.technical_relevance_score,
        'professionalism_score': evaluation.professionalism_score,
        'strengths': evaluation.strengths,
        'weaknesses': evaluation.weaknesses,
        'improvement_suggestions': evaluation.improvement_suggestions,
        'practice_recommendations': evaluation.practice_recommendations,
        'learning_resources': evaluation.learning_resources,
        'question_evaluations': evaluation.question_evaluations,
    }
