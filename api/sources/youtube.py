import asyncio
import html
import json
import os
import re
import traceback
from collections.abc import AsyncIterator
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from youtube_transcript_api import YouTubeTranscriptApi, YouTubeTranscriptApiException

from api.sentiment import analyze_youtube_reviews
from api.type import Product


router = APIRouter(tags=["youtube"])

YOUTUBE_SEARCH_API_URL = "https://www.googleapis.com/youtube/v3/search"
YOUTUBE_VIDEOS_API_URL = "https://www.googleapis.com/youtube/v3/videos"
YOUTUBE_WATCH_URL = "https://www.youtube.com/watch?v="
YOUTUBE_API_KEY_ENV = "YOUTUBE_API_KEY"
NON_SPEECH_PATTERN = re.compile(r"\[(music|applause|laughter|silence)\]", re.I)


def _build_search_params(query: str, api_key: str) -> dict[str, str | int]:
    return {
        "part": "snippet",
        "q": query,
        "type": "video",
        "maxResults": 5,
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


async def _search_youtube(product: Product) -> dict[str, Any]:
    api_key = _get_youtube_api_key()
    query = product.title.strip()
    if not query:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The product title must not be empty.",
        )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                YOUTUBE_SEARCH_API_URL,
                params=_build_search_params(query, api_key),
            )
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
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
            }
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


def _fetch_transcript(video_id: str) -> tuple[str, dict[str, Any]]:
    try:
        transcript = YouTubeTranscriptApi().fetch(video_id, languages=["en"])
        result = {
            "transcript": {
                "language": transcript.language,
                "languageCode": transcript.language_code,
                "isGenerated": transcript.is_generated,
                "text": _aggregate_transcript(transcript.to_raw_data()),
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
    results = await asyncio.gather(
        *(asyncio.to_thread(_fetch_transcript, video_id) for video_id in video_ids)
    )

    return dict(results)


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


def _public_sentiment_summary(summary: Any) -> Any:
    if not isinstance(summary, dict):
        return summary
    return {key: summary[key] for key in ("label", "score", "summary") if key in summary}


def filter_results(payload: dict[str, Any]) -> dict[str, Any]:
    """Keep a compact sentiment summary only.

    Videos are already sent to the client in the earlier "videos" event.
    """
    filtered: dict[str, Any] = {
        "sentimentSummary": _public_sentiment_summary(payload.get("sentimentSummary")),
    }
    summary_error = payload.get("sentimentSummaryError")
    if isinstance(summary_error, str) and summary_error:
        filtered["sentimentSummaryError"] = summary_error

    return filtered


def _video_previews(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Build lightweight video cards from the search results alone."""
    previews: list[dict[str, Any]] = []
    for item in payload.get("items", []):
        if not isinstance(item, dict):
            continue
        video_id = _video_id_from_item(item)
        if not video_id:
            continue

        snippet = item.get("snippet")
        snippet = snippet if isinstance(snippet, dict) else {}
        title = snippet.get("title")
        channel_title = snippet.get("channelTitle")
        previews.append(
            {
                "url": f"{YOUTUBE_WATCH_URL}{video_id}",
                "title": html.unescape(title) if isinstance(title, str) else None,
                "channelTitle": (
                    html.unescape(channel_title)
                    if isinstance(channel_title, str)
                    else None
                ),
            }
        )
    return previews


async def _gather_youtube_results(
    product: Product, search_results: dict[str, Any], video_ids: list[str]
) -> dict[str, Any]:
    """Fetch statistics, transcripts and sentiment for already-found videos."""

    async def _transcripts_and_sentiment() -> tuple[
        dict[str, dict[str, Any]],
        tuple[dict[str, dict[str, Any]], dict[str, Any]],
    ]:
        print("Gathering YouTube transcripts...", flush=True)
        transcripts = await _fetch_transcripts(video_ids)
        print("Analyzing review sentiment...", flush=True)
        sentiment = await analyze_youtube_reviews(product, search_results, transcripts)
        return transcripts, sentiment

    print("Gathering YouTube video statistics...", flush=True)
    try:
        async with asyncio.TaskGroup() as task_group:
            statistics_task = task_group.create_task(
                _fetch_video_statistics(video_ids)
            )
            pipeline_task = task_group.create_task(_transcripts_and_sentiment())
    except ExceptionGroup as exc_group:
        # Surface the original error (e.g. HTTPException) to the caller.
        raise exc_group.exceptions[0] from None

    statistics = statistics_task.result()
    transcripts, (analyses, summary) = pipeline_task.result()

    results = _merge_transcripts(search_results, transcripts)
    results = _merge_statistics(results, statistics)
    results = _merge_sentiment(results, analyses)
    results.update(summary)

    print("Filtering API results...", flush=True)
    return filter_results(results)


def _ndjson(event: dict[str, Any]) -> bytes:
    return (json.dumps(event, separators=(",", ":")) + "\n").encode()


@router.post("/youtube")
async def youtube(product: Product) -> StreamingResponse:
    """Search YouTube for product reviews and stream results as NDJSON.

    Events, one JSON object per line:
      {"type": "videos", "videos": [{"url", "title", "channelTitle"}, ...]}
      {"type": "result", "data": {"sentimentSummary", "sentimentSummaryError"?}}
      {"type": "error", "status": int, "error": str}   (sent instead of "result")
    """
    # Search before opening the stream so config/search failures still return
    # a normal HTTP error status.
    print("Gathering YouTube videos...", flush=True)
    search_results = await _search_youtube(product)
    video_ids = _parse_video_ids(search_results)

    async def event_stream() -> AsyncIterator[bytes]:
        yield _ndjson({"type": "videos", "videos": _video_previews(search_results)})

        try:
            data = await _gather_youtube_results(product, search_results, video_ids)
        except HTTPException as exc:
            yield _ndjson(
                {"type": "error", "status": exc.status_code, "error": exc.detail}
            )
            return
        except Exception:
            traceback.print_exc()
            yield _ndjson(
                {
                    "type": "error",
                    "status": status.HTTP_500_INTERNAL_SERVER_ERROR,
                    "error": "YouTube analysis failed.",
                }
            )
            return

        yield _ndjson({"type": "result", "data": data})

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
