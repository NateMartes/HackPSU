import asyncio
import html
import os
import re
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, status
from youtube_transcript_api import YouTubeTranscriptApi, YouTubeTranscriptApiException

from api.sentiment import analyze_youtube_reviews
from api.type import Product


router = APIRouter(tags=["youtube"])

YOUTUBE_SEARCH_API_URL = "https://www.googleapis.com/youtube/v3/search"
YOUTUBE_VIDEOS_API_URL = "https://www.googleapis.com/youtube/v3/videos"
YOUTUBE_API_KEY_ENV = "YOUTUBE_API_KEY"
NON_SPEECH_PATTERN = re.compile(r"\[(music|applause|laughter|silence)\]", re.I)


def _build_search_params(query: str, api_key: str) -> dict[str, str | int]:
    return {
        "part": "snippet",
        "q": query,
        "type": "video",
        "maxResults": 3,
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


def filter_data(payload: dict[str, Any]) -> dict[str, Any]:
    payload.pop("etag", None)

    items = payload.get("items")
    if not isinstance(items, list):
        return payload

    for item in items:
        if not isinstance(item, dict):
            continue

        item.pop("id", None)
        item.pop("etag", None)

        snippet = item.get("snippet")
        if isinstance(snippet, dict):
            snippet.pop("thumbnails", None)

    return payload


@router.post("/youtube")
async def youtube(product: Product) -> dict[str, Any]:
    """Search YouTube for videos related to the submitted product."""
    search_results = await _search_youtube(product)
    video_ids = _parse_video_ids(search_results)
    transcripts, statistics = await asyncio.gather(
        _fetch_transcripts(video_ids),
        _fetch_video_statistics(video_ids),
    )
    analyses, summary = await analyze_youtube_reviews(
        product, search_results, transcripts
    )
    results = _merge_transcripts(search_results, transcripts)
    results = _merge_statistics(results, statistics)
    results = _merge_sentiment(results, analyses)
    results.update(summary)
    return filter_data(results)
