import asyncio
import json
import os
import traceback
from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from serpapi import GoogleSearch

from api.sentiment import analyze_price_information
from api.type import Product


router = APIRouter(tags=["prices"])
MAX_PRICE_OFFERS = 20


def _fetch_price_information(product: Product) -> tuple[dict, dict]:
    serpapi_key = os.getenv("SERPAPI_KEY", "").strip()
    if not serpapi_key:
        raise HTTPException(status_code=503, detail="SERPAPI_KEY is not configured.")

    query = " ".join(
        value.strip()
        for value in (product.brand, product.title, product.model, product.variant)
        if isinstance(value, str) and value.strip()
    )
    response = GoogleSearch(
        {"engine": "google_shopping", "q": query, "api_key": serpapi_key}
    ).get_dict()
    if isinstance(response.get("error"), str):
        raise HTTPException(status_code=502, detail=response["error"])

    results = response.get("shopping_results")
    if not isinstance(results, list) or not results:
        raise HTTPException(status_code=404, detail="No price offers found.")

    offer_fields = (
        "title",
        "source",
        "price",
        "extracted_price",
        "old_price",
        "extracted_old_price",
        "delivery",
        "condition",
        "rating",
        "reviews",
    )
    offers = [
        {key: result[key] for key in offer_fields if key in result}
        for result in results[:MAX_PRICE_OFFERS]
        if isinstance(result, dict) and result.get("price") is not None
    ]
    if not offers:
        raise HTTPException(status_code=404, detail="No usable price offers found.")

    return (
        {
            "current_price": product.price,
            "currency": product.currency,
            "offers": offers,
        },
        {
            # Preserve every provider result, including fields that the current
            # price UI and Gemini analysis do not consume yet.
            "shoppingResults": results,
        },
    )


def _ndjson(event: dict) -> bytes:
    return (
        json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n"
    ).encode("utf-8")


@router.post("/prices")
async def prices(product: Product) -> StreamingResponse:
    """Stream comparable offers first, followed by value sentiment.

    Events, one JSON object per line:
      {"type": "price-information", "data": {"current_price", "currency", "offers"}}
      {"type": "analysis", "analysis": {"label", "score", "summary", "aspects"}}
      {"type": "result", "data": {price information plus "analysis"}}
      {"type": "error", "status": int, "error": str} (instead of analysis/result)
    """
    # Fetch before opening the stream so lookup failures retain their HTTP status.
    price_information, source_data = await asyncio.to_thread(
        _fetch_price_information, product
    )
    complete_price_information = {
        **price_information,
        "sourceData": source_data,
    }

    async def event_stream() -> AsyncIterator[bytes]:
        yield _ndjson(
            {"type": "price-information", "data": complete_price_information}
        )

        try:
            analysis = await analyze_price_information(product, price_information)
            dumped_analysis = analysis.model_dump()
            yield _ndjson({"type": "analysis", "analysis": dumped_analysis})
            yield _ndjson(
                {
                    "type": "result",
                    "data": {
                        **complete_price_information,
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
                    "error": "Price analysis failed.",
                }
            )

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
