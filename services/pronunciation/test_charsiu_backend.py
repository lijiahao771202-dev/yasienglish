import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from charsiu_backend import (
    _combine_content_reproduction,
    _combine_listening_total_score,
    _combine_total_score,
    _combine_word_score,
    _compute_transcript_match_details,
    _compute_transcript_match_score,
    _get_scoring_profile,
    _reference_cache_key,
)


class CharsiuBackendScoringTest(unittest.TestCase):
    def test_word_score_prioritizes_confidence(self):
        score = _combine_word_score(
            confidence_score=8.0,
            coverage_score=6.0,
            duration_score=4.0,
        )

        self.assertEqual(score, 7.2)

    def test_total_score_prioritizes_accuracy(self):
        score = _combine_total_score(
            accuracy=8.0,
            completeness=10.0,
            fluency=6.0,
            prosody=4.0,
        )

        self.assertEqual(score, 7.6)

    def test_listening_profile_shifts_weight_to_content_at_low_elo(self):
        profile = _get_scoring_profile(600)
        score = _combine_listening_total_score(
            content_reproduction=8.0,
            rhythm_fluency=6.0,
            pronunciation_clarity=4.0,
            profile=profile,
        )

        self.assertEqual(score, 5.8)

    def test_high_elo_caps_total_when_content_is_too_low(self):
        profile = _get_scoring_profile(2000)
        score = _combine_listening_total_score(
            content_reproduction=5.5,
            rhythm_fluency=8.0,
            pronunciation_clarity=8.5,
            profile=profile,
        )

        self.assertEqual(score, 6.5)

    def test_low_elo_caps_total_when_pronunciation_is_far_below_content(self):
        profile = _get_scoring_profile(600)
        score = _combine_listening_total_score(
            content_reproduction=6.8,
            rhythm_fluency=6.6,
            pronunciation_clarity=3.3,
            profile=profile,
            transcript_match_score=0.82,
            mispronounced_ratio=0.45,
        )

        self.assertEqual(score, 5.8)

    def test_transcript_gate_caps_total_when_transcript_is_unrelated(self):
        profile = _get_scoring_profile(600)
        score = _combine_listening_total_score(
            content_reproduction=8.1,
            rhythm_fluency=7.0,
            pronunciation_clarity=6.9,
            profile=profile,
            transcript_match_score=0.18,
            tail_content_coverage=0.0,
            mispronounced_ratio=0.15,
        )

        self.assertEqual(score, 4.5)

    def test_transcript_gate_caps_total_when_tail_content_collapses(self):
        profile = _get_scoring_profile(600)
        score = _combine_listening_total_score(
            content_reproduction=8.1,
            rhythm_fluency=8.2,
            pronunciation_clarity=7.4,
            profile=profile,
            transcript_match_score=0.72,
            tail_content_coverage=0.0,
            mispronounced_ratio=0.18,
        )

        self.assertEqual(score, 6.5)

    def test_mid_and_high_elo_cap_totals_when_pronunciation_is_too_low(self):
        mid_profile = _get_scoring_profile(1400)
        high_profile = _get_scoring_profile(2200)

        mid_score = _combine_listening_total_score(
            content_reproduction=8.2,
            rhythm_fluency=7.8,
            pronunciation_clarity=5.2,
            profile=mid_profile,
            transcript_match_score=0.91,
            tail_content_coverage=1.0,
            content_recall=1.0,
            content_precision=1.0,
            content_substitution_count=0.0,
            mispronounced_ratio=0.10,
        )
        high_score = _combine_listening_total_score(
            content_reproduction=8.5,
            rhythm_fluency=8.4,
            pronunciation_clarity=6.1,
            profile=high_profile,
            transcript_match_score=0.95,
            tail_content_coverage=1.0,
            content_recall=1.0,
            content_precision=1.0,
            content_substitution_count=0.0,
            mispronounced_ratio=0.05,
        )

        self.assertEqual(mid_score, 6.8)
        self.assertEqual(high_score, 6.2)

    def test_content_recall_and_precision_caps_total_by_band(self):
        profile = _get_scoring_profile(1200)
        score = _combine_listening_total_score(
            content_reproduction=8.4,
            rhythm_fluency=8.1,
            pronunciation_clarity=7.9,
            profile=profile,
            transcript_match_score=0.78,
            tail_content_coverage=1.0,
            content_recall=0.76,
            content_precision=0.90,
            content_substitution_count=0.0,
            mispronounced_ratio=0.10,
        )

        self.assertEqual(score, 6.4)

    def test_multiple_content_substitutions_cap_total_and_content(self):
        profile = _get_scoring_profile(600)
        score = _combine_listening_total_score(
            content_reproduction=8.8,
            rhythm_fluency=8.0,
            pronunciation_clarity=7.6,
            profile=profile,
            transcript_match_score=0.76,
            tail_content_coverage=1.0,
            content_recall=0.86,
            content_precision=0.80,
            content_substitution_count=2.0,
            mispronounced_ratio=0.10,
        )

        self.assertEqual(score, 7.3)

    def test_content_reproduction_penalizes_tail_words_with_collapsed_durations(self):
        full_score = _combine_content_reproduction(
            [
                {"coverage": 1.0, "duration": 0.24, "is_content_word": True},
                {"coverage": 1.0, "duration": 0.22, "is_content_word": True},
                {"coverage": 1.0, "duration": 0.33, "is_content_word": True},
                {"coverage": 1.0, "duration": 0.39, "is_content_word": True},
                {"coverage": 1.0, "duration": 0.27, "is_content_word": True},
                {"coverage": 1.0, "duration": 0.25, "is_content_word": True},
                {"coverage": 1.0, "duration": 0.45, "is_content_word": True},
                {"coverage": 1.0, "duration": 0.31, "is_content_word": True},
                {"coverage": 1.0, "duration": 0.33, "is_content_word": True},
            ]
        )
        truncated_tail_score = _combine_content_reproduction(
            [
                {"coverage": 1.0, "duration": 0.24, "is_content_word": True},
                {"coverage": 1.0, "duration": 0.22, "is_content_word": True},
                {"coverage": 1.0, "duration": 0.33, "is_content_word": True},
                {"coverage": 1.0, "duration": 0.39, "is_content_word": True},
                {"coverage": 1.0, "duration": 0.27, "is_content_word": True},
                {"coverage": 1.0, "duration": 0.06, "is_content_word": True},
                {"coverage": 1.0, "duration": 0.03, "is_content_word": True},
                {"coverage": 1.0, "duration": 0.05, "is_content_word": True},
                {"coverage": 1.0, "duration": 0.03, "is_content_word": True},
            ]
        )

        self.assertGreaterEqual(full_score, 9.0)
        self.assertLess(truncated_tail_score, 7.0)
        self.assertGreater(full_score - truncated_tail_score, 2.0)

    def test_content_reproduction_penalizes_missing_content_words_more_than_function_words(self):
        function_word_drop = _combine_content_reproduction(
            [
                {"coverage": 1.0, "duration": 0.26, "is_content_word": False},
                {"coverage": 1.0, "duration": 0.24, "is_content_word": True},
                {"coverage": 1.0, "duration": 0.31, "is_content_word": True},
                {"coverage": 1.0, "duration": 0.33, "is_content_word": False},
                {"coverage": 1.0, "duration": 0.29, "is_content_word": True},
                {"coverage": 1.0, "duration": 0.05, "is_content_word": False},
                {"coverage": 1.0, "duration": 0.04, "is_content_word": False},
            ]
        )
        content_word_drop = _combine_content_reproduction(
            [
                {"coverage": 1.0, "duration": 0.26, "is_content_word": False},
                {"coverage": 1.0, "duration": 0.24, "is_content_word": True},
                {"coverage": 1.0, "duration": 0.31, "is_content_word": True},
                {"coverage": 1.0, "duration": 0.33, "is_content_word": False},
                {"coverage": 1.0, "duration": 0.05, "is_content_word": True},
                {"coverage": 1.0, "duration": 0.04, "is_content_word": True},
                {"coverage": 1.0, "duration": 0.29, "is_content_word": False},
            ]
        )

        self.assertLess(content_word_drop, function_word_drop)
        self.assertGreater(function_word_drop - content_word_drop, 0.8)

    def test_reference_cache_key_normalizes_whitespace_and_case(self):
        self.assertEqual(
            _reference_cache_key("  Please   SHOW me your license. "),
            _reference_cache_key("please show me your license."),
        )

    def test_transcript_match_score_rewards_close_repetition(self):
        score = _compute_transcript_match_score(
            "Keep the envelope near the counter for the meeting.",
            "keep the envelope near the counter for the meeting",
        )

        self.assertGreaterEqual(score, 0.95)

    def test_transcript_match_score_rejects_unrelated_speech(self):
        score = _compute_transcript_match_score(
            "Keep the envelope near the counter for the meeting.",
            "banana traffic yellow maybe later",
        )

        self.assertLess(score, 0.2)

    def test_transcript_match_details_penalize_missing_tail_keywords(self):
        details = _compute_transcript_match_details(
            "Please send the class photo to the parents group tonight.",
            "Please send a class photo to the parrot of god nine.",
        )

        self.assertGreater(details["score"], 0.5)
        self.assertLess(details["tail_content_coverage"], 0.34)
        self.assertGreaterEqual(details["content_substitution_count"], 2.0)

    def test_transcript_match_details_penalize_content_word_substitutions(self):
        details = _compute_transcript_match_details(
            "Please bring the menu to the counter after practice today.",
            "Please spread the manual to the counter after practice today.",
        )

        self.assertLess(details["content_recall"], 0.8)
        self.assertLess(details["content_precision"], 0.8)
        self.assertGreaterEqual(details["content_substitution_count"], 1.0)
        self.assertLess(details["score"], 0.82)


if __name__ == "__main__":
    unittest.main()
