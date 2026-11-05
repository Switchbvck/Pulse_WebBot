# Pulse Backend

FastAPI + SQLite backend for the **Pulse** Telegram Mini App
(frontend lives in `../pulse-app`).

## Stack

- **FastAPI** + **Uvicorn** — async REST API with OpenAPI docs at `/docs`
- **SQLAlchemy 2.0** — ORM over a portable SQLite file (`pulse.db`, auto-created)
- **Pydantic v2** — request/response validation
- **HMAC-validated Telegram auth** — signed `X-Telegram-Init-Data` identifies callers

## Quick start

Use an isolated virtual environment (keeps dependencies separate from other
projects on the machine):

```bash
py -3 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt   # Windows
.venv/Scripts/python -m uvicorn main:app --reload --port 8000
```

API at `http://127.0.0.1:8000`, docs at `/docs`. On startup the app creates
tables and seeds the 6-service catalog plus a bookable slot grid
(09:00–20:30 / 30 min) for the next 14 days with deterministic availability.
Seeding is idempotent and tops the window up as days pass.

Run tests (in-memory database, no side effects):

```bash
.venv/Scripts/python -m pytest -q
```

## Authentication

| Caller | Header | Behavior |
|--------|--------|----------|
| Mini App in Telegram | `X-Telegram-Init-Data` (signed) | HMAC-validated; identity **overrides** any payload user fields (anti-spoofing) |
| Browser development | none | Allowed only while `PULSE_ALLOW_ANONYMOUS=true`; treated as a trusted local admin |
| Invalid signature | present but broken | `401`, always |

Rules enforced on top of auth:

- `GET /api/bookings` **without** `user_id` (full schedule) → admin only.
- Signed non-admins can read/cancel/reschedule **only their own** bookings.
- `/api/admin/*` → admin only (`PULSE_ADMIN_IDS`).

Configuration lives in `.env` — see `.env.example`. For production set
`PULSE_BOT_TOKEN`, `PULSE_ADMIN_IDS`, and `PULSE_ALLOW_ANONYMOUS=false`.

## Connecting the frontend

The Vite dev server proxies `/api` → `http://localhost:8000`, so with
`VITE_API_BASE_URL=/api` in `pulse-app/.env` no CORS setup is needed. Direct
origins (`http://localhost:5173`) are whitelisted in `app/config.py` as well.

## Endpoints

| Method | Endpoint                        | Description |
|--------|---------------------------------|-------------|
| GET    | `/api/health`                   | Liveness probe |
| GET    | `/api/services`                 | Service catalog |
| GET    | `/api/slots?date=YYYY-MM-DD`    | Available `"HH:MM"` times (past hidden for today) |
| GET    | `/api/bookings?user_id=&date=`  | Bookings (scoped by auth rules above) |
| POST   | `/api/bookings`                 | Create booking — atomic slot claim, rate-limited (`429`), (`409` if taken, `400` in the past) |
| POST   | `/api/bookings/{id}/cancel`     | Cancel and release the slot |
| POST   | `/api/bookings/{id}/reschedule` | Move to another slot (`409` if taken) |
| GET    | `/api/admin/overview`           | `{ total_bookings_today, estimated_revenue, active_clients }` |
| GET    | `/api/admin/slots?date=`        | Full slot grid incl. disabled slots |
| PATCH  | `/api/admin/slots/{id}`         | Toggle `is_available` (`409` if occupied by a Confirmed booking) |
| POST   | `/api/assistant/query`          | `{ message }` → `{ text, suggestions: [{ date, time_slot, service_id, service_title }] }` |
| POST   | `/api/waitlist`                 | `{ date }` — join the slot-opening waitlist for a day |
| GET    | `/api/waitlist?user_id=`        | Own waitlist entries (all for admins) |
| DELETE | `/api/waitlist/{id}`            | Leave the waitlist |
| GET    | `/api/admin/waitlist?date=`     | Waitlist entries (admin) |
| GET    | `/api/services/{id}/reviews`    | Latest public reviews for a service |

