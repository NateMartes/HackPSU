import json
import unittest
from unittest.mock import AsyncMock, patch

from api.local_models import PreparedTexts
from api import sentiment as sentiment_module
from api.sentiment import PriceSentiment, ShoppingSentiment, VideoSentiment
from api.sources import prices as prices_module
from api.sources import shopping as shopping_module
from api.type import Product


PRODUCT = Product(
    asin="B000TEST00",
    url="https://www.amazon.com/dp/B000TEST00",
    title="Example Headphones",
    brand="Example",
    model="X1",
    variant=None,
    price=99.0,
    currency="USD",
    image=None,
)


async def response_events(response: object) -> list[dict]:
    chunks = [chunk async for chunk in response.body_iterator]
    return [json.loads(line) for chunk in chunks for line in chunk.decode().splitlines()]


class GpuRouteIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_shopping_uses_gpu_preparation_before_gemini(self) -> None:
        prepared = PreparedTexts(
            texts=["Great sound."],
            selected_indices=[1],
            input_count=2,
            embedding_applied=True,
            classification_applied=True,
            sentiment={
                "label": "positive",
                "score": 0.8,
                "confidence": 0.9,
                "sampleCount": 1,
            },
            errors=[],
        )
        shopping_information = {
            "rating": 4.5,
            "reviews": 2,
            "review_details": [
                {"text": "Repeated review."},
                {"text": "Great sound."},
            ],
        }
        analysis = ShoppingSentiment(
            label="positive", score=0.8, summary="Strong reviews.", aspects=[]
        )

        with (
            patch.object(
                shopping_module.asyncio,
                "to_thread",
                AsyncMock(
                    return_value=(shopping_information, {})
                ),
            ),
            patch.object(
                shopping_module,
                "prepare_texts",
                AsyncMock(return_value=prepared),
            ) as prepare_mock,
            patch.object(
                shopping_module,
                "analyze_shopping_information",
                AsyncMock(return_value=analysis),
            ) as analyze_mock,
        ):
            response = await shopping_module.shopping(PRODUCT)
            events = await response_events(response)

        self.assertEqual(
            [event["type"] for event in events],
            ["shopping-information", "gpu-analysis", "analysis", "result"],
        )
        prepare_mock.assert_awaited_once()
        sent_information = analyze_mock.await_args.args[1]
        self.assertEqual(sent_information["review_details"], [{"text": "Great sound."}])
        self.assertTrue(events[-1]["data"]["localModel"]["embeddingApplied"])

    async def test_youtube_prepares_transcript_before_gemini(self) -> None:
        prepared = PreparedTexts(
            texts=["Selected review evidence."],
            selected_indices=[1],
            input_count=3,
            embedding_applied=True,
            classification_applied=True,
            sentiment={
                "label": "positive",
                "score": 0.7,
                "confidence": 0.8,
                "sampleCount": 1,
            },
            errors=[],
        )
        video_analysis = VideoSentiment(
            label="positive", score=0.6, summary="Positive review.", aspects=[]
        )
        progress_events: list[dict] = []

        async def on_progress(event: dict) -> None:
            progress_events.append(event)

        class FakeAioClient:
            async def __aenter__(self) -> object:
                return object()

            async def __aexit__(self, *args: object) -> None:
                return None

        class FakeClient:
            aio = FakeAioClient()

        payload = {
            "items": [
                {
                    "id": {"videoId": "video-1"},
                    "snippet": {"title": "Independent review"},
                }
            ]
        }
        transcripts = {
            "video-1": {"transcript": {"text": "Full transcript text."}}
        }

        with (
            patch.object(
                sentiment_module,
                "prepare_document",
                AsyncMock(return_value=prepared),
            ),
            patch.object(
                sentiment_module,
                "_analyze_video",
                AsyncMock(return_value=video_analysis),
            ) as analyze_mock,
            patch.object(
                sentiment_module, "_get_gemini_api_key", return_value="test-key"
            ),
            patch.object(sentiment_module.genai, "Client", return_value=FakeClient()),
        ):
            analyses, summary = await sentiment_module.analyze_youtube_reviews(
                PRODUCT, payload, transcripts, on_progress
            )

        self.assertEqual(progress_events[0]["type"], "gpu-analysis")
        self.assertEqual(analyze_mock.await_args.args[4], "Selected review evidence.")
        self.assertTrue(analyses["video-1"]["localModel"]["embeddingApplied"])
        self.assertEqual(summary["reviewAnalyses"][0]["sentiment"]["score"], 0.6)

    async def test_prices_use_embeddings_without_classification(self) -> None:
        prepared = PreparedTexts(
            texts=["Example X1 Headphones"],
            selected_indices=[0],
            input_count=2,
            embedding_applied=True,
            classification_applied=False,
            sentiment=None,
            errors=[],
        )
        price_information = {
            "current_price": 99.0,
            "currency": "USD",
            "offers": [
                {"title": "Example X1 Headphones", "price": "$95"},
                {"title": "Unrelated accessory", "price": "$10"},
            ],
        }
        analysis = PriceSentiment(
            label="neutral", score=0.0, summary="Typical price.", aspects=[]
        )

        with (
            patch.object(
                prices_module.asyncio,
                "to_thread",
                AsyncMock(return_value=(price_information, {})),
            ),
            patch.object(
                prices_module,
                "prepare_texts",
                AsyncMock(return_value=prepared),
            ) as prepare_mock,
            patch.object(
                prices_module,
                "analyze_price_information",
                AsyncMock(return_value=analysis),
            ) as analyze_mock,
        ):
            response = await prices_module.prices(PRODUCT)
            events = await response_events(response)

        self.assertEqual(
            [event["type"] for event in events],
            ["price-information", "gpu-analysis", "analysis", "result"],
        )
        self.assertFalse(prepare_mock.await_args.kwargs["classify"])
        sent_information = analyze_mock.await_args.args[1]
        self.assertEqual(
            sent_information["offers"],
            [{"title": "Example X1 Headphones", "price": "$95"}],
        )
        self.assertTrue(events[-1]["data"]["localModel"]["embeddingApplied"])


if __name__ == "__main__":
    unittest.main()
