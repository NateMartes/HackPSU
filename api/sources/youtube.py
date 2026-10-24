from fastapi import APIRouter, HTTPException, status


router = APIRouter(tags=["youtube"])


@router.post("/youtube", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def youtube() -> None:
    """Placeholder for YouTube result lookup."""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="YouTube lookup is not implemented yet.",
    )
