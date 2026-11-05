"""Rule-based assistant: parses quick requests and returns matching slots.

Understands service mentions, relative dates ("today", "tomorrow", weekdays,
"weekend"), day-parts (morning/afternoon/evening), "earliest", and price
questions — mirroring the demo brain in the frontend.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import SLOT_STEP_MINUTES
from app.models import Service, Slot
from app.schedule import covered_times

WEEKDAYS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]

DAYPART_HOURS = {"morning": (9, 12), "afternoon": (12, 17), "evening": (17, 24)}


@dataclass
class ParsedQuery:
    service: Service | None
    date_iso: str | None
    daypart: str | None
    earliest: bool
    wants_services: bool


def _title_variants(service: Service) -> list[str]:
    lowered = service.title.lower()
    return [lowered, lowered.replace("-", " "), lowered.replace("-", ""), *lowered.split()]


def _match_service(db: Session, message: str) -> Service | None:
    lowered = message.lower()
    for service in db.scalars(select(Service)).all():
        if any(variant in lowered for variant in _title_variants(service)):
            return service
    return None


def _parse_date(message: str) -> str | None:
    lowered = message.lower()
    today = date.today()
    if re.search(r"\btoday\b", lowered):
        return today.isoformat()
    if re.search(r"\btomorrow\b", lowered):
        return (today + timedelta(days=1)).isoformat()
    if "weekend" in lowered:
        for offset in range(8):
            candidate = today + timedelta(days=offset)
            if candidate.weekday() >= 5:  # Saturday or Sunday
                return candidate.isoformat()
        return None
    for offset in range(14):
        candidate = today + timedelta(days=offset)
        if WEEKDAYS[candidate.weekday()] in lowered:
            return candidate.isoformat()
    return None


def _parse_daypart(message: str) -> str | None:
    lowered = message.lower()
    if "morning" in lowered:
        return "morning"
    if "afternoon" in lowered:
        return "afternoon"
    if "evening" in lowered or "night" in lowered:
        return "evening"
    return None


def parse_query(db: Session, message: str) -> ParsedQuery:
    lowered = message.lower()
    return ParsedQuery(
        service=_match_service(db, message),
        date_iso=_parse_date(message),
        daypart=_parse_daypart(message),
        earliest=bool(re.search(r"earliest|soonest|asap|next available", lowered)),
        wants_services=bool(re.search(r"price|prices|how much|cost|what (services|do you offer)", lowered)),
    )


def _available_slots(
    db: Session,
    date_iso: str,
    daypart: str | None,
    duration_minutes: int = SLOT_STEP_MINUTES,
) -> list[Slot]:
    """Free starts for a service of `duration_minutes` (whole range must fit)."""
    day_slots = db.scalars(select(Slot).where(Slot.date == date_iso)).all()
    availability = {slot.time_slot: slot.is_available for slot in day_slots}
    if date_iso == date.today().isoformat():
        now_hm = datetime.now().strftime("%H:%M")
        availability = {t: ok for t, ok in availability.items() if t > now_hm}

    candidates = [slot for slot in day_slots if availability.get(slot.time_slot)]
    if daypart:
        low, high = DAYPART_HOURS[daypart]
        candidates = [slot for slot in candidates if low <= int(slot.time_slot[:2]) < high]
    return [
        slot
        for slot in candidates
        if all(availability.get(c, False) for c in covered_times(slot.time_slot, duration_minutes))
    ]


def _price_list(services: list[Service]) -> str:
    return "\n".join(f"• {s.title} — ${s.price:.0f} ({s.duration} min)" for s in services)


def _label(date_iso: str) -> str:
    parsed = date.fromisoformat(date_iso)
    today = date.today().isoformat()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    if date_iso == today:
        return "today"
    if date_iso == tomorrow:
        return "tomorrow"
    # str(parsed.day) instead of %-d — Windows strftime does not support %-d.
    return parsed.strftime("%a, %b ") + str(parsed.day)


def build_reply(db: Session, message: str) -> dict:
    """Return the assistant reply text plus up to 3 bookable suggestions."""
    query = parse_query(db, message)
    services = list(db.scalars(select(Service)).all())
    empty: list[dict] = []

    if query.wants_services and query.service is None:
        return {
            "text": (
                "Here is the current Pulse price list:\n"
                f"{_price_list(services)}\n\n"
                "Tell me a service and a day, and I will find open slots."
            ),
            "suggestions": empty,
        }

    if query.earliest and query.service is not None:
        for offset in range(14):
            date_iso = (date.today() + timedelta(days=offset)).isoformat()
            slots = _available_slots(db, date_iso, None, query.service.duration)
            if slots:
                return {
                    "text": (
                        f"The earliest opening for {query.service.title} is "
                        f"{slots[0].time_slot} {_label(date_iso)}. These are also open:"
                    ),
                    "suggestions": _suggestions(slots[:3], query.service),
                }
        return {
            "text": f"I could not find any open slots for {query.service.title} in the next two weeks.",
            "suggestions": empty,
        }
    if query.earliest:
        return {
            "text": "Which service should I look for? I can check "
            + ", ".join(service.title for service in services)
            + ".",
            "suggestions": empty,
        }

    if query.service is not None:
        date_iso = query.date_iso or date.today().isoformat()
        slots = _available_slots(db, date_iso, query.daypart, query.service.duration)
        daypart_suffix = f" in the {query.daypart}" if query.daypart else ""
        if slots:
            return {
                "text": (
                    f"I found {len(slots)} open slot{'s' if len(slots) != 1 else ''} for "
                    f"{query.service.title} {_label(date_iso)}{daypart_suffix}. "
                    "Tap one to book instantly:"
                ),
                "suggestions": _suggestions(slots[:3], query.service),
            }
        # Nothing on the requested day — offer the closest day with openings.
        for offset in range(1, 8):
            candidate = (date.today() + timedelta(days=offset)).isoformat()
            nearby = _available_slots(db, candidate, query.daypart, query.service.duration)
            if nearby:
                return {
                    "text": (
                        f"No openings for {query.service.title} {_label(date_iso)}"
                        f"{daypart_suffix} — but it is free on {_label(candidate)}:"
                    ),
                    "suggestions": _suggestions(nearby[:3], query.service),
                }
        return {
            "text": f"Unfortunately {query.service.title} is fully booked for the next week.",
            "suggestions": empty,
        }

    if query.date_iso or query.daypart:
        when = query.date_iso or "any day"
        if query.daypart:
            when += f", {query.daypart}"
        return {
            "text": f"Got it — {when}. Which service should I book?",
            "suggestions": empty,
        }

    return {
        "text": 'I can check availability, quote prices, and book sessions in one tap. Try: "Find a slot for Friday".',
        "suggestions": empty,
    }


def _suggestions(slots: list[Slot], service: Service) -> list[dict]:
    return [
        {
            "date": slot.date,
            "time_slot": slot.time_slot,
            "service_id": service.id,
            "service_title": service.title,
        }
        for slot in slots
    ]
