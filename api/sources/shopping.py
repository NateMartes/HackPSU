from fastapi import APIRouter, HTTPException, status
import os
from api.type import Product
from serpapi import GoogleSearch


router = APIRouter(tags=["shopping"])


@router.post("/shopping", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def shopping(product: Product) -> None:
    #"""Placeholder for shopping result lookup."""
    serpapi_key = os.environ["SERPAPI_KEY"]
    if not serpapi_key:
        raise HTTPException(
            status_code=503,
            detail="SERPAPI_KEY is not configured.",
        )
    title = product.title
    
    shopping = GoogleSearch({
    "engine": "google_shopping",
    "q": title,
    "api_key": serpapi_key,
    }).get_dict()
    
    if "error" in shopping:
        raise HTTPException(status_code=502, detail=shopping["error"])
    
    results = shopping.get("shopping_results", [])
    if not results:
        raise HTTPException(status_code=404, detail="No shopping results found.")

    # Choose the first result that has a rating; otherwise use the first result.
    result = next((item for item in results if item.get("rating")), results[0])
    product_id = result.get("product_id")
    if not product_id:
        raise HTTPException(status_code=404, detail="No product ID found.")
    
    print(product_id)
    
    # Fetch the product page and review data
    details = GoogleSearch({
        "engine": "google_product",
        "product_id": product_id,
        "offer_view": "true",
        "api_key": serpapi_key,
    }).get_dict()
    
    if "error" in details:
        raise HTTPException(status_code=502, detail=details["error"])

    product_data = details.get("product_results", {})
    raw_reviews = product_data.get("user_reviews", [])

    review_details = [
        {
            "source": review.get("source"),
            "rating": review.get("rating"),
            "text": review.get("text"),
        }
        for review in raw_reviews[:10]
    ]

    return {
        "rating": product_data.get("rating", result.get("rating")),
        "reviews": product_data.get("reviews", result.get("reviews")),
        "review_details": review_details,
    }
