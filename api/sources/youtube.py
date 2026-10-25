import asyncio
import html
import json
import os
import re
import traceback
from collections.abc import AsyncIterator
from typing import Any
from urllib.parse import quote_plus

import httpx
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from youtube_transcript_api import YouTubeTranscriptApi, YouTubeTranscriptApiException
from youtube_transcript_api.proxies import WebshareProxyConfig

from api.sentiment import MAX_ANALYZED_VIDEOS, analyze_youtube_reviews
from api.type import Product


router = APIRouter(tags=["youtube"])

YOUTUBE_SEARCH_API_URL = "https://www.googleapis.com/youtube/v3/search"
YOUTUBE_VIDEOS_API_URL = "https://www.googleapis.com/youtube/v3/videos"
YOUTUBE_WATCH_URL = "https://www.youtube.com/watch?v="
YOUTUBE_API_KEY_ENV = "YOUTUBE_API_KEY"
YOUTUBE_PROXY_USERNAME_ENV = "YOUTUBE_PROXY_USERNAME"
YOUTUBE_PROXY_PASSWORD_ENV = "YOUTUBE_PROXY_PASSWORD"
YOUTUBE_TEST_DATA_ENV = "YOUTUBE_TEST_DATA"
NON_SPEECH_PATTERN = re.compile(r"\[(music|applause|laughter|silence)\]", re.I)
YOUTUBE_SEARCH_RESULT_LIMIT = 10
TRANSCRIPT_BATCH_SIZE = 5
YOUTUBE_QUOTA_REASONS = {"quotaExceeded", "dailyLimitExceeded"}


def _build_search_params(query: str, api_key: str) -> dict[str, str | int]:
    return {
        "part": "snippet",
        "q": query,
        "type": "video",
        "maxResults": YOUTUBE_SEARCH_RESULT_LIMIT,
        "order": "relevance",
        "relevanceLanguage": "en",
        "videoCaption": "closedCaption",  # vital!
        "key": api_key,
    }


def _get_youtube_api_key() -> str:
    api_key = os.getenv(YOUTUBE_API_KEY_ENV, "").strip()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"{YOUTUBE_API_KEY_ENV} is not configured.",
        )

    return api_key


def _get_youtube_proxy_credentials() -> tuple[str, str] | None:
    """Return optional Webshare credentials, requiring both values together."""
    username = os.getenv(YOUTUBE_PROXY_USERNAME_ENV, "").strip()
    password = os.getenv(YOUTUBE_PROXY_PASSWORD_ENV, "").strip()
    if bool(username) != bool(password):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                f"{YOUTUBE_PROXY_USERNAME_ENV} and {YOUTUBE_PROXY_PASSWORD_ENV} "
                "must both be configured."
            ),
        )
    if not username:
        return None
    return username, password


def _create_transcript_api(
    proxy_credentials: tuple[str, str] | None,
) -> YouTubeTranscriptApi:
    if proxy_credentials is None:
        return YouTubeTranscriptApi()

    username, password = proxy_credentials
    return YouTubeTranscriptApi(
        proxy_config=WebshareProxyConfig(
            proxy_username=username,
            proxy_password=password,
            filter_ip_locations=["us"],
        )
    )


async def _search_youtube(product: Product) -> dict[str, Any]:
    product_title = product.title.strip()
    if not product_title:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The product title must not be empty.",
        )
    if _youtube_test_data_enabled():
        return _youtube_test_payload(product, "YOUTUBE_TEST_DATA is enabled.")

    api_key = _get_youtube_api_key()
    query = f"{product_title}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                YOUTUBE_SEARCH_API_URL,
                params=_build_search_params(query, api_key),
            )
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
        if _is_youtube_quota_error(exc.response):
            print(
                "YouTube search quota exhausted; returning local test data...",
                flush=True,
            )
            return _youtube_test_payload(product, "YouTube search quota is exhausted.")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="YouTube Data API rejected the search request.",
        ) from exc
    except (httpx.RequestError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="YouTube Data API is unavailable.",
        ) from exc

    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="YouTube Data API returned an unexpected response.",
        )

    return payload


