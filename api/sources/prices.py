from fastapi import APIRouter, HTTPException, status
from typing import Any

from api.type import Product

import os
import serpapi


router = APIRouter(tags=["prices"])


@router.post("/prices")
async def prices(product: Product) -> dict[str, Any]:
    client = serpapi.Client(api_key=os.getenv("serp_api_key"))
    query_string = product.title + " "
    if product.model != None:
      query_string = query_string + product.model
    results = client.search(
      engine="google",
      q=query_string
    )

    return results
