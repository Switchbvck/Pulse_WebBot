"""Basic commands for the Pulse Telegram shell."""

from __future__ import annotations

import logging

import httpx
from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
    Update,
    WebAppInfo,
)
from telegram.ext import ContextTypes

from config import API_URL, CLINIC_NAME, INTERNAL_TOKEN, MINI_APP_URL
from messages import MSG_HELP, MSG_WELCOME

logger = logging.getLogger(__name__)

# The keyboard button URL carries a login token (some clients drop Telegram
# launch params); the message stays in the chat, hence the long TTL.
KEYBOARD_OTT_TTL = 12 * 3600
LOGIN_OTT_TTL = 10 * 60


async def _issue_ott(update: Update, ttl_seconds: int) -> str | None:
    """One-time login token for this user, issued by the Pulse API."""
    user = update.effective_user
    if not user or not INTERNAL_TOKEN:
        return None
    try:
        response = httpx.post(
            f"{API_URL}/api/internal/ott",
            headers={"X-Internal-Token": INTERNAL_TOKEN},
            json={
                "telegram_id": user.id,
                "user_name": user.full_name or "Guest",
                "ttl_seconds": ttl_seconds,
            },
            timeout=5,
        )
        if response.status_code != 200:
            logger.warning("OTT issue failed: %s %s", response.status_code, response.text[:150])
            return None
        return response.json().get("token")
    except Exception:
        logger.warning("OTT issue failed for %s", user.id, exc_info=True)
        return None


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Greet the user and show the native Mini App launch button."""
    if not update.message or not update.effective_user:
        return
    logger.info("User %s started the shell bot", update.effective_user.id)

    # Native "Open Pulse" button only — login token baked into its URL.
    ott = await _issue_ott(update, KEYBOARD_OTT_TTL)
    keyboard = None
    if MINI_APP_URL:
        app_url = f"{MINI_APP_URL}?ott={ott}" if ott else MINI_APP_URL
        keyboard = ReplyKeyboardMarkup(
            [[KeyboardButton("Open Pulse", web_app=WebAppInfo(url=app_url))]],
            resize_keyboard=True,
        )
    await update.message.reply_text(
        MSG_WELCOME.format(clinic_name=CLINIC_NAME),
        reply_markup=keyboard,
    )
    if keyboard is None:
        await update.message.reply_text(
            "MINI_APP_URL is not configured — set it in .env and restart the bot."
        )


async def login(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Fresh one-tap login link (recovery path, on demand)."""
    if not update.message or not update.effective_user:
        return
    if not MINI_APP_URL:
        await update.message.reply_text(
            "MINI_APP_URL is not configured — set it in .env and restart the bot."
        )
        return
    ott = await _issue_ott(update, LOGIN_OTT_TTL)
    if not ott:
        await update.message.reply_text(
            "Could not issue a login token — is the Pulse API running?"
        )
        return
    keyboard = InlineKeyboardMarkup(
        [[InlineKeyboardButton("🔓 Open Pulse (login)", url=f"{MINI_APP_URL}?ott={ott}")]]
    )
    await update.message.reply_text(
        "This opens Pulse signed in as you. The link works for 10 minutes.",
        reply_markup=keyboard,
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return
    await update.message.reply_text(MSG_HELP)


async def fallback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Any non-command text is redirected to the Mini App."""
    if not update.message:
        return
    await update.message.reply_text(MSG_HELP)
