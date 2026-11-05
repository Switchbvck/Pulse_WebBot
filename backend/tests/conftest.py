"""Shared pytest fixtures: in-memory database, app client, helper factories."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import sys
import time
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urlencode

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Must be set before app modules are imported (config reads env at import time).
os.environ["PULSE_DB_URL"] = "sqlite:///:memory:"
os.environ["PULSE_BOT_TOKEN"] = "12345:test-token"
os.environ["PULSE_ADMIN_IDS"] = "771234567,738376346"
# Anonymous = ordinary user; admin calls sign as DEMO_USER. No demo seed data.
os.environ["PULSE_ALLOW_ANONYMOUS"] = "true"
os.environ["PULSE_SEED_DEMO_DATA"] = "false"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import update  # noqa: E402

from app.database import SessionLocal, init_db  # noqa: E402
from app.models import Booking, Slot  # noqa: E402
from main import app  # noqa: E402

TEST_BOT_TOKEN = "12345:test-token"
DEMO_USER = {"id": 771234567, "first_name": "Alex", "last_name": "Morgan"}
REGULAR_USER = {"id": 555000111, "first_name": "Regular", "last_name": "User"}


def make_init_data(
    user: dict, token: str = TEST_BOT_TOKEN, auth_date: int | None = None
) -> str:
    """Build a validly-signed initData payload for auth tests.

    `auth_date` defaults to now (fresh); pass an old timestamp to test the
    replay-protection window in app.telegram.validate_init_data.
    """
    fields = {
        "auth_date": str(int(time.time()) if auth_date is None else auth_date),
        "query_id": "AAF",
        "user": json.dumps(user),
    }
    data_check_string = "\n".join(f"{key}={fields[key]}" for key in sorted(fields))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    signature = hmac.new(secret, data_check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode({**fields, "hash": signature})


@pytest.fixture(scope="session", autouse=True)
def database():
    init_db()
    yield


@pytest.fixture()
def client():
    # Entering the context runs the app lifespan (idempotent seeding).
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def reset_rate_limiters():
    """Isolate tests from the in-process rate limiters (shared testclient IP)."""
    from app.ratelimit import assistant_limiter, booking_limiter

    booking_limiter._hits.clear()
    assistant_limiter._hits.clear()
    yield
    booking_limiter._hits.clear()
    assistant_limiter._hits.clear()


@pytest.fixture(autouse=True)
def clean_bookings(database):
    """Isolate tests: clear bookings, restore slots, schedule, and holidays."""
    yield
    from app.models import Holiday, WorkingHours
    from app.schedule import apply_schedule_to_slots

    with SessionLocal() as db:
        db.query(Booking).delete()
        db.execute(update(Slot).values(is_available=True))
        db.query(Holiday).delete()
        for rule in db.query(WorkingHours).all():
            rule.is_open = True
            rule.start_time = "09:00"
            rule.end_time = "20:30"
        apply_schedule_to_slots(db)
        db.commit()


@pytest.fixture()
def tomorrow() -> str:
    return (date.today() + timedelta(days=1)).isoformat()


@pytest.fixture()
def first_available_slot(client, tomorrow) -> str:
    """The earliest available time on `tomorrow` (all slots restored by cleanup)."""
    times = client.get(f"/api/slots?date={tomorrow}").json()
    assert times, "seed must provide availability for tomorrow"
    return times[0]


def booking_payload(tomorrow: str, time_slot: str, **overrides) -> dict:
    payload = {
        "user_telegram_id": DEMO_USER["id"],
        "user_name": "Alex Morgan",
        "service_id": 1,
        "date": tomorrow,
        "time_slot": time_slot,
    }
    payload.update(overrides)
    return payload


def auth_header(user: dict) -> dict:
    return {"X-Telegram-Init-Data": make_init_data(user)}
