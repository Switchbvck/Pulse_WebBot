"""Public auth endpoint: exchange a bot-issued OTT for a session."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import exchange_ott

router = APIRouter(tags=["auth"])


class OttExchange(BaseModel):
    token: str = Field(min_length=10, max_length=200)


@router.post("/auth/ott")
def auth_ott(payload: OttExchange) -> dict:
    """Exchange a one-time token from the bot for a session identity."""
    result = exchange_ott(payload.token)
    if result is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired login token")
    return result