def _is_youtube_quota_error(response: httpx.Response) -> bool:
    """Return whether a YouTube error response reports an exhausted quota."""
    if response.status_code != status.HTTP_403_FORBIDDEN:
        return False
    try:
        payload = response.json()
    except ValueError:
        return False
    error = payload.get("error") if isinstance(payload, dict) else None
    if not isinstance(error, dict):
        return False
    reasons = {
        item.get("reason")
        for item in error.get("errors", [])
        if isinstance(item, dict)
    }
    message = error.get("message")
    return bool(reasons & YOUTUBE_QUOTA_REASONS) or (
        isinstance(message, str) and "quota" in message.casefold()
    )


def _youtube_test_data_enabled() -> bool:
    return os.getenv(YOUTUBE_TEST_DATA_ENV, "").strip().casefold() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _youtube_test_payload(product: Product, reason: str) -> dict[str, Any]:
    """Return local, clearly labeled fixture data with the production schema."""
    fixture_reviews = [
        {
            "score": 0.55,
            "label": "positive",
            "summary": "Test fixture: everyday performance was reliable and easy to use.",
            "aspect": "Everyday use",
            "evidence": "It held up well during everyday use and was easy to operate.",
        },
        {
            "score": 0.05,
            "label": "neutral",
            "summary": "Test fixture: performance was acceptable, with no standout result.",
            "aspect": "Performance",
            "evidence": "Performance was acceptable, but it did not stand out either way.",
        },
        {
            "score": -0.25,
            "label": "negative",
            "summary": "Test fixture: initial setup was slower than expected.",
            "aspect": "Setup",
            "evidence": "The initial setup took longer than expected.",
        },
    ]
    items = []
    review_analyses = []
    previews = []
    search_url = (
        "https://www.youtube.com/results?search_query="
        f"{quote_plus(product.title + ' review')}"
    )

    for index, fixture in enumerate(fixture_reviews, start=1):
        title = f"Test review {index}: {product.title}"
        sentiment = {
            "label": fixture["label"],
            "score": fixture["score"],
            "summary": fixture["summary"],
            "aspects": [
                {
                    "aspect": fixture["aspect"],
                    "label": fixture["label"],
                    "score": fixture["score"],
                    "evidence": fixture["evidence"],
                }
            ],
        }
        items.append(
            {
                "id": {"kind": "prvsa#testVideo", "videoId": f"test-{index}"},
                "snippet": {
                    "title": title,
                    "description": "Local P.R.V.S.A. test fixture; not a real review.",
                    "channelTitle": "P.R.V.S.A. Test Fixture",
                },
                "transcript": {
                    "language": "English",
                    "languageCode": "en",
                    "isGenerated": False,
                    "text": fixture["evidence"],
                    "segments": [
                        {"text": fixture["evidence"], "start": 0.0, "duration": 5.0}
                    ],
                },
                "statistics": {
                    "viewCount": 0,
                    "likeCount": 0,
                    "likeToViewRatio": None,
                    "likeToViewPercentage": None,
                    "viewsPerLike": None,
                },
                "sentiment": sentiment,
                "sourceData": {"testFixture": True},
            }
        )
        review_analyses.append({"videoTitle": title, "sentiment": sentiment})
        previews.append(
            {
                "url": search_url,
                "title": title,
                "channelTitle": "P.R.V.S.A. Test Fixture",
                "thumbnail": None,
            }
        )

    return {
        "kind": "prvsa#youtubeTestData",
        "searchProvider": "local-test-fixture",
        "testData": True,
        "testDataReason": reason,
        "pageInfo": {"totalResults": len(items), "resultsPerPage": len(items)},
        "items": items,
        "reviewAnalyses": review_analyses,
        "testVideoPreviews": previews,
    }


def _parse_video_ids(payload: dict[str, Any]) -> list[str]:
    items = payload.get("items")
    if not isinstance(items, list):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="YouTube Data API returned an unexpected result list.",
        )

    video_ids = []
    for item in items:
        if not isinstance(item, dict):
            continue

        identifier = item.get("id")
        if not isinstance(identifier, dict):
            continue

        video_id = identifier.get("videoId")
        if isinstance(video_id, str):
            video_ids.append(video_id)

    return video_ids


def _normalized_channel_name(value: str) -> str:
    """Normalize brand/channel names while preserving whole-word boundaries."""
    words = re.findall(r"[^\W_]+", html.unescape(value).casefold())
    return " ".join(words)


