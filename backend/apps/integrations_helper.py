def get_ai_questions_safe(domain, category, difficulty, count, focus_skills, user_email):
    try:
        from integrations.ai.provider import AIProviderService
        service = AIProviderService(user_email=user_email)
        return service.generate_questions(domain, category, difficulty, count, focus_skills)
    except Exception:
        return None
