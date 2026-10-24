from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.sources.prices import router as prices_router
from api.sources.shopping import router as shopping_router
from api.sources.youtube import router as youtube_router


app = FastAPI(title="HackPSU API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(prices_router, prefix="/api")
app.include_router(shopping_router, prefix="/api")
app.include_router(youtube_router, prefix="/api")
