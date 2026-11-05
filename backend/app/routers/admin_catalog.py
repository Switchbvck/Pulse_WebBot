"""Admin catalog management: services CRUD, QR codes, working hours, holidays."""

from __future__ import annotations

import functools
import io
import logging
from datetime import date

import httpx
import qrcode
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import BOT_API_BASE, BOT_TOKEN
from app.database import get_db
from app.deps import require_admin
from app.models import Holiday, Service, WorkingHours
from app.schedule import apply_schedule_to_slots, get_holidays, get_rules
from app.schemas import (
    HolidayCreate,
    HolidayOut,
    ScheduleRule,
    ScheduleRuleOut,
    ServiceAdminOut,
    ServiceCreate,
    ServiceUpdate,
)

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])
logger = logging.getLogger(__name__)


# ------------------------------- services ---------------------------------


@router.get("/services", response_model=list[ServiceAdminOut])
def list_all_services(db: Session = Depends(get_db)) -> list[ServiceAdminOut]:
    """Full catalog including deactivated services."""
    return list(db.scalars(select(Service).order_by(Service.id)).all())


@router.post("/services", response_model=ServiceAdminOut, status_code=status.HTTP_201_CREATED)
def create_service(payload: ServiceCreate, db: Session = Depends(get_db)) -> Service:
    if db.scalar(select(Service.id).where(Service.title == payload.title)):
        raise HTTPException(status.HTTP_409_CONFLICT, "A service with this title already exists")
    service = Service(**payload.model_dump())
    db.add(service)
    db.commit()
    db.refresh(service)
    logger.info("Service created: %s", service.title)
    return service


@router.patch("/services/{service_id}", response_model=ServiceAdminOut)
def update_service(
    service_id: int,
    payload: ServiceUpdate,
    db: Session = Depends(get_db),
) -> Service:
    service = db.get(Service, service_id)
    if service is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")
    changes = payload.model_dump(exclude_unset=True)
    if "title" in changes and changes["title"] != service.title:
        if db.scalar(select(Service.id).where(Service.title == changes["title"])):
            raise HTTPException(status.HTTP_409_CONFLICT, "A service with this title already exists")
    for field, value in changes.items():
        setattr(service, field, value)
    db.commit()
    db.refresh(service)
    logger.info("Service updated: %s (%s)", service.title, ", ".join(changes) or "no-op")
    return service


# ---------------------------------- QR -------------------------------------


@functools.lru_cache(maxsize=1)
def _bot_username() -> str | None:
    """Bot username from getMe, cached for the process lifetime."""
    if not BOT_TOKEN:
        return None
    try:
        response = httpx.get(f"{BOT_API_BASE}/bot{BOT_TOKEN}/getMe", timeout=5)
        return response.json().get("result", {}).get("username")
    except Exception as exc:
        # No exc_info — the httpx exception embeds the URL with the bot token.
        logger.warning("getMe failed (%s) — QR codes unavailable", type(exc).__name__)
        return None


@router.get("/services/{service_id}/qr")
def service_qr(service_id: int, db: Session = Depends(get_db)) -> Response:
    """PNG QR code linking to the service's deep link (t.me/<bot>?startapp=svc:<id>)."""
    service = db.get(Service, service_id)
    if service is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")
    username = _bot_username()
    if not username:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "QR codes need a configured bot token (to resolve the bot username)",
        )
    url = f"https://t.me/{username}?startapp=svc:{service.id}"
    image = qrcode.make(url)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return Response(content=buffer.getvalue(), media_type="image/png")


# -------------------------------- schedule ---------------------------------


@router.get("/schedule", response_model=list[ScheduleRuleOut])
def get_schedule(db: Session = Depends(get_db)) -> list[ScheduleRuleOut]:
    return [rule for _, rule in sorted(get_rules(db).items())]


@router.patch("/schedule", response_model=list[ScheduleRuleOut])
def update_schedule(rules: list[ScheduleRule], db: Session = Depends(get_db)) -> list[ScheduleRuleOut]:
    """Upsert weekday rules and rebuild the future slot grid."""
    if not rules:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "At least one rule is required")
    for rule in rules:
        if rule.end_time <= rule.start_time:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"End time must be after start time for weekday {rule.weekday}",
            )
        row = db.get(WorkingHours, rule.weekday)
        if row is None:
            db.add(WorkingHours(**rule.model_dump()))
        else:
            for field, value in rule.model_dump().items():
                setattr(row, field, value)
    apply_schedule_to_slots(db)
    db.commit()
    logger.info("Working hours updated for %s weekday(s)", len(rules))
    return [item for _, item in sorted(get_rules(db).items())]


@router.get("/holidays", response_model=list[HolidayOut])
def list_holidays(db: Session = Depends(get_db)) -> list[HolidayOut]:
    return [holiday for holiday, _ in sorted(get_holidays(db).items()) if holiday >= date.today().isoformat()]


@router.post("/holidays", response_model=HolidayOut, status_code=status.HTTP_201_CREATED)
def add_holiday(payload: HolidayCreate, db: Session = Depends(get_db)) -> Holiday:
    if payload.date < date.today().isoformat():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot add a holiday in the past")
    if db.get(Holiday, payload.date):
        raise HTTPException(status.HTTP_409_CONFLICT, "This date is already a holiday")
    holiday = Holiday(**payload.model_dump())
    db.add(holiday)
    apply_schedule_to_slots(db)
    db.commit()
    logger.info("Holiday added: %s", holiday.date)
    return holiday


@router.delete("/holidays/{holiday_date}")
def delete_holiday(holiday_date: str, db: Session = Depends(get_db)) -> dict:
    holiday = db.get(Holiday, holiday_date)
    if holiday is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Holiday not found")
    db.delete(holiday)
    apply_schedule_to_slots(db)
    db.commit()
    logger.info("Holiday removed: %s", holiday_date)
    return {"ok": True}
