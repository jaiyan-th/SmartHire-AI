import re

FILLER_WORDS = [
    'um', 'uh', 'like', 'you know', 'basically', 'actually',
    'literally', 'so yeah', 'sort of', 'kind of', 'i mean'
]


def analyze_speech_content(text: str, duration_seconds: int = 45) -> dict:
    """
    Analyzes candidate response for measurable communication metrics:
    word count, words per minute (WPM), filler-word frequency, lexical diversity, and clarity.
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

    return {
        'word_count': word_count,
        'wpm': wpm,
        'filler_count': total_fillers,
        'fillers_detected': detected_fillers,
        'lexical_diversity': lexical_diversity,
        'clarity': clarity_rating,
    }
