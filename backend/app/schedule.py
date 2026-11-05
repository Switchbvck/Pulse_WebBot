"""Working-hours engine: the slot grid is derived from schedule + holidays.

Slot availability truth chain: working hours -> holidays -> confirmed
bookings (whole appointment ranges) -> manual admin toggles.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import SEED_DAYS_AHEAD, SLOT_END_MINUTES, SLOT_START_MINUTES, SLOT_STEP_MINUTES
from app.models import Booking, BookingStatus, Holiday, Slot, WorkingHours

DEFAULT_START = f"{SLOT_START_MINUTES // 60:02d}:{SLOT_START_MINUTES % 60:02d}"
DEFAULT_END = f"{SLOT_END_MINUTES // 60:02d}:{SLOT_END_MINUTES % 60:02d}"


def time_to_minutes(value: str) -> int:
    return int(value[:2]) * 60 + int(value[3:5])


def minutes_to_time(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def grid_times(start_time: str, end_time: str) -> list[str]:
    """The "HH:MM" grid between two HH:MM bounds (inclusive end)."""
    return [
        minutes_to_time(minutes)
        for minutes in range(time_to_minutes(start_time), time_to_minutes(end_time) + 1, SLOT_STEP_MINUTES)
    ]


def covered_times(start: str, duration_minutes: int) -> list[str]:
    """Grid times held by an appointment: [start, start + duration)."""
    start_min = time_to_minutes(start)
    end_min = start_min + max(int(duration_minutes), 1)
    return [minutes_to_time(m) for m in range(start_min, end_min, SLOT_STEP_MINUTES)]


def ensure_default_schedule(db: Session) -> None:
    """Create 7 open days with default hours when the table is empty."""
    if db.scalar(select(WorkingHours.weekday).limit(1)) is not None:
        return
    for weekday in range(7):
        db.add(WorkingHours(is_open=True, start_time=DEFAULT_START, end_time=DEFAULT_END, weekday=weekday))
    db.flush()


def get_rules(db: Session) -> dict[int, WorkingHours]:
    ensure_default_schedule(db)
    return {rule.weekday: rule for rule in db.scalars(select(WorkingHours)).all()}


def get_holidays(db: Session) -> dict[str, str | None]:
    return {holiday.date: holiday.note for holiday in db.scalars(select(Holiday)).all()}


def occupied_times_for(db: Session, iso: str) -> set[str]:
    """Every grid time held by a confirmed booking on that day."""
    rows = db.execute(
        select(Booking.time_slot, Booking.duration).where(
            Booking.date == iso, Booking.status == BookingStatus.CONFIRMED.value
        )
    ).all()
    return {covered for start, duration in rows for covered in covered_times(start, duration)}


def desired_times_for(db: Session, day: date, rules: dict, holidays: dict, occupied: set[str]) -> set[str]:
    """Grid times the clinic is open on `day`, plus occupied ranges."""
    iso = day.isoformat()
    rule = rules.get(day.weekday())
    if iso in holidays or rule is None or not rule.is_open:
        return occupied  # closed — keep only times held by active bookings
    open_times = set(grid_times(rule.start_time, rule.end_time))
    if iso == date.today().isoformat():
        open_times = {t for t in open_times if t > datetime.now().strftime("%H:%M")}
    return open_times | occupied


def apply_schedule_to_slots(db: Session) -> None:
    """Rebuild the future slot grid, preserving booked ranges.

    Slots outside the grid are deleted unless booked; re-created times inside
    a booked range stay closed, so ranges survive close/reopen cycles.
    """
    db.flush()
    ensure_default_schedule(db)
    rules = get_rules(db)
    holidays = get_holidays(db)
    today = date.today()

    for offset in range(SEED_DAYS_AHEAD + 1):
        day = today + timedelta(days=offset)
        iso = day.isoformat()
        occupied = occupied_times_for(db, iso)
        desired = desired_times_for(db, day, rules, holidays, occupied)

        existing = {slot.time_slot: slot for slot in db.scalars(select(Slot).where(Slot.date == iso)).all()}
        for time_slot, slot in existing.items():
            if time_slot not in desired:
                db.delete(slot)

        for time_slot in desired - set(existing):
            is_past = iso == today.isoformat() and time_slot <= datetime.now().strftime("%H:%M")
            db.add(Slot(date=iso, time_slot=time_slot, is_available=not is_past and time_slot not in occupied))
    db.flush()