def _names_share_identity(brand: str, channel_title: str) -> bool:
    """Match names by containment or by a shared distinctive leading root."""
    normalized_brand = _normalized_channel_name(brand)
    normalized_channel = _normalized_channel_name(channel_title)
    if not normalized_brand or not normalized_channel:
        return False

    padded_brand = f" {normalized_brand} "
    padded_channel = f" {normalized_channel} "
    if padded_brand in padded_channel or padded_channel in padded_brand:
        return True

    brand_root = normalized_brand.split()[0]
    channel_root = normalized_channel.split()[0]
    return len(brand_root) >= 4 and brand_root == channel_root


def _exclude_brand_owned_videos(
    payload: dict[str, Any], product: Product
) -> dict[str, Any]:
    """Remove search results uploaded by a channel matching the product brand."""
    if not product.brand:
        return payload

    items = payload.get("items")
    if not isinstance(items, list):
        return payload

    filtered_items = []
    excluded_items = []
    for item in items:
        if not isinstance(item, dict):
            filtered_items.append(item)
            continue

        snippet = item.get("snippet")
        channel_title = (
            snippet.get("channelTitle") if isinstance(snippet, dict) else None
        )
        is_brand_channel = (
            isinstance(channel_title, str)
            and _names_share_identity(product.brand, channel_title)
        )
        if not is_brand_channel:
            filtered_items.append(item)
        else:
            excluded_items.append(item)

    return {
        **payload,
        "items": filtered_items,
        "excludedBrandOwnedItems": excluded_items,
    }


def _parse_count(value: Any) -> int | None:
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def _parse_video_statistics(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    items = payload.get("items")
    if not isinstance(items, list):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="YouTube Data API returned an unexpected statistics list.",
        )

    results = {}
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            continue

        raw_statistics = item.get("statistics")
        if not isinstance(raw_statistics, dict):
            continue

        view_count = _parse_count(raw_statistics.get("viewCount"))
        like_count = _parse_count(raw_statistics.get("likeCount"))
        like_to_view_ratio = (
            like_count / view_count
            if like_count is not None and view_count not in (None, 0)
            else None
        )
        views_per_like = (
            view_count / like_count
            if view_count is not None and like_count not in (None, 0)
            else None
        )

        results[item["id"]] = {
            "statistics": {
                "viewCount": view_count,
                "likeCount": like_count,
                "likeToViewRatio": (
                    round(like_to_view_ratio, 6)
                    if like_to_view_ratio is not None
                    else None
                ),
                "likeToViewPercentage": (
                    round(like_to_view_ratio * 100, 2)
                    if like_to_view_ratio is not None
                    else None
                ),
                "viewsPerLike": (
                    round(views_per_like, 2) if views_per_like is not None else None
                ),
            },
            "rawStatistics": raw_statistics,
        }

    return results


async def _fetch_video_statistics(
    video_ids: list[str],
) -> dict[str, dict[str, Any]]:
    if not video_ids:
        return {}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                YOUTUBE_VIDEOS_API_URL,
                params={
                    "part": "statistics",
                    "id": ",".join(video_ids),
                    "key": _get_youtube_api_key(),
                },
            )
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="YouTube Data API rejected the statistics request.",
        ) from exc
    except (httpx.RequestError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="YouTube Data API statistics are unavailable.",
        ) from exc

    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="YouTube Data API returned unexpected statistics.",
        )

    return _parse_video_statistics(payload)


def _aggregate_transcript(snippets: list[dict[str, Any]]) -> str:
    cleaned_snippets = []

    for snippet in snippets:
        if not isinstance(snippet, dict) or not isinstance(snippet.get("text"), str):
            continue

        text = html.unescape(snippet["text"]).replace("\n", " ")
        text = NON_SPEECH_PATTERN.sub(" ", text)
        text = re.sub(r"\s+", " ", text).strip()

        if text:
            cleaned_snippets.append(text)

    return " ".join(cleaned_snippets)


