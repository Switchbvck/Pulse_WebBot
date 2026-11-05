"""Settings for the Pulse Telegram shell (loaded from environment / .env)."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR: Path = Path(__file__).resolve().parent

TELEGRAM_TOKEN: str = os.getenv("TELEGRAM_TOKEN", "").strip()
CLINIC_NAME: str = os.getenv("CLINIC_NAME", "Pulse").strip()

# Public HTTPS URL of the deployed Pulse Mini App (pulse-app/dist).
# When empty, /start falls back to a text hint instead of the launch button.
MINI_APP_URL: str = os.getenv("MINI_APP_URL", "").strip()

# Pulse API connection for reminder callbacks (Confirm button).
API_URL: str = os.getenv("PULSE_API_URL", "").strip() or "http://127.0.0.1:8000"
INTERNAL_TOKEN: str = os.getenv("PULSE_INTERNAL_TOKEN", "").strip()

LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO").upper()
LOG_FORMAT: str = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
LOG_FILE: Path = BASE_DIR / "bot.log"
