from fastapi import APIRouter, HTTPException, status

import os
import serpapi


router = APIRouter(tags=["prices"])


@router.post("/prices", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def prices() -> None:
    client = serpapi.Client(api_key=os.getenv("serp_api_key"))
    results = client.search(
      engine="google",
      q=payload.title + " " + payload.model,
    )
    for i in results:
      print(i)
    #"""Placeholder for product price lookup."""
    #raise HTTPException(
        #status_code=status.HTTP_501_NOT_IMPLEMENTED,
        #detail="Price lookup is not implemented yet.",
    #)