def _fetch_transcript(
    video_id: str, proxy_credentials: tuple[str, str] | None
) -> tuple[str, dict[str, Any]]:
    try:
        transcript = _create_transcript_api(proxy_credentials).fetch(
            video_id, languages=["en"]
        )
        raw_segments = transcript.to_raw_data()
        result = {
            "transcript": {
                "language": transcript.language,
                "languageCode": transcript.language_code,
                "isGenerated": transcript.is_generated,
                "text": _aggregate_transcript(raw_segments),
                "segments": raw_segments,
            }
        }
    except YouTubeTranscriptApiException as exc:
        print(f"  No transcript for {video_id}: {type(exc).__name__}", flush=True)
        result = {
            "transcript": None,
            "transcriptError": type(exc).__name__,
        }

    return video_id, result


async def _fetch_transcripts(video_ids: list[str]) -> dict[str, dict[str, Any]]:
    proxy_credentials = _get_youtube_proxy_credentials()
    if proxy_credentials is not None:
        print("Using Webshare rotating residential proxies...", flush=True)

    transcripts: dict[str, dict[str, Any]] = {}
    for start in range(0, len(video_ids), TRANSCRIPT_BATCH_SIZE):
        batch = video_ids[start : start + TRANSCRIPT_BATCH_SIZE]
        results = await asyncio.gather(
            *(
                asyncio.to_thread(_fetch_transcript, video_id, proxy_credentials)
                for video_id in batch
            )
        )
        transcripts.update(results)

        usable_count = sum(
            1 for result in transcripts.values() if _has_transcript(result)
        )
        if usable_count >= MAX_ANALYZED_VIDEOS:
            break

    return transcripts


