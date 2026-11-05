"""Idempotent seed data: the Pulse service catalog, schedule, and slots."""

from __future__ import annotations

import random
from datetime import date, datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.config import SEED_DAYS_AHEAD, SEED_DEMO_DATA
from app.database import SessionLocal
from app.models import Booking, BookingStatus, Review, Service, Slot
from app.schedule import apply_schedule_to_slots, covered_times

# Demo patients for seeded history (fresh databases only).
DEMO_PATIENTS = [
    ("Maya Chen", 700001),
    ("Liam Patel", 700002),
    ("Sofia Reyes", 700003),
    ("Noah Kim", 700004),
    ("Emma Novak", 700005),
    ("Daniel Ford", 700006),
    ("Ava Thompson", 700007),
    ("Omar Haddad", 700008),
]

REVIEW_COMMENTS = [
    "Great session — I feel like new!",
    "Professional and friendly staff.",
    "Booked again for next month.",
    "Smooth experience, easy app.",
    "Exactly what I needed after a stressful week.",
    "Very thorough check-up, clear explanations.",
]

# Mirrors the frontend catalog in pulse-app/src/data/catalog.js.
SEED_SERVICES = [
    {
        "title": "General Consultation",
        "description": "One-on-one session to map out your personal health plan.",
        "price": 60.0,
        "duration": 30,
        "icon_name": "stethoscope",
    },
    {
        "title": "Diagnostics",
        "description": "Lab work and imaging with same-day digital results.",
        "price": 120.0,
        "duration": 45,
        "icon_name": "scan",
    },
    {
        "title": "Specialist Care",
        "description": "Targeted treatment programs led by senior specialists.",
        "price": 95.0,
        "duration": 40,
        "icon_name": "heart-pulse",
    },
    {
        "title": "Therapy Session",
        "description": "Guided recovery and wellness therapy, tailored to you.",
        "price": 80.0,
        "duration": 50,
        "icon_name": "brain",
    },
    {
        "title": "Check-up",
        "description": "Preventive annual screening to keep your health on track.",
        "price": 45.0,
        "duration": 25,
        "icon_name": "clipboard",
    },
    {
        "title": "Telemedicine",
        "description": "A video visit with your provider, from wherever you are.",
        "price": 35.0,
        "duration": 20,
        "icon_name": "video",
    },
]


def seed_if_empty() -> None:
    """Create the catalog once and keep the slot window topped up daily."""
    with SessionLocal() as db:
        created = _seed_services(db)
        apply_schedule_to_slots(db)
        if created and SEED_DEMO_DATA:
            _seed_demo_bookings(db)
        db.commit()


def refresh_slot_window() -> None:
    """Roll the bookable window forward; keeps future dates alive between restarts."""
    with SessionLocal() as db:
        apply_schedule_to_slots(db)
        db.commit()


def _seed_services(db: Session) -> bool:
    """Create the catalog if missing; True when it was just created."""
    if db.scalar(select(func.count()).select_from(Service)):
        return False
    db.add_all(Service(**service) for service in SEED_SERVICES)
    db.flush()
    return True


def _demo_start(db: Session, day_iso: str, duration: int, rng: random.Random) -> str | None:
    """A random grid start whose whole appointment range is free that day."""
    available = {
        slot.time_slot
        for slot in db.scalars(
            select(Slot).where(Slot.date == day_iso, Slot.is_available.is_(True))
        ).all()
    }
    candidates = [
        start
        for start in sorted(available)
        if all(covered in available for covered in covered_times(start, duration))
    ]
    return rng.choice(candidates) if candidates else None


def _claim_range(db: Session, day_iso: str, start: str, duration: int) -> None:
    db.execute(
        update(Slot)
        .where(Slot.date == day_iso, Slot.time_slot.in_(covered_times(start, duration)))
        .values(is_available=False)
    )


def _seed_demo_bookings(db: Session) -> None:
    """Demo history (completed/cancelled + reviews) and upcoming visits.

    Fixed rng seed so every fresh install looks identical.
    """
    services = list(db.scalars(select(Service)).all())
    if not services:
        return
    rng = random.Random(42)
    today = date.today()

    # Past days have no slot rows — history records only.
    for offset in range(14, 0, -1):
        day = today - timedelta(days=offset)
        for _ in range(rng.randint(1, 3)):
            name, telegram_id = rng.choice(DEMO_PATIENTS)
            service = rng.choice(services)
            cancelled = rng.random() < 0.15
            booking = Booking(
                user_telegram_id=telegram_id,
                user_name=name,
                service_id=service.id,
                date=day.isoformat(),
                time_slot=f"{rng.randint(9, 19):02d}:{rng.choice(('00', '30'))}",
                duration=service.duration,
                status=BookingStatus.CANCELLED.value if cancelled else BookingStatus.COMPLETED.value,
                created_at=datetime.combine(day - timedelta(days=1), datetime.min.time()),
            )
            db.add(booking)
            db.flush()
            if not cancelled and rng.random() < 0.8:
                db.add(
                    Review(
                        booking_id=booking.id,
                        user_telegram_id=telegram_id,
                        rating=rng.choice((5, 5, 5, 4, 4, 3)),
                        comment=rng.choice(REVIEW_COMMENTS),
                        created_at=datetime.combine(day, datetime.min.time()) + timedelta(hours=20),
                    )
                )

    # Upcoming visits (claim their slot ranges).
    for offset in range(1, SEED_DAYS_AHEAD):
        if rng.random() < 0.35:
            continue  # leave some days nearly free
        name, telegram_id = rng.choice(DEMO_PATIENTS)
        service = rng.choice(services)
        day_iso = (today + timedelta(days=offset)).isoformat()
        start = _demo_start(db, day_iso, service.duration, rng)
        if start is None:
            continue
        _claim_range(db, day_iso, start, service.duration)
        db.add(
            Booking(
                user_telegram_id=telegram_id,
                user_name=name,
                service_id=service.id,
                date=day_iso,
                time_slot=start,
                duration=service.duration,
                status=BookingStatus.CONFIRMED.value,
                created_at=datetime.now() - timedelta(hours=rng.randint(1, 48)),
            )
        )
    db.flush()
