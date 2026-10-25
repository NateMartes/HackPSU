import asyncio
import os
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, StringConstraints

from api.local_models import (
    CLASSIFICATION_BASE_URL_ENV,
    CLASSIFICATION_ENABLED_ENV,
    CLASSIFICATION_MODEL_ID_ENV,
    EMBEDDING_BASE_URL_ENV,
    EMBEDDING_MODEL_ID_ENV,
    LocalModelError,
    classification_enabled,
    classify_texts,
    configured_url,
    embed_texts,
    model_request,
)


router = APIRouter(tags=["local models"])

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


@router.get("/models")
async def models() -> dict[str, Any]:
    """Describe the private model services configured for this API."""
    return {
        "embedding": {
            "enabled": bool(os.getenv(EMBEDDING_BASE_URL_ENV, "").strip()),
            "model": os.getenv(EMBEDDING_MODEL_ID_ENV) or None,
        },
        "classification": {
            "enabled": classification_enabled(),
            "model": os.getenv(CLASSIFICATION_MODEL_ID_ENV) or None,
        },
    }


@router.get("/models/health")
async def model_health() -> dict[str, Any]:
    """Check TEI without exposing its private container addresses."""
    try:
        targets = {"embedding": configured_url(EMBEDDING_BASE_URL_ENV)}
        if classification_enabled():
            targets["classification"] = configured_url(CLASSIFICATION_BASE_URL_ENV)
    except LocalModelError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    async with httpx.AsyncClient(timeout=5.0) as client:
        results = await asyncio.gather(
            *(
                model_request(client, "GET", f"{base_url}/health")
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
    try:
        vectors = await embed_texts(request.inputs)
    except (LocalModelError, ValueError) as exc:
        status_code = exc.status_code if isinstance(exc, LocalModelError) else 422
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    return {
        "model": os.getenv(EMBEDDING_MODEL_ID_ENV) or None,
        "vectors": vectors,
    }


@router.post("/classify")
async def classify(request: ClassificationRequest) -> dict[str, Any]:
    """Classify text concurrently; TEI can dynamically batch these requests."""
    if not classification_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The local classification model is disabled.",
        )

    try:
        predictions = await classify_texts(request.inputs)
    except LocalModelError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return {
        "model": os.getenv(CLASSIFICATION_MODEL_ID_ENV) or None,
        "predictions": predictions,
    }
