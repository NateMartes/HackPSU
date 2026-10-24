from pydantic import BaseModel


class Product(BaseModel):
    asin: str
    url: str
    title: str
    brand: str | None
    model: str | None
    variant: str | None
    price: float | None
    currency: str
    image: str | None
