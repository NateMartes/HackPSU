from fastapi import APIRouter, HTTPException, status


router = APIRouter(tags=["shopping"])


@router.post("/shopping", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def shopping() -> None:
    """Placeholder for shopping result lookup."""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Shopping lookup is not implemented yet.",
    )