Waitlist: cancellations, reschedules and admin slot re-opens ping every
subscriber of that day (one-shot — the queue clears after notifying) with the
freed times and a deep-link **Book now** button (`startapp=day:<date>`).

Integrity: slot claiming is a conditional `UPDATE`, and a partial unique index
(`uq_active_booking_slot`) guarantees one `Confirmed` booking per slot at the
database level.

## Notifications & reminders

- Every new booking triggers (via FastAPI background tasks) a **confirmation
  message to the patient** and an **instant alert to `PULSE_ADMIN_CHAT_ID`**.
- A thread-based APScheduler job (every 5 min) sends **24h and 2h reminders**
  with inline buttons: **✅ Confirm** (callback → shell bot → `POST
  /api/internal/...`, guarded by `PULSE_INTERNAL_TOKEN`) and **📅 Reschedule**
  (deep link `t.me/<bot>?startapp=apt:<id>`).
- Per-booking flags (`reminder_24h_sent` / `reminder_2h_sent`) make it
  at-most-once, even if delivery fails.
- Telegram requires the patient to have pressed **Start** in the bot at least
  once — otherwise the Bot API returns `chat not found` (logged, never fatal).
- Delivery uses the same bot token as the shell bot; only `sendMessage` is
  called, so it never conflicts with the shell's polling.

Rate limiting: `POST /api/bookings` and `/api/assistant/query` are throttled
per client IP (`PULSE_RATELIMIT_BOOKING`, `PULSE_RATELIMIT_ASSISTANT`,
default `10/60` and `30/60`) with a `Retry-After` header on `429`.

## Catalog, schedule, reviews

- **Services CRUD** — `GET/POST/PATCH /api/admin/services`; deactivated
  services disappear from the public catalog while keeping their bookings.
- **QR codes** — `GET /api/admin/services/{id}/qr` renders a PNG QR with the
  service deep link (bot username resolved via `getMe`, cached).
- **Working hours & holidays** — `GET/PATCH /api/admin/schedule` (7 weekday
  rules), `GET/POST/DELETE /api/admin/holidays`. Every change rebuilds the
  future slot grid while preserving confirmed bookings; the public
  `GET /api/schedule` feeds the UI's day selector.
- **Reviews** — `POST /api/bookings/{id}/review` (owner, post-visit, one per
  booking), `GET /api/admin/reviews`, average rating in the overview.
- **Analytics** — `GET /api/admin/analytics?days=7` (bookings per day around
  today, top services) and `GET /api/admin/bookings.csv` for export.

### Models

- **Service** — `id`, `title`, `description`, `price`, `duration` (min), `icon_name`
- **Booking** — `id`, `user_telegram_id`, `user_name`, `service_id`, `date`,
  `time_slot`, `status` (`Confirmed` / `Cancelled` / `Completed`), `created_at`.
  Past `Confirmed` visits are reported as `Completed` by the frontend's
  effective-status mapping.
- **Slot** — `id`, `date`, `time_slot`, `is_available` (unique per date+time)

### Assistant parser

The rule-based brain understands service mentions, relative dates (`today`,
`tomorrow`, weekday names, `weekend`), day-parts (`morning`, `afternoon`,
`evening`), `earliest`, and price questions. It replies with text plus up to
three bookable slot suggestions; the frontend completes the booking through
the regular `POST /api/bookings` flow. Swap `app/assistant.py` for an LLM
implementation without touching the contract.

## Known limitations / next steps

- One global slot grid — no per-provider rooms or per-service capacity yet.
- `Completed` is derived on read, not persisted by a scheduled job.
- SQLite is single-writer; switch `PULSE_DB_URL` to PostgreSQL for scale.
- Rate limiting is in-process — use a shared store (e.g. Redis) for
  multi-worker deployments.
