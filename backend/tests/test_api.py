"""End-to-end API tests: services, slots, bookings, admin, assistant, auth."""

from __future__ import annotations

from datetime import date, timedelta

from tests.conftest import DEMO_USER, REGULAR_USER, auth_header, booking_payload

# ------------------------------- catalog ----------------------------------


def test_services_catalog(client):
    response = client.get("/api/services")
    assert response.status_code == 200
    services = response.json()
    assert len(services) == 6
    first = services[0]
    assert {"id", "title", "description", "price", "duration", "icon_name"} <= set(first)


# -------------------------------- slots -----------------------------------


def test_slots_available_and_grid(client, tomorrow):
    times = client.get(f"/api/slots?date={tomorrow}").json()
    assert all(t < "21:00" for t in times)
    grid = client.get(f"/api/admin/slots?date={tomorrow}", headers=auth_header(DEMO_USER)).json()
    assert len(grid) == 24
    assert {"id", "date", "time_slot", "is_available"} <= set(grid[0])


# ------------------------------- bookings ---------------------------------


def test_booking_lifecycle(client, tomorrow, first_available_slot):
    created = client.post("/api/bookings", json=booking_payload(tomorrow, first_available_slot))
    assert created.status_code == 201
    booking = created.json()
    assert booking["status"] == "Confirmed"
    assert booking["service_title"] == "General Consultation"

    # Slot becomes unavailable for everyone
    times = client.get(f"/api/slots?date={tomorrow}").json()
    assert first_available_slot not in times

    # Reschedule: old slot freed, new one claimed
    next_slot = next(t for t in times if t > first_available_slot)
    moved = client.post(
        f"/api/bookings/{booking['id']}/reschedule",
        json={"date": tomorrow, "time_slot": next_slot},
    )
    assert moved.status_code == 200
    assert moved.json()["time_slot"] == next_slot
    times = client.get(f"/api/slots?date={tomorrow}").json()
    assert first_available_slot in times and next_slot not in times

    # Cancel: booking cancelled, slot released
    cancelled = client.post(f"/api/bookings/{booking['id']}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "Cancelled"
    times = client.get(f"/api/slots?date={tomorrow}").json()
    assert next_slot in times


def test_double_booking_conflict(client, tomorrow, first_available_slot):
    ok = client.post("/api/bookings", json=booking_payload(tomorrow, first_available_slot))
    assert ok.status_code == 201
    clash = client.post(
        "/api/bookings",
        json=booking_payload(tomorrow, first_available_slot, user_telegram_id=1002, user_name="Maya Chen"),
    )
    assert clash.status_code == 409


def test_past_booking_rejected(client):
    yesterday = "2001-01-01"
    response = client.post("/api/bookings", json=booking_payload(yesterday, "10:00"))
    assert response.status_code == 400


def test_invalid_payload_validated(client, tomorrow):
    bad_time = booking_payload(tomorrow, "25:00")
    assert client.post("/api/bookings", json=bad_time).status_code == 422
    bad_date = booking_payload("05.11.2026", "10:00")
    assert client.post("/api/bookings", json=bad_date).status_code == 422


def test_reschedule_to_taken_slot_conflict(client, tomorrow, first_available_slot):
    first = client.post("/api/bookings", json=booking_payload(tomorrow, first_available_slot))
    times = client.get(f"/api/slots?date={tomorrow}").json()
    second_slot = next(t for t in times if t > first_available_slot)
    client.post("/api/bookings", json=booking_payload(tomorrow, second_slot, user_telegram_id=1002))
    clash = client.post(
        f"/api/bookings/{first.json()['id']}/reschedule",
        json={"date": tomorrow, "time_slot": second_slot},
    )
    assert clash.status_code == 409


def test_missing_slot_returns_404(client):
    # Future date outside the seeded window: no slot exists there
    response = client.post(
        "/api/bookings", json=booking_payload("2099-01-01", "10:00")
    )
    assert response.status_code == 404


# ------------------------------ access rules ------------------------------


def test_full_schedule_requires_admin(client):
    # Anonymous requests are ordinary users; a signed non-admin is denied too.
    assert client.get("/api/bookings").status_code == 403
    denied = client.get("/api/bookings", headers=auth_header(REGULAR_USER))
    assert denied.status_code == 403
    allowed = client.get("/api/bookings", headers=auth_header(DEMO_USER))
    assert allowed.status_code == 200


def test_user_cannot_read_others_bookings(client, tomorrow, first_available_slot):
    client.post("/api/bookings", json=booking_payload(tomorrow, first_available_slot))
    denied = client.get(
        f"/api/bookings?user_id={DEMO_USER['id']}", headers=auth_header(REGULAR_USER)
    )
    assert denied.status_code == 403


def test_admin_endpoints_reject_non_admin(client, tomorrow):
    denied = client.get("/api/admin/overview", headers=auth_header(REGULAR_USER))
    assert denied.status_code == 403
    assert client.get("/api/admin/overview").status_code == 403  # anonymous is not an admin


def test_invalid_init_data_rejected(client):
    bad = client.get("/api/bookings", headers={"X-Telegram-Init-Data": "hash=deadbeef"})
    assert bad.status_code == 401


# ------------------------- identity anti-spoofing -------------------------


def test_signed_identity_overrides_payload(client, tomorrow, first_available_slot):
    """A signed Telegram caller cannot book under someone else's identity."""
    response = client.post(
        "/api/bookings",
        json=booking_payload(tomorrow, first_available_slot, user_telegram_id=999, user_name="Fake Name"),
        headers=auth_header(REGULAR_USER),
    )
    assert response.status_code == 201
    booking = response.json()
    assert booking["user_telegram_id"] == REGULAR_USER["id"]
    assert booking["user_name"] == "Regular User"


def test_cancel_scoped_to_owner(client, tomorrow, first_available_slot):
    booking = client.post("/api/bookings", json=booking_payload(tomorrow, first_available_slot)).json()
    stranger = client.post(
        f"/api/bookings/{booking['id']}/cancel", headers=auth_header(REGULAR_USER)
    )
    assert stranger.status_code == 403


# --------------------------------- admin ----------------------------------


def test_admin_overview_metrics(client, tomorrow, first_available_slot):
    client.post("/api/bookings", json=booking_payload(tomorrow, first_available_slot))
    overview = client.get("/api/admin/overview", headers=auth_header(DEMO_USER)).json()
    assert overview["estimated_revenue"] == 60.0
    assert overview["active_clients"] >= 1


def test_admin_slot_toggle_blocks_patient_slot(client, tomorrow, first_available_slot):
    admin = auth_header(DEMO_USER)
    grid = client.get(f"/api/admin/slots?date={tomorrow}", headers=admin).json()
    target = next(row for row in grid if row["time_slot"] == first_available_slot)

    toggled = client.patch(f"/api/admin/slots/{target['id']}", json={"is_available": False}, headers=admin)
    assert toggled.status_code == 200
    times = client.get(f"/api/slots?date={tomorrow}").json()
    assert first_available_slot not in times

    restored = client.patch(f"/api/admin/slots/{target['id']}", json={"is_available": True}, headers=admin)
    assert restored.status_code == 200
    times = client.get(f"/api/slots?date={tomorrow}").json()
    assert first_available_slot in times


def test_cannot_reopen_occupied_slot(client, tomorrow, first_available_slot):
    admin = auth_header(DEMO_USER)
    booking = client.post("/api/bookings", json=booking_payload(tomorrow, first_available_slot)).json()
    grid = client.get(f"/api/admin/slots?date={tomorrow}", headers=admin).json()
    target = next(row for row in grid if row["time_slot"] == first_available_slot)
    response = client.patch(f"/api/admin/slots/{target['id']}", json={"is_available": True}, headers=admin)
    assert response.status_code == 409
    assert client.get(f"/api/bookings?user_id={booking['user_telegram_id']}").json()


# ------------------------------- assistant --------------------------------


def test_assistant_finds_slots(client, tomorrow):
    response = client.post(
        "/api/assistant/query", json={"message": "Find a slot for General Consultation tomorrow"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["text"]
    assert len(data["suggestions"]) > 0
    suggestion = data["suggestions"][0]
    assert suggestion["service_title"] == "General Consultation"
    assert suggestion["date"] == tomorrow


def test_assistant_price_question(client):
    response = client.post("/api/assistant/query", json={"message": "What are your prices?"})
    assert response.status_code == 200
    assert "$" in response.json()["text"]
    assert response.json()["suggestions"] == []


# ------------------------------ rate limiting -----------------------------


def test_rate_limiter_blocks_burst():
    import pytest
    from fastapi import HTTPException

    from app.ratelimit import SlidingWindowLimiter

    limiter = SlidingWindowLimiter(2, 60)
    limiter.hit("ip-a")
    limiter.hit("ip-a")
    with pytest.raises(HTTPException) as exc_info:
        limiter.hit("ip-a")
    assert exc_info.value.status_code == 429
    assert exc_info.value.headers["Retry-After"]
    limiter.hit("ip-b")  # other keys are unaffected


# ------------------------------- reminders --------------------------------


def test_reminder_marks_due_booking():
    import asyncio
    from datetime import datetime, timedelta

    from app.database import SessionLocal
    from app.models import Booking, BookingStatus
    from app.reminders import send_due_reminders

    visit = datetime.now() + timedelta(hours=23, minutes=45)
    with SessionLocal() as db:
        booking = Booking(
            user_telegram_id=771234567,
            user_name="Alex Morgan",
            service_id=1,
            date=visit.date().isoformat(),
            time_slot=visit.strftime("%H:%M"),
            status=BookingStatus.CONFIRMED.value,
        )
        db.add(booking)
        db.commit()
        booking_id = booking.id

    dispatched = asyncio.run(send_due_reminders())
    assert dispatched >= 1
    with SessionLocal() as db:
        stored = db.get(Booking, booking_id)
        assert stored.reminder_24h_sent is True
        assert stored.reminder_2h_sent is False  # outside the 2h window


def test_reminder_ignores_far_future_bookings():
    import asyncio
    from datetime import datetime, timedelta

    from app.database import SessionLocal
    from app.models import Booking, BookingStatus
    from app.reminders import send_due_reminders

    visit = datetime.now() + timedelta(days=10)
    with SessionLocal() as db:
        db.add(
            Booking(
                user_telegram_id=1,
                user_name="Far Future",
                service_id=1,
                date=visit.date().isoformat(),
                time_slot=visit.strftime("%H:%M"),
                status=BookingStatus.CONFIRMED.value,
            )
        )
        db.commit()

    asyncio.run(send_due_reminders())
    # 10 days out is outside both windows: the booking must not be flagged
    with SessionLocal() as db:
        booking = db.query(Booking).filter(Booking.user_telegram_id == 1).first()
        assert booking.reminder_24h_sent is False
        assert booking.reminder_2h_sent is False


# ----------------------------- services CRUD ------------------------------


def test_service_crud_and_visibility(client):
    admin = auth_header(DEMO_USER)
    created = client.post(
        "/api/admin/services",
        json={
            "title": "Massage Therapy",
            "description": "Deep-tissue relaxation session.",
            "price": 90,
            "duration": 45,
            "icon_name": "heart-pulse",
        },
        headers=admin,
    )
    assert created.status_code == 201
    service_id = created.json()["id"]

    public = client.get("/api/services").json()
    assert any(item["id"] == service_id for item in public)

    patched = client.patch(
        f"/api/admin/services/{service_id}", json={"price": 75, "is_active": False}, headers=admin
    )
    assert patched.status_code == 200
    assert patched.json()["price"] == 75

    public = client.get("/api/services").json()
    assert not any(item["id"] == service_id for item in public)
    admin_list = client.get("/api/admin/services", headers=admin).json()
    assert any(item["id"] == service_id and item["is_active"] is False for item in admin_list)


def test_service_duplicate_title_conflict(client):
    body = {
        "title": "General Consultation",
        "description": "Duplicate test.",
        "price": 10,
        "duration": 15,
        "icon_name": "activity",
    }
    response = client.post("/api/admin/services", json=body, headers=auth_header(DEMO_USER))
    assert response.status_code == 409


def test_admin_services_require_admin(client):
    assert (
        client.get("/api/admin/services", headers=auth_header(REGULAR_USER)).status_code == 403
    )


# ------------------------------- schedule ---------------------------------


def test_schedule_close_day_removes_slots(client, tomorrow):
    target_weekday = (date.today() + timedelta(days=1)).weekday()
    rules = [
        {
            "weekday": weekday,
            "is_open": weekday != target_weekday,
            "start_time": "09:00",
            "end_time": "20:30",
        }
        for weekday in range(7)
    ]
    patched = client.patch("/api/admin/schedule", json=rules, headers=auth_header(DEMO_USER))
    assert patched.status_code == 200
    assert client.get(f"/api/slots?date={tomorrow}").json() == []

    # cleanup fixture restores the default schedule
    assert isinstance(client.get(f"/api/slots?date={tomorrow}").json(), list)


def test_holiday_closes_a_date(client, tomorrow):
    admin = auth_header(DEMO_USER)
    added = client.post("/api/admin/holidays", json={"date": tomorrow, "note": "Team day"}, headers=admin)
    assert added.status_code == 201
    assert client.get(f"/api/slots?date={tomorrow}").json() == []

    removed = client.delete(f"/api/admin/holidays/{tomorrow}", headers=admin)
    assert removed.status_code == 200
    assert client.get(f"/api/slots?date={tomorrow}").json() != []


def test_public_schedule_shape(client):
    data = client.get("/api/schedule").json()
    assert len(data["weekdays"]) == 7
    assert isinstance(data["holidays"], list)


# -------------------------------- reviews ---------------------------------


def _past_booking() -> int:
    from datetime import datetime, timedelta

    from app.database import SessionLocal
    from app.models import Booking, BookingStatus

    visit = datetime.now() - timedelta(days=2)
    with SessionLocal() as db:
        booking = Booking(
            user_telegram_id=DEMO_USER["id"],
            user_name="Alex Morgan",
            service_id=1,
            date=visit.date().isoformat(),
            time_slot=visit.strftime("%H:%M"),
            status=BookingStatus.CONFIRMED.value,
        )
        db.add(booking)
        db.commit()
        return booking.id


def test_review_flow(client):
    booking_id = _past_booking()

    rated = client.post(
        f"/api/bookings/{booking_id}/review", json={"rating": 5, "comment": "Great!"}
    )
    assert rated.status_code == 201

    duplicate = client.post(f"/api/bookings/{booking_id}/review", json={"rating": 4})
    assert duplicate.status_code == 409

    invalid = client.post(f"/api/bookings/{booking_id}/review", json={"rating": 9})
    assert invalid.status_code == 422

    reviews = client.get("/api/admin/reviews", headers=auth_header(DEMO_USER)).json()
    assert any(r["rating"] == 5 and r["comment"] == "Great!" for r in reviews)
    assert all("user_name" in r and "service_title" in r for r in reviews)

    overview = client.get("/api/admin/overview", headers=auth_header(DEMO_USER)).json()
    assert overview["average_rating"] == 5.0


def test_review_rejected_for_future_booking(client, tomorrow, first_available_slot):
    booking = client.post("/api/bookings", json=booking_payload(tomorrow, first_available_slot))
    response = client.post(f"/api/bookings/{booking.json()['id']}/review", json={"rating": 5})
    assert response.status_code == 400


def test_bookings_expose_has_review(client):
    booking_id = _past_booking()
    client.post(f"/api/bookings/{booking_id}/review", json={"rating": 4})
    bookings = client.get(f"/api/bookings?user_id={DEMO_USER['id']}").json()
    target = next(b for b in bookings if b["id"] == booking_id)
    assert target["has_review"] is True


# ------------------------ analytics and CSV export ------------------------


def test_analytics_shape(client, tomorrow, first_available_slot):
    client.post("/api/bookings", json=booking_payload(tomorrow, first_available_slot))
    data = client.get("/api/admin/analytics?days=7", headers=auth_header(DEMO_USER)).json()
    assert len(data["bookings_per_day"]) == 13  # centered window: (2*days-1)
    assert sum(day["count"] for day in data["bookings_per_day"]) >= 1
    assert data["top_services"] and data["top_services"][0]["title"] == "General Consultation"


def test_bookings_csv(client, tomorrow, first_available_slot):
    client.post("/api/bookings", json=booking_payload(tomorrow, first_available_slot))
    response = client.get("/api/admin/bookings.csv", headers=auth_header(DEMO_USER))
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "Alex Morgan" in response.text


def test_bookings_csv_escapes_formula_injection(client, tomorrow, first_available_slot):
    """A hostile booking name must not execute as a spreadsheet formula."""
    payload = booking_payload(
        tomorrow, first_available_slot, user_telegram_id=2001, user_name="=SUM(A1:A9)"
    )
    created = client.post("/api/bookings", json=payload)
    assert created.status_code == 201
    response = client.get("/api/admin/bookings.csv", headers=auth_header(DEMO_USER))
    assert response.status_code == 200
    assert "'=SUM(A1:A9)" in response.text


# --------------------------- internal bot API -----------------------------


def test_internal_confirm_attendance(client, tomorrow, first_available_slot):
    import os

    booking = client.post(
        "/api/bookings", json=booking_payload(tomorrow, first_available_slot)
    ).json()

    assert (
        client.post(f"/api/internal/bookings/{booking['id']}/confirm-attendance").status_code
        == 403
    )
    assert (
        client.post(
            f"/api/internal/bookings/{booking['id']}/confirm-attendance",
            headers={"X-Internal-Token": "wrong"},
        ).status_code
        == 403
    )

    token = os.environ["PULSE_INTERNAL_TOKEN"]
    ok = client.post(
        f"/api/internal/bookings/{booking['id']}/confirm-attendance",
        headers={"X-Internal-Token": token},
    )
    assert ok.status_code == 200
    assert ok.json() == {"ok": True, "already_confirmed": False}

    unknown = client.post(
        "/api/internal/bookings/999999/confirm-attendance",
        headers={"X-Internal-Token": token},
    )
    assert unknown.status_code == 404


# ------------------------------- waitlist ---------------------------------


def test_waitlist_join_duplicate_and_leave(client, tomorrow):
    joined = client.post(
        "/api/waitlist",
        json={"date": tomorrow, "user_telegram_id": DEMO_USER["id"], "user_name": "Alex Morgan"},
    )
    assert joined.status_code == 201

    duplicate = client.post(
        "/api/waitlist",
        json={"date": tomorrow, "user_telegram_id": DEMO_USER["id"], "user_name": "Alex Morgan"},
    )
    assert duplicate.status_code == 409

    mine = client.get(f"/api/waitlist?user_id={DEMO_USER['id']}").json()
    assert any(w["date"] == tomorrow for w in mine)

    entry_id = mine[0]["id"]
    left = client.delete(f"/api/waitlist/{entry_id}")
    assert left.status_code == 200
    mine = client.get(f"/api/waitlist?user_id={DEMO_USER['id']}").json()
    assert not any(w["date"] == tomorrow for w in mine)


def test_waitlist_past_date_rejected(client):
    response = client.post(
        "/api/waitlist",
        json={"date": "2001-01-01", "user_telegram_id": 1, "user_name": "Old Timer"},
    )
    assert response.status_code == 400


def test_cancel_notifies_waitlist(client, tomorrow, first_available_slot):
    import os

    client.post(
        "/api/waitlist",
        json={"date": tomorrow, "user_telegram_id": 1002, "user_name": "Maya Chen"},
    )
    booking = client.post(
        "/api/bookings",
        json=booking_payload(tomorrow, first_available_slot, user_telegram_id=1003, user_name="Liam Patel"),
    )
    assert booking.status_code == 201

    cancelled = client.post(f"/api/bookings/{booking.json()['id']}/cancel")
    assert cancelled.status_code == 200

    # One-shot semantics: the ping cleared the day's queue (admin sees all)
    remaining = [
        entry
        for entry in client.get("/api/waitlist", headers=auth_header(DEMO_USER)).json()
        if entry["date"] == tomorrow
    ]
    assert remaining == []
    assert os.environ.get("PULSE_INTERNAL_TOKEN")  # sanity for the env-based tests


# --------------------------- OTT login (bot flow) --------------------------


def test_ott_login_flow(client, tomorrow, first_available_slot):
    import os

    internal = {"X-Internal-Token": os.environ["PULSE_INTERNAL_TOKEN"]}

    # Bot issues a one-time login token for a patient
    issued = client.post(
        "/api/internal/ott",
        json={"telegram_id": 738376346, "user_name": "Owner Pulse"},
        headers=internal,
    )
    assert issued.status_code == 200
    token = issued.json()["token"]

    # Ott requires the shared secret
    no_auth = client.post(
        "/api/internal/ott", json={"telegram_id": 1, "user_name": "X"}
    )
    assert no_auth.status_code == 403

    # Patient exchanges it for a session identity
    payload = {"token": token}
    exchange = client.post("/api/auth/ott", json=payload)
    assert exchange.status_code == 200
    session = exchange.json()
    assert session["user"]["id"] == 738376346
    assert session["session_token"]

    # Token is one-time: second exchange fails
    again = client.post("/api/auth/ott", json=payload)
    assert again.status_code == 401

    # Session token authorizes API calls
    headers = {"X-Session-Token": session["session_token"]}
    me = client.get("/api/me", headers=headers)
    assert me.json()["id"] == 738376346
    assert me.json()["is_admin"] is True  # 738376346 is in PULSE_ADMIN_IDS

    # Booking works under the session identity
    booked = client.post(
        "/api/bookings",
        json={
            "user_telegram_id": 1,  # spoof attempt - must be overridden
            "user_name": "Fake",
            "service_id": 1,
            "date": tomorrow,
            "time_slot": first_available_slot,
        },
        headers=headers,
    )
    assert booked.status_code == 201
    assert booked.json()["user_telegram_id"] == 738376346
    assert booked.json()["user_name"] == "Owner Pulse"

    # Admin surface opens for the session (738376346 in PULSE_ADMIN_IDS)
    overview = client.get("/api/admin/overview", headers=headers)
    assert overview.status_code == 200


# ---------------------------- hardening gates ------------------------------


def test_initdata_replay_blocked(client):
    """A validly-signed but stale initData must be rejected (auth_date window)."""
    import time as time_module

    from tests.conftest import make_init_data

    stale = int(time_module.time()) - 3 * 24 * 3600  # 3 days old
    headers = {"X-Telegram-Init-Data": make_init_data(DEMO_USER, auth_date=stale)}
    response = client.get("/api/bookings", headers=headers)
    assert response.status_code == 401


def test_anonymous_rejected_when_disabled(client, monkeypatch):
    """With ALLOW_ANONYMOUS off, unauthenticated callers get 401."""
    from app import deps

    monkeypatch.setattr(deps, "ALLOW_ANONYMOUS", False)
    response = client.get("/api/me")
    assert response.status_code == 401


def test_anonymous_is_not_admin(client):
    """Anonymous callers survive auth but never see the admin surface."""
    me = client.get("/api/me").json()
    assert me["anonymous"] is True
    assert me["is_admin"] is False
    assert client.get("/api/admin/overview").status_code == 403


def test_reschedule_cancelled_booking_rejected(client, tomorrow, first_available_slot):
    """A cancelled visit must not resurrect itself through reschedule."""
    created = client.post("/api/bookings", json=booking_payload(tomorrow, first_available_slot))
    booking_id = created.json()["id"]
    assert client.post(f"/api/bookings/{booking_id}/cancel").status_code == 200

    times = client.get(f"/api/slots?date={tomorrow}").json()
    next_slot = next(t for t in times if t > first_available_slot)
    moved = client.post(
        f"/api/bookings/{booking_id}/reschedule",
        json={"date": tomorrow, "time_slot": next_slot},
    )
    assert moved.status_code == 409


def test_public_reviews_hide_last_name(client):
    """Service reviews are public — full patient names must not leak."""
    booking_id = _past_booking()  # created as "Alex Morgan"
    client.post(f"/api/bookings/{booking_id}/review", json={"rating": 5})
    reviews = client.get("/api/services/1/reviews").json()
    assert reviews, "the review must be visible publicly"
    assert all(r["user_name"] != "Alex Morgan" for r in reviews)
    assert any(r["user_name"] == "Alex M." for r in reviews)


def test_stale_session_falls_through_to_init_data(client):
    """In-memory sessions die on restart; a stale token must not brick the app."""
    stale = {"X-Session-Token": "dead-token-from-an-old-process"}
    headers = {**stale, **auth_header(DEMO_USER)}
    me = client.get("/api/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["id"] == DEMO_USER["id"]
    assert me.json()["anonymous"] is False


def test_stale_session_falls_through_to_anonymous(client):
    """Without initData, a stale session degrades to anonymous — not 401."""
    response = client.get("/api/me", headers={"X-Session-Token": "dead-token"})
    assert response.status_code == 200
    assert response.json()["anonymous"] is True


# ------------------------ duration-aware slot ranges -----------------------


def test_long_service_claims_two_slots(client, tomorrow, first_available_slot):
    """Therapy Session (50 min) occupies two grid slots; none can double-book."""
    times_before = client.get(f"/api/slots?date={tomorrow}").json()
    second = next(t for t in times_before if t > first_available_slot)

    created = client.post(
        "/api/bookings", json=booking_payload(tomorrow, first_available_slot, service_id=4)
    )
    assert created.status_code == 201
    assert created.json()["duration"] == 50

    times = client.get(f"/api/slots?date={tomorrow}").json()
    assert first_available_slot not in times and second not in times

    # A 30-minute booking into the follow-up slot collides with the range
    clash = client.post(
        "/api/bookings", json=booking_payload(tomorrow, second, user_telegram_id=2002)
    )
    assert clash.status_code == 409

    # Cancelling frees the entire range
    booking_id = created.json()["id"]
    assert client.post(f"/api/bookings/{booking_id}/cancel").status_code == 200
    times = client.get(f"/api/slots?date={tomorrow}").json()
    assert first_available_slot in times and second in times


def test_booking_past_closing_time_rejected(client, tomorrow):
    """A 50-minute service cannot start at the last grid slot (20:30)."""
    response = client.post(
        "/api/bookings", json=booking_payload(tomorrow, "20:30", service_id=4)
    )
    assert response.status_code == 409


def test_slots_endpoint_respects_service_duration(client, tomorrow, first_available_slot):
    """?service_id= hides starts whose whole appointment range cannot fit."""
    times_before = client.get(f"/api/slots?date={tomorrow}").json()
    second, third = times_before[1], times_before[2]

    # A 30-minute visit claims only its own slot
    client.post("/api/bookings", json=booking_payload(tomorrow, third, user_telegram_id=2003))

    plain = client.get(f"/api/slots?date={tomorrow}").json()
    therapy = client.get(f"/api/slots?date={tomorrow}&service_id=4").json()  # 50 min
    # A 50-minute visit starting at `second` would spill into the taken `third`
    assert second in plain
    assert second not in therapy
    # But one slot earlier the whole range fits
    assert first_available_slot in therapy


def test_admin_disabled_slot_blocks_long_booking(client, tomorrow, first_available_slot):
    """A manually disabled slot inside the range blocks the whole booking."""
    admin = auth_header(DEMO_USER)
    times = client.get(f"/api/slots?date={tomorrow}").json()
    second = next(t for t in times if t > first_available_slot)
    grid = client.get(f"/api/admin/slots?date={tomorrow}", headers=admin).json()
    target = next(row for row in grid if row["time_slot"] == second)
    client.patch(f"/api/admin/slots/{target['id']}", json={"is_available": False}, headers=admin)

    response = client.post(
        "/api/bookings", json=booking_payload(tomorrow, first_available_slot, service_id=4)
    )
    assert response.status_code == 409


def test_reschedule_moves_full_range(client, tomorrow, first_available_slot):
    """Rescheduling frees the old range and claims the new one whole."""
    times_before = client.get(f"/api/slots?date={tomorrow}").json()
    target = times_before[5]  # 11:30 — plenty of room for a 50-minute visit

    created = client.post(
        "/api/bookings", json=booking_payload(tomorrow, first_available_slot, service_id=4)
    )
    booking_id = created.json()["id"]
    moved = client.post(
        f"/api/bookings/{booking_id}/reschedule", json={"date": tomorrow, "time_slot": target}
    )
    assert moved.status_code == 200

    times = client.get(f"/api/slots?date={tomorrow}").json()
    old_follow_up = times_before[1]
    assert first_available_slot in times and old_follow_up in times  # old range freed
    assert target not in times  # new start claimed
    assert next(t for t in times_before if t > target) not in times  # new tail claimed
