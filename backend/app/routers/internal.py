"""Machine-to-machine endpoints for the shell bot (shared-secret auth)."""

from __future__ import annotations

import hmac
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import create_ott
from app.config import INTERNAL_TOKEN
from app.database import get_db
from app.models import Booking

router = APIRouter(prefix="/internal", tags=["internal"])
logger = logging.getLogger(__name__)


def require_internal_token(
    x_internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
) -> None:
    if not INTERNAL_TOKEN or not x_internal_token:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Internal access required")
    if not hmac.compare_digest(x_internal_token, INTERNAL_TOKEN):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Internal access required")


class OttCreate(BaseModel):
    telegram_id: int = Field(ge=1)
    user_name: str = Field(min_length=1, max_length=100)
    ttl_seconds: int = Field(default=600, ge=10, le=86400)


@router.post("/ott")
def create_login_ott(
    payload: OttCreate,
    _: None = Depends(require_internal_token),
) -> dict:
    """Issue a one-time login token the bot can embed into a Mini App link."""
    token = create_ott(payload.telegram_id, payload.user_name, payload.ttl_seconds)
    logger.info("OTT issued for user=%s (ttl=%ss)", payload.telegram_id, payload.ttl_seconds)
    return {"token": token}


@router.post("/bookings/{booking_id}/confirm-attendance")
def confirm_attendance(
    booking_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_internal_token),
) -> dict:
    """Called by the shell bot when the patient taps Confirm in a reminder."""
    booking = db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    already = booking.attendance_confirmed
    booking.attendance_confirmed = True
    db.commit()
    logger.info("Attendance confirmed via bot: booking=%s", booking_id)
    return {"ok": True, "already_confirmed": already}
