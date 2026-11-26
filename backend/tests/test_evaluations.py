from django.test import TestCase
from apps.evaluations.engine import compute_overall_score, get_rating_band

class EvaluationEngineTests(TestCase):
    def test_deterministic_scoring_formula(self):
        # Overall = Comm * 0.30 + Conf * 0.25 + Tech * 0.30 + Prof * 0.15
        comm = 85.0
        conf = 88.0
        tech = 84.0
        prof = 80.0
        expected = (85.0 * 0.30) + (88.0 * 0.25) + (84.0 * 0.30) + (80.0 * 0.15)
        # 25.5 + 22.0 + 25.2 + 12.0 = 84.7
        computed = compute_overall_score(comm, conf, tech, prof)
        self.assertEqual(computed, round(expected, 2))

    def test_rating_bands(self):
        self.assertEqual(get_rating_band(95), "Excellent")
        self.assertEqual(get_rating_band(85), "Good")
        self.assertEqual(get_rating_band(70), "Average")
        self.assertEqual(get_rating_band(50), "Needs Improvement")
        self.assertEqual(get_rating_band(30), "Poor")
