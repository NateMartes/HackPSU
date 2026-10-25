import asyncio
import os
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, StringConstraints


router = APIRouter(tags=["local models"])

EMBEDDING_BASE_URL_ENV = "EMBEDDING_BASE_URL"
EMBEDDING_MODEL_ID_ENV = "EMBEDDING_MODEL_ID"
CLASSIFICATION_BASE_URL_ENV = "CLASSIFICATION_BASE_URL"
CLASSIFICATION_MODEL_ID_ENV = "CLASSIFICATION_MODEL_ID"
CLASSIFICATION_ENABLED_ENV = "CLASSIFICATION_ENABLED"
MODEL_REQUEST_TIMEOUT_SECONDS = 90.0

EmbeddingText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20_000)
]
ClassificationText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8_000)
]


class EmbeddingRequest(BaseModel):
    inputs: list[EmbeddingText] = Field(min_length=1, max_length=128)


class ClassificationRequest(BaseModel):
    inputs: list[ClassificationText] = Field(min_length=1, max_length=64)


def _configured_url(name: str) -> str:
    value = os.getenv(name, "").strip().rstrip("/")
    if not value:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"{name} is not configured.",
        )
    return value


def _classification_enabled() -> bool:
    return os.getenv(CLASSIFICATION_ENABLED_ENV, "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


async def _model_request(
    client: httpx.AsyncClient, method: str, url: str, **kwargs: Any
) -> Any:
    try:
        response = await client.request(method, url, **kwargs)
        response.raise_for_status()
        if response.content:
            return response.json()
        return None
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="The local model timed out.",
        ) from exc
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:500] or "The local model rejected the request."
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=detail,
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The local model service is unavailable.",
        ) from exc


@router.get("/models")
async def models() -> dict[str, Any]:
    """Describe the private model services configured for this API."""
    return {
        "embedding": {
            "enabled": bool(os.getenv(EMBEDDING_BASE_URL_ENV, "").strip()),
            "model": os.getenv(EMBEDDING_MODEL_ID_ENV) or None,
        },
        "classification": {
            "enabled": _classification_enabled(),
            "model": os.getenv(CLASSIFICATION_MODEL_ID_ENV) or None,
        },
    }


@router.get("/models/health")
async def model_health() -> dict[str, Any]:
    """Check TEI without exposing its private container addresses."""
    targets = {"embedding": _configured_url(EMBEDDING_BASE_URL_ENV)}
    if _classification_enabled():
        targets["classification"] = _configured_url(CLASSIFICATION_BASE_URL_ENV)

    async with httpx.AsyncClient(timeout=5.0) as client:
        results = await asyncio.gather(
            *(
                _model_request(client, "GET", f"{base_url}/health")
                for base_url in targets.values()
            ),
            return_exceptions=True,
        )

    health: dict[str, Any] = {}
    for name, result in zip(targets, results, strict=True):
        if isinstance(result, BaseException):
            health[name] = {"ready": False, "error": str(result)}
        else:
            health[name] = {"ready": True}
    return health


@router.post("/embeddings")
async def embeddings(request: EmbeddingRequest) -> dict[str, Any]:
    """Generate one vector per input using the private TEI embedding service."""
    base_url = _configured_url(EMBEDDING_BASE_URL_ENV)
    async with httpx.AsyncClient(timeout=MODEL_REQUEST_TIMEOUT_SECONDS) as client:
        vectors = await _model_request(
            client,
            "POST",
            f"{base_url}/embed",
            json={"inputs": request.inputs},
        )
    return {
        "model": os.getenv(EMBEDDING_MODEL_ID_ENV) or None,
        "vectors": vectors,
    }


@router.post("/classify")
async def classify(request: ClassificationRequest) -> dict[str, Any]:
    """Classify text concurrently; TEI can dynamically batch these requests."""
    if not _classification_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The local classification model is disabled.",
        )

    base_url = _configured_url(CLASSIFICATION_BASE_URL_ENV)
    async with httpx.AsyncClient(timeout=MODEL_REQUEST_TIMEOUT_SECONDS) as client:
        predictions = await asyncio.gather(
            *(
                _model_request(
                    client,
                    "POST",
                    f"{base_url}/predict",
                    json={"inputs": text},
                )
                for text in request.inputs
            )
        )
    return {
        "model": os.getenv(CLASSIFICATION_MODEL_ID_ENV) or None,
        "predictions": predictions,
    }
