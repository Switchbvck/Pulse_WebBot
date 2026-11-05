"""Application settings for the Pulse API (loaded from environment / .env)."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

# SQLite keeps local setup zero-config; swap for Postgres by changing the URL.
DATABASE_URL = os.getenv("PULSE_DB_URL", "").strip() or f"sqlite:///{BASE_DIR / 'pulse.db'}"

# Vite dev server origins allowed to call the API directly.
def _cors_origins() -> list[str]:
    raw = os.getenv("PULSE_CORS_ORIGINS", "")
    if raw.strip():
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    return ["http://localhost:5173", "http://127.0.0.1:5173"]


CORS_ORIGINS = _cors_origins()

# Fail-closed: without PULSE_ALLOW_ANONYMOUS=true unauthenticated requests
# are rejected; anonymous callers are ordinary users (never admins).
BOT_TOKEN = os.getenv("PULSE_BOT_TOKEN", "").strip()
ADMIN_IDS: set[int] = {
    int(item) for item in os.getenv("PULSE_ADMIN_IDS", "").split(",") if item.strip().isdigit()
}


def _flag(name: str, default: str = "false") -> bool:
    return (os.getenv(name, "").strip().lower() or default) in {"1", "true", "yes"}


ALLOW_ANONYMOUS = _flag("PULSE_ALLOW_ANONYMOUS")
DEV_ADMIN = _flag("PULSE_DEV_ADMIN")  # local-dev admin shortcut, never in prod

# initData older than this is rejected (replay protection).
INITDATA_MAX_AGE_SECONDS = int(os.getenv("PULSE_INITDATA_MAX_AGE", "86400") or 86400)

# Demo bookings + reviews on a brand-new database only.
SEED_DEMO_DATA = _flag("PULSE_SEED_DEMO_DATA", "true")

# Bookable grid: 09:00 – 20:30 every 30 minutes.
SLOT_START_MINUTES = 9 * 60
SLOT_END_MINUTES = 20 * 60 + 30
SLOT_STEP_MINUTES = 30

# Slots are seeded for today plus this many days ahead (frontend's 14-day selector).
SEED_DAYS_AHEAD = 13

# Revenue estimation window for the admin overview.
REVENUE_WINDOW_DAYS = 7

# Rate limiting: "max-requests/window-seconds" per client IP.
RATELIMIT_BOOKING = os.getenv("PULSE_RATELIMIT_BOOKING", "").strip() or "10/60"
RATELIMIT_ASSISTANT = os.getenv("PULSE_RATELIMIT_ASSISTANT", "").strip() or "30/60"

# Telegram notifications (sent server-side via the Bot API).
# ADMIN_CHAT_ID receives an instant alert for every new booking; leave 0 to skip.
BOT_API_BASE = os.getenv("PULSE_BOT_API_BASE", "").strip() or "https://api.telegram.org"
ADMIN_CHAT_ID = int(os.getenv("PULSE_ADMIN_CHAT_ID", "0") or 0)

# Shared secret for machine-to-machine calls from the shell bot (X-Internal-Token).
INTERNAL_TOKEN = os.getenv("PULSE_INTERNAL_TOKEN", "").strip()
