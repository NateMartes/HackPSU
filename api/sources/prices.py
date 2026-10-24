from fastapi import APIRouter, HTTPException, status


router = APIRouter(tags=["prices"])


@router.post("/prices", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def prices() -> None:
    """Placeholder for product price lookup."""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Price lookup is not implemented yet.",
    )
