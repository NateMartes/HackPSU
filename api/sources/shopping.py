import asyncio
import json
import os
import re
import traceback
from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from serpapi import GoogleSearch

from api.sentiment import analyze_shopping_information
from api.type import Product


router = APIRouter(tags=["shopping"])
MAX_PRODUCT_CANDIDATES = 3


def _normalized_words(value: object) -> set[str]:
    if not isinstance(value, str):
        return set()
    return set(re.findall(r"[a-z0-9]+", value.casefold()))


def _normalized_key(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return re.sub(r"[^a-z0-9]+", "", value.casefold())


def _candidate_match_score(item: dict, product: Product) -> float:
    candidate_title = item.get("title")
    candidate_words = _normalized_words(candidate_title)
    candidate_key = _normalized_key(candidate_title)
    title_words = _normalized_words(product.title)
    if not candidate_words or not title_words:
        return 0.0

    score = len(candidate_words & title_words) / len(title_words)
    brand_key = _normalized_key(product.brand)
    model_key = _normalized_key(product.model)
    if brand_key and brand_key in candidate_key:
        score += 2.0
    if model_key and model_key in candidate_key:
        score += 4.0
    if item.get("rating") is not None:
        score += 0.1
    return score


def _rank_product_candidates(results: list, product: Product) -> list[dict]:
    candidates = [item for item in results if isinstance(item, dict)]
    return sorted(
        candidates,
        key=lambda item: _candidate_match_score(item, product),
        reverse=True,
    )[:MAX_PRODUCT_CANDIDATES]


def _product_lookup_attempts(result: dict, serpapi_key: str) -> list[dict[str, str]]:
    base = {"engine": "google_product", "api_key": serpapi_key}
    attempts = []

    page_token = result.get("immersive_product_page_token")
    if isinstance(page_token, str) and page_token:
        attempts.append({**base, "page_token": page_token})

    product_id = result.get("product_id")
    if isinstance(product_id, str) and product_id:
        attempts.append({**base, "product_id": product_id, "offer_view": "true"})

    return attempts


def _fetch_product_details(
    results: list, product: Product, serpapi_key: str
) -> tuple[dict, dict, dict]:
    last_error = "No shopping result included a usable product token."
    for result in _rank_product_candidates(results, product):
        for params in _product_lookup_attempts(result, serpapi_key):
            details = GoogleSearch(params).get_dict()
            error = details.get("error")
            product_data = details.get("product_results")
            if not error and isinstance(product_data, dict) and product_data:
                return result, product_data, details
            if isinstance(error, str) and error:
                last_error = error

    raise HTTPException(
        status_code=502,
        detail=f"Could not retrieve details for matching shopping results: {last_error}",
    )


def _fetch_shopping_information(product: Product) -> tuple[dict, dict]:
    serpapi_key = os.getenv("SERPAPI_KEY", "").strip()
    if not serpapi_key:
        raise HTTPException(
            status_code=503,
            detail="SERPAPI_KEY is not configured.",
        )
    title = product.title

    shopping = GoogleSearch(
        {
            "engine": "google_shopping",
            "q": title,
            "api_key": serpapi_key,
        }
    ).get_dict()

    if "error" in shopping:
        raise HTTPException(status_code=502, detail=shopping["error"])

    results = shopping.get("shopping_results", [])
    if not results:
        raise HTTPException(status_code=404, detail="No shopping results found.")

    result, product_data, product_details = _fetch_product_details(
        results, product, serpapi_key
    )
    raw_reviews = product_data.get("user_reviews", [])

    review_details = [
        {
            "source": review.get("source"),
            "link": review.get("link"),
            "rating": review.get("rating"),
            "text": review.get("text"),
        }
        for review in raw_reviews[:10]
    ]

    shopping_information = {
        "rating": product_data.get("rating", result.get("rating")),
        "reviews": product_data.get("reviews", result.get("reviews")),
        "review_details": review_details,
    }
    return (
        shopping_information,
        {
            # Keep the complete provider records for future evidence-graph use.
            # Request configuration and API credentials are intentionally absent.
            "shoppingResults": results,
            "selectedShoppingResult": result,
            "productDetails": {
                key: value
                for key, value in product_details.items()
                if key not in {"search_metadata", "search_parameters"}
            },
        },
    )


def _ndjson(event: dict) -> bytes:
    return (
        json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n"
    ).encode("utf-8")


@router.post("/shopping")
async def shopping(product: Product) -> StreamingResponse:
    """Stream shopping data immediately, followed by its Gemini analysis.

    Events, one JSON object per line:
      {"type": "shopping-information", "data": {"rating", "reviews", "review_details"}}
      {"type": "analysis", "analysis": {"label", "score", "summary", "aspects"}}
      {"type": "result", "data": {shopping information plus "analysis"}}
      {"type": "error", "status": int, "error": str} (instead of analysis/result)
    """
    # Fetch before opening the stream so lookup failures retain their HTTP status.
    shopping_information, source_data = await asyncio.to_thread(
        _fetch_shopping_information, product
    )
    complete_shopping_information = {
        **shopping_information,
        "sourceData": source_data,
    }

    async def event_stream() -> AsyncIterator[bytes]:
        yield _ndjson(
            {"type": "shopping-information", "data": complete_shopping_information}
        )

        try:
            # The first event can be rendered while this single Gemini request runs.
            analysis_task = asyncio.create_task(
                analyze_shopping_information(product, shopping_information)
            )
            analysis = await analysis_task
            dumped_analysis = analysis.model_dump()
            yield _ndjson({"type": "analysis", "analysis": dumped_analysis})
            yield _ndjson(
                {
                    "type": "result",
                    "data": {
                        **complete_shopping_information,
                        "analysis": dumped_analysis,
                    },
                }
            )
        except HTTPException as exc:
            yield _ndjson(
                {"type": "error", "status": exc.status_code, "error": exc.detail}
            )
        except Exception:
            traceback.print_exc()
            yield _ndjson(
                {
                    "type": "error",
                    "status": status.HTTP_502_BAD_GATEWAY,
                    "error": "Shopping analysis failed.",
                }
            )

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
