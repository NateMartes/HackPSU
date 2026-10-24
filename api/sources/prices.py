from fastapi import APIRouter, HTTPException, status
from typing import Any

from api.type import Product

import os
import serpapi
import json


router = APIRouter(tags=["prices"])


@router.post("/prices")
async def prices(product: Product) -> dict[str, Any]:
  client = serpapi.Client(api_key=os.getenv("serp_api_key"))
  query_string = product.title + " "
  if product.model != None:
    query_string = query_string + product.model
  results = client.search(
    engine="google_shopping",
    q=query_string
  )
  #for i in results:
    #print(i)
    #print()
  prices_to_consider = []
  for i in results["shopping_results"]:
    price_and_seller = {}
    price_and_seller["price"] = i['price']
    price_and_seller["seller"] = i['source']
    prices_to_consider.append(price_and_seller)
    #prices_to_consider
    #prices_to_consider.append(price_and_seller)
    #print(i["source"])
    #for j in i:
      #print(j)
    #print()
    #prices_to_consider.append(i['price'])
    #print(i)
    #print()
    

  return {"prices_to_consider": prices_to_consider}
