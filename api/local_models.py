import asyncio
import math
import os
import re
from dataclasses import dataclass
from typing import Any

import httpx


EMBEDDING_BASE_URL_ENV = "EMBEDDING_BASE_URL"
EMBEDDING_MODEL_ID_ENV = "EMBEDDING_MODEL_ID"
CLASSIFICATION_BASE_URL_ENV = "CLASSIFICATION_BASE_URL"
CLASSIFICATION_MODEL_ID_ENV = "CLASSIFICATION_MODEL_ID"
CLASSIFICATION_ENABLED_ENV = "CLASSIFICATION_ENABLED"
MODEL_REQUEST_TIMEOUT_SECONDS = 90.0
MAX_EMBEDDING_INPUTS = 128

_POSITIVE_EMOTIONS = {
    "admiration",
    "amusement",
    "approval",
    "caring",
    "desire",
    "excitement",
    "gratitude",
    "joy",
    "love",
    "optimism",
    "pride",
    "relief",
}
_NEGATIVE_EMOTIONS = {
    "anger",
    "annoyance",
    "disappointment",
    "disapproval",
    "disgust",
    "embarrassment",
    "fear",
    "grief",
    "nervousness",
    "remorse",
    "sadness",
}


class LocalModelError(RuntimeError):
    def __init__(self, message: str, status_code: int = 503) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class PreparedTexts:
    texts: list[str]
    selected_indices: list[int]
    input_count: int
    embedding_applied: bool
    classification_applied: bool
    sentiment: dict[str, Any] | None
    errors: list[str]

    def metadata(self) -> dict[str, Any]:
        return {
            "embeddingModel": os.getenv(EMBEDDING_MODEL_ID_ENV) or None,
            "classificationModel": os.getenv(CLASSIFICATION_MODEL_ID_ENV) or None,
            "embeddingApplied": self.embedding_applied,
            "classificationApplied": self.classification_applied,
            "inputTextCount": self.input_count,
            "selectedTextCount": len(self.texts),
            "sentiment": self.sentiment,
            "errors": self.errors,
        }


def classification_enabled() -> bool:
    return os.getenv(CLASSIFICATION_ENABLED_ENV, "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def configured_url(name: str) -> str:
    value = os.getenv(name, "").strip().rstrip("/")
    if not value:
        raise LocalModelError(f"{name} is not configured.")
    return value


async def model_request(
    client: httpx.AsyncClient, method: str, url: str, **kwargs: Any
) -> Any:
    try:
        response = await client.request(method, url, **kwargs)
        response.raise_for_status()
        if response.content:
            return response.json()
        return None
    except httpx.TimeoutException as exc:
        raise LocalModelError("The local model timed out.", 504) from exc
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:500] or "The local model rejected the request."
        raise LocalModelError(detail, 502) from exc
    except httpx.HTTPError as exc:
        raise LocalModelError("The local model service is unavailable.") from exc


async def embed_texts(inputs: list[str]) -> list[list[float]]:
    if not inputs:
        return []
    if len(inputs) > MAX_EMBEDDING_INPUTS:
        raise ValueError(f"At most {MAX_EMBEDDING_INPUTS} texts can be embedded at once.")

    base_url = configured_url(EMBEDDING_BASE_URL_ENV)
    async with httpx.AsyncClient(timeout=MODEL_REQUEST_TIMEOUT_SECONDS) as client:
        vectors = await model_request(
            client,
            "POST",
            f"{base_url}/embed",
            json={"inputs": inputs},
        )
    if not isinstance(vectors, list) or len(vectors) != len(inputs):
        raise LocalModelError("The embedding model returned an unexpected response.", 502)
    return vectors


async def classify_texts(inputs: list[str]) -> list[Any]:
    if not inputs:
        return []
    if not classification_enabled():
        raise LocalModelError("The local classification model is disabled.")

    base_url = configured_url(CLASSIFICATION_BASE_URL_ENV)
    async with httpx.AsyncClient(timeout=MODEL_REQUEST_TIMEOUT_SECONDS) as client:
        return await asyncio.gather(
            *(
                model_request(
                    client,
                    "POST",
                    f"{base_url}/predict",
                    json={"inputs": text},
                )
                for text in inputs
            )
        )


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or len(left) != len(right):
        return 0.0
    dot_product = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if not left_norm or not right_norm:
        return 0.0
    return dot_product / (left_norm * right_norm)


async def rank_texts(
    query: str,
    texts: list[str],
    limit: int,
    duplicate_threshold: float = 0.96,
) -> list[int]:
    if not texts or limit <= 0:
        return []
    vectors = await embed_texts([query, *texts])
    query_vector, document_vectors = vectors[0], vectors[1:]
    ranked_indices = sorted(
        range(len(texts)),
        key=lambda index: _cosine_similarity(query_vector, document_vectors[index]),
        reverse=True,
    )

    selected: list[int] = []
    for index in ranked_indices:
        if any(
            _cosine_similarity(document_vectors[index], document_vectors[other])
            >= duplicate_threshold
            for other in selected
        ):
            continue
        selected.append(index)
        if len(selected) >= limit:
            break
    return selected


