import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from charsiu_backend import (
    _combine_total_score,
    _combine_word_score,
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

    def test_reference_cache_key_normalizes_whitespace_and_case(self):
        self.assertEqual(
            _reference_cache_key("  Please   SHOW me your license. "),
            _reference_cache_key("please show me your license."),
        )


if __name__ == "__main__":
    unittest.main()
