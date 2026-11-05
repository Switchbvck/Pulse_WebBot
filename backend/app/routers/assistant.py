"""AI assistant endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.assistant import build_reply
from app.database import get_db
from app.ratelimit import limit_assistant
from app.schemas import AssistantOut, AssistantQuery

router = APIRouter(tags=["assistant"])


@router.post("/assistant/query", response_model=AssistantOut,
             dependencies=[Depends(limit_assistant)])
def assistant_query(payload: AssistantQuery, db: Session = Depends(get_db)) -> AssistantOut:
    """Parse a free-text request and return matching, bookable slots."""
    reply = build_reply(db, payload.message)
    return AssistantOut(**reply)