def _prediction_items(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, dict):
        if isinstance(value.get("label"), str):
            return [value]
        return [item for nested in value.values() for item in _prediction_items(nested)]
    if isinstance(value, list):
        return [item for nested in value for item in _prediction_items(nested)]
    return []


def _label_valence(label: str) -> float | None:
    normalized = re.sub(r"[_-]+", " ", label.strip().casefold())
    if normalized in {"positive", "pos"}:
        return 1.0
    if normalized in {"negative", "neg"}:
        return -1.0
    if normalized in {"neutral", "neu"}:
        return 0.0

    star_match = re.search(r"([1-5])\s*stars?", normalized)
    if star_match:
        return (int(star_match.group(1)) - 3) / 2
    if normalized in _POSITIVE_EMOTIONS:
        return 1.0
    if normalized in _NEGATIVE_EMOTIONS:
        return -1.0
    if normalized in {"confusion", "curiosity", "realization", "surprise"}:
        return 0.0
    return None


def sentiment_from_prediction(prediction: Any) -> dict[str, Any] | None:
    weighted_score = 0.0
    known_weight = 0.0
    strongest_confidence = 0.0
    for item in _prediction_items(prediction):
        valence = _label_valence(item["label"])
        if valence is None:
            continue
        try:
            confidence = float(item.get("score", 0.0))
        except (TypeError, ValueError):
            continue
        confidence = min(max(confidence, 0.0), 1.0)
        weighted_score += valence * confidence
        known_weight += confidence
        strongest_confidence = max(strongest_confidence, confidence)

    if not known_weight:
        return None
    score = max(-1.0, min(1.0, weighted_score / known_weight))
    label = "positive" if score > 0.05 else "negative" if score < -0.05 else "neutral"
    return {
        "label": label,
        "score": round(score, 4),
        "confidence": round(strongest_confidence, 4),
    }


def aggregate_sentiments(signals: list[dict[str, Any] | None]) -> dict[str, Any] | None:
    usable = [signal for signal in signals if signal is not None]
    if not usable:
        return None
    weights = [max(float(signal["confidence"]), 0.01) for signal in usable]
    score = sum(float(signal["score"]) * weight for signal, weight in zip(usable, weights))
    score /= sum(weights)
    label = "positive" if score > 0.05 else "negative" if score < -0.05 else "neutral"
    return {
        "label": label,
        "score": round(score, 4),
        "confidence": round(sum(weights) / len(weights), 4),
        "sampleCount": len(usable),
    }


async def prepare_texts(
    query: str,
    inputs: list[str],
    *,
    limit: int,
    classify: bool = True,
) -> PreparedTexts:
    texts = [text.strip() for text in inputs if isinstance(text, str) and text.strip()]
    if not texts:
        return PreparedTexts([], [], 0, False, False, None, [])

    # Leave one embedding slot for the query. Callers cap large documents before
    # this point so a single malformed transcript cannot monopolize the GPU.
    texts = texts[: MAX_EMBEDDING_INPUTS - 1]
    rank_task = asyncio.create_task(rank_texts(query, texts, min(limit, len(texts))))
    classification_task = (
        asyncio.create_task(classify_texts(texts)) if classify else None
    )
    tasks = [rank_task]
    if classification_task is not None:
        tasks.append(classification_task)
    results = await asyncio.gather(*tasks, return_exceptions=True)

    errors: list[str] = []
    embedding_applied = not isinstance(results[0], BaseException)
    if embedding_applied:
        selected_indices = list(results[0])
    else:
        errors.append(f"embedding: {results[0]}")
        selected_indices = list(range(min(limit, len(texts))))

    classification_applied = False
    sentiment = None
    if classification_task is not None:
        classification_result = results[1]
        if isinstance(classification_result, BaseException):
            errors.append(f"classification: {classification_result}")
        else:
            classification_applied = True
            signals = [sentiment_from_prediction(item) for item in classification_result]
            sentiment = aggregate_sentiments([signals[index] for index in selected_indices])

    # Keep selected source passages in their original order so Gemini receives
    # coherent evidence instead of a similarity-sorted collage.
    selected_indices.sort()
    return PreparedTexts(
        texts=[texts[index] for index in selected_indices],
        selected_indices=selected_indices,
        input_count=len(texts),
        embedding_applied=embedding_applied,
        classification_applied=classification_applied,
        sentiment=sentiment,
        errors=errors,
    )


def chunk_text(text: str, *, size: int = 3_000, overlap: int = 300) -> list[str]:
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(normalized):
        end = min(start + size, len(normalized))
        if end < len(normalized):
            boundary = normalized.rfind(" ", start + size // 2, end)
            if boundary > start:
                end = boundary
        chunks.append(normalized[start:end].strip())
        if end >= len(normalized):
            break
        start = max(end - overlap, start + 1)
    return chunks


async def prepare_document(
    query: str, text: str, *, max_chunks: int = 6
) -> PreparedTexts:
    chunks = chunk_text(text)[: MAX_EMBEDDING_INPUTS - 1]
    return await prepare_texts(query, chunks, limit=max_chunks, classify=True)
