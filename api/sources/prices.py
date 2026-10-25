from fastapi import APIRouter, HTTPException, status
from typing import Any

from api.type import Product

import os
import serpapi


router = APIRouter(tags=["prices"])


@router.post("/prices")
async def prices(product: Product) -> list:
  client = serpapi.Client(api_key=os.getenv("SERPAPI_KEY"))
  query_string = product.title + " "
  if product.model != None:
    query_string = query_string + product.model
  results = client.search(
    engine="google_shopping",
    q=query_string
  )

  prices_to_consider = []
  for i in results["shopping_results"]:
    prices_to_consider.append(i['price'])


  return prices_to_consider