def _merge_transcripts(
    payload: dict[str, Any], transcripts: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    for item in payload["items"]:
        if not isinstance(item, dict) or not isinstance(item.get("id"), dict):
            continue

        video_id = item["id"].get("videoId")
        if isinstance(video_id, str) and video_id in transcripts:
            item.update(transcripts[video_id])

    return payload


def _merge_statistics(
    payload: dict[str, Any], statistics: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    for item in payload["items"]:
        if not isinstance(item, dict) or not isinstance(item.get("id"), dict):
            continue

        video_id = item["id"].get("videoId")
        if isinstance(video_id, str) and video_id in statistics:
            item.update(statistics[video_id])

    return payload


def _merge_sentiment(
    payload: dict[str, Any], analyses: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    for item in payload["items"]:
        if not isinstance(item, dict) or not isinstance(item.get("id"), dict):
            continue

        video_id = item["id"].get("videoId")
        if isinstance(video_id, str) and video_id in analyses:
            item.update(analyses[video_id])

    return payload


def _video_id_from_item(item: dict[str, Any]) -> str | None:
    identifier = item.get("id")
    if not isinstance(identifier, dict):
        return None
    video_id = identifier.get("videoId")
    return video_id if isinstance(video_id, str) else None


def _has_transcript(transcript_result: dict[str, Any] | None) -> bool:
    if not isinstance(transcript_result, dict):
        return False
    transcript = transcript_result.get("transcript")
    if not isinstance(transcript, dict):
        return False
    text = transcript.get("text")
    return isinstance(text, str) and bool(text.strip())


def _video_previews(
    payload: dict[str, Any], transcripts: dict[str, dict[str, Any]]
) -> list[dict[str, Any]]:
    """Build lightweight video cards for search results that have a transcript."""
    previews: list[dict[str, Any]] = []
    for item in payload.get("items", []):
        if not isinstance(item, dict):
            continue
        video_id = _video_id_from_item(item)
        if not video_id or not _has_transcript(transcripts.get(video_id)):
            continue

        snippet = item.get("snippet")
        snippet = snippet if isinstance(snippet, dict) else {}
        title = snippet.get("title")
        channel_title = snippet.get("channelTitle")
        thumbnails = snippet.get("thumbnails")
        thumbnails = thumbnails if isinstance(thumbnails, dict) else {}
        thumbnail = next(
            (
                candidate.get("url")
                for size in ("default", "medium", "high")
                if isinstance((candidate := thumbnails.get(size)), dict)
                and isinstance(candidate.get("url"), str)
            ),
            None,
        )
        previews.append(
            {
                "url": f"{YOUTUBE_WATCH_URL}{video_id}",
                "title": html.unescape(title) if isinstance(title, str) else None,
                "channelTitle": (
                    html.unescape(channel_title)
                    if isinstance(channel_title, str)
                    else None
                ),
                "thumbnail": thumbnail,
            }
        )
        if len(previews) >= MAX_ANALYZED_VIDEOS:
            break
    return previews


async def _youtube_events(
    product: Product, search_results: dict[str, Any], video_ids: list[str]
) -> AsyncIterator[dict[str, Any]]:
    """Yield stream events: videos (once transcripts are known), then the result."""
    if search_results.get("testData") is True:
        previews = search_results.get("testVideoPreviews")
        yield {
            "type": "videos",
            "videos": previews if isinstance(previews, list) else [],
        }
        yield {"type": "result", "data": search_results}
        return

    # Statistics are independent of transcripts/sentiment; fetch in background.
    print("Gathering YouTube video statistics...", flush=True)
    statistics_task = asyncio.create_task(_fetch_video_statistics(video_ids))
    try:
        print("Gathering YouTube transcripts...", flush=True)
        transcripts = await _fetch_transcripts(video_ids)

        # Only surface videos we can actually analyze.
        yield {"type": "videos", "videos": _video_previews(search_results, transcripts)}

        print("Analyzing review sentiment...", flush=True)
        progress_queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

        async def queue_progress(event: dict[str, Any]) -> None:
            await progress_queue.put(event)

        async def run_analysis() -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
            try:
                return await analyze_youtube_reviews(
                    product, search_results, transcripts, queue_progress
                )
            finally:
                await progress_queue.put(None)

        analysis_task = asyncio.create_task(run_analysis())
        while (progress_event := await progress_queue.get()) is not None:
            yield progress_event
        analyses, summary = await analysis_task
        try:
            statistics = await statistics_task
        except HTTPException as exc:
            # Statistics improve the evidence record but are not required for
            # transcript sentiment, so let the otherwise successful analysis
            # complete without them.
            statistics = {}
            search_results["statisticsError"] = exc.detail
    finally:
        statistics_task.cancel()

    results = _merge_transcripts(search_results, transcripts)
    results = _merge_statistics(results, statistics)
    results = _merge_sentiment(results, analyses)
    results.update(summary)

    # Return the complete enriched search response. Existing consumers can keep
    # reading reviewAnalyses, while future consumers can use the source snippets,
    # transcripts, statistics, and per-video sentiment retained on each item.
    yield {"type": "result", "data": results}


def _ndjson(event: dict[str, Any]) -> bytes:
    return (
        json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n"
    ).encode("utf-8")


@router.post("/youtube")
async def youtube(product: Product) -> StreamingResponse:
    """Search YouTube for product reviews and stream results as NDJSON.

    Events, one JSON object per line:
      {"type": "videos", "videos":
        [{"url", "title", "channelTitle", "thumbnail"}, ...]}
          Only videos with a usable transcript; sent once transcripts are fetched.
      {"type": "analysis-started", "reviewIndex", "reviewCount", "videoTitle"}
      {"type": "analysis-delta", "reviewIndex", "reviewCount", "videoTitle", "delta"}
          Tagged partial structured output from cloud Gemini.
      {"type": "analysis-result", "reviewIndex", "reviewCount", "videoTitle", "sentiment"}
          A complete schema-validated review analysis.
      {"type": "result", "data":
        {YouTube search response with enriched "items", "reviewAnalyses",
         "sentimentSummaryError"?}}
      {"type": "error", "status": int, "error": str}   (sent instead of "result")
    """
    # Search before opening the stream so config/search failures still return
    # a normal HTTP error status.
    print("Gathering YouTube videos...", flush=True)
    search_results = await _search_youtube(product)
    search_results = _exclude_brand_owned_videos(search_results, product)
    video_ids = _parse_video_ids(search_results)

    async def event_stream() -> AsyncIterator[bytes]:
        try:
            async for event in _youtube_events(product, search_results, video_ids):
                yield _ndjson(event)
        except HTTPException as exc:
            yield _ndjson(
                {"type": "error", "status": exc.status_code, "error": exc.detail}
            )
        except Exception:
            traceback.print_exc()
            yield _ndjson(
                {
                    "type": "error",
                    "status": status.HTTP_500_INTERNAL_SERVER_ERROR,
                    "error": "YouTube analysis failed.",
                }
            )

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
