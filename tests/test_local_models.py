import unittest
from unittest.mock import AsyncMock, patch

from api.local_models import (
    LocalModelError,
    aggregate_sentiments,
    chunk_text,
    prepare_texts,
    rank_texts,
    sentiment_from_prediction,
)


class SentimentNormalizationTests(unittest.TestCase):
    def test_normalizes_go_emotions_labels(self) -> None:
        signal = sentiment_from_prediction(
            [
                {"label": "joy", "score": 0.8},
                {"label": "annoyance", "score": 0.2},
            ]
        )

        self.assertEqual(signal["label"], "positive")
        self.assertAlmostEqual(signal["score"], 0.6)
        self.assertEqual(signal["confidence"], 0.8)

    def test_normalizes_star_labels(self) -> None:
        signal = sentiment_from_prediction(
            [{"label": "1 star", "score": 0.75}, {"label": "5 stars", "score": 0.25}]
        )

        self.assertEqual(signal["label"], "negative")
        self.assertAlmostEqual(signal["score"], -0.5)

    def test_does_not_guess_generic_label_ids(self) -> None:
        self.assertIsNone(
            sentiment_from_prediction([{"label": "LABEL_1", "score": 0.99}])
        )

    def test_aggregates_signals_by_confidence(self) -> None:
        aggregate = aggregate_sentiments(
            [
                {"label": "positive", "score": 1.0, "confidence": 0.8},
                {"label": "negative", "score": -1.0, "confidence": 0.2},
            ]
        )

        self.assertEqual(aggregate["label"], "positive")
        self.assertAlmostEqual(aggregate["score"], 0.6)
        self.assertEqual(aggregate["sampleCount"], 2)


class TextPreparationTests(unittest.IsolatedAsyncioTestCase):
    async def test_ranking_removes_near_duplicates(self) -> None:
        vectors = [
            [1.0, 0.0],
            [1.0, 0.0],
            [0.999, 0.001],
            [0.0, 1.0],
        ]
        with patch("api.local_models.embed_texts", AsyncMock(return_value=vectors)):
            selected = await rank_texts("query", ["best", "duplicate", "other"], 3)

        self.assertEqual(selected, [0, 2])

    async def test_preparation_falls_back_when_gpu_is_unavailable(self) -> None:
        unavailable = AsyncMock(side_effect=LocalModelError("offline"))
        with (
            patch("api.local_models.rank_texts", unavailable),
            patch("api.local_models.classify_texts", unavailable),
        ):
            prepared = await prepare_texts(
                "query", ["first", "second", "third"], limit=2
            )

        self.assertEqual(prepared.texts, ["first", "second"])
        self.assertFalse(prepared.embedding_applied)
        self.assertFalse(prepared.classification_applied)
        self.assertEqual(len(prepared.errors), 2)

    def test_chunking_covers_long_text_with_overlap(self) -> None:
        text = " ".join(f"word-{index}" for index in range(1_000))
        chunks = chunk_text(text, size=500, overlap=50)

        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(chunks))
        self.assertIn("word-0", chunks[0])
        self.assertIn("word-999", chunks[-1])


if __name__ == "__main__":
    unittest.main()
