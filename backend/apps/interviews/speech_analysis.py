import re

FILLER_WORDS = [
    'um', 'uh', 'like', 'you know', 'basically', 'actually',
    'literally', 'so yeah', 'sort of', 'kind of', 'i mean'
]


def _compute_grammar_score(text: str, words: list) -> float:
    """Heuristic structural & grammar quality score (0-100) from real transcript text."""
    if not words:
        return 0.0
    score = 88.0
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
    avg_len = len(words) / max(len(sentences), 1)
    if avg_len < 4:
        score -= 10.0  # fragmented thoughts
    elif avg_len > 45:
        score -= 8.0   # run-on sentences lacking punctuation/breaks

    # Repeated consecutive words ("the the", "and and")
    repeats = sum(1 for i in range(1, len(words)) if words[i].lower() == words[i - 1].lower())
    score -= min(repeats * 5.0, 18.0)

    # Capitalization cue for multi-sentence responses
    if len(sentences) >= 2:
        cap_ratio = sum(1 for s in sentences if s and s[0].isupper()) / len(sentences)
        if cap_ratio < 0.5:
            score -= 6.0

    # Common speech disfluency phrases
    lower_t = text.lower()
    if re.search(r'\b(kind of like|sort of like|you know what i mean)\b', lower_t):
        score -= 5.0

    return round(min(max(score, 35.0), 98.0), 1)


def _compute_pronunciation_score(words: list, filler_ratio: float, lexical_diversity: float) -> float:
    """Articulation & intelligibility proxy derived from recognized word completeness and lexical fluency."""
    if not words:
        return 0.0
    short_fragments = sum(1 for w in words if len(w) == 1 and w.lower() not in ('i', 'a'))
    frag_ratio = short_fragments / len(words)
    score = 86.0 + (lexical_diversity * 8.0) - (filler_ratio * 65.0) - (frag_ratio * 40.0)
    return round(min(max(score, 40.0), 97.0), 1)


def analyze_speech_content(text: str, duration_seconds: int = 45) -> dict:
    """
    Analyzes candidate response for measurable communication metrics:
    word count, words per minute (WPM), filler-word frequency, lexical diversity,
    grammar quality, pronunciation clarity proxy, and clarity rating.
    """
    clean_text = (text or '').strip()
    words = re.findall(r"\b[\w']+\b", clean_text)
    word_count = len(words)

    if word_count == 0:
        return {
            'word_count': 0,
            'wpm': 0,
            'filler_count': 0,
            'fillers_detected': [],
            'lexical_diversity': 0.0,
            'grammar_score': 0.0,
            'pronunciation_score': 0.0,
            'clarity': 'No Speech Input',
        }

    # Compute realistic WPM from actual duration (clamped minimum 10s for short answers)
    effective_seconds = max(int(duration_seconds or 30), 10)
    duration_min = effective_seconds / 60.0
    wpm = int(round(word_count / duration_min))

    lower_text = clean_text.lower()
    detected_fillers = []
    total_fillers = 0

    for filler in FILLER_WORDS:
        count = len(re.findall(r'\b' + re.escape(filler) + r'\b', lower_text))
        if count > 0:
            detected_fillers.append({'word': filler, 'count': count})
            total_fillers += count

    unique_words = len(set(w.lower() for w in words))
    lexical_diversity = round(unique_words / word_count, 2)

    filler_ratio = total_fillers / word_count
    if filler_ratio < 0.03:
        clarity_rating = 'Optimal'
    elif filler_ratio < 0.07:
        clarity_rating = 'Moderate'
    else:
        clarity_rating = 'Elevated Filler Frequency'

    grammar_score = _compute_grammar_score(clean_text, words)
    pronunciation_score = _compute_pronunciation_score(words, filler_ratio, lexical_diversity)

    return {
        'word_count': word_count,
        'wpm': wpm,
        'filler_count': total_fillers,
        'fillers_detected': detected_fillers,
        'lexical_diversity': lexical_diversity,
        'grammar_score': grammar_score,
        'pronunciation_score': pronunciation_score,
        'clarity': clarity_rating,
    }
