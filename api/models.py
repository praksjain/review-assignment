from typing import Optional
from pydantic import BaseModel


class PluginUpdate(BaseModel):
    is_active: Optional[bool] = None
    settings: Optional[dict] = None


class PluginResponse(BaseModel):
    id: int
    name: str
    is_active: bool
    settings: dict
    consumer: str
    description: Optional[str] = None

    class Config:
        from_attributes = True
