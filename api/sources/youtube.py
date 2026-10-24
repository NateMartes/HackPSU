import os
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, status

from api.type import Product


router = APIRouter(tags=["youtube"])

YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3/search"
YOUTUBE_API_KEY_ENV = "YOUTUBE_API_KEY"


@router.post("/youtube")
async def youtube(product: Product) -> dict[str, Any]:
    """Search YouTube for videos related to the submitted product."""
    api_key = os.getenv(YOUTUBE_API_KEY_ENV, "").strip()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"{YOUTUBE_API_KEY_ENV} is not configured.",
        )

    query = product.title.strip()
    if not query:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The product title must not be empty.",
        )

    params = {
        "part": "snippet",
        "q": query,
        "type": "video",
        "maxResults": 5,
        "key": api_key,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(YOUTUBE_API_URL, params=params)
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
