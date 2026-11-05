"""Pulse Telegram shell: launches the Mini App and handles reminder callbacks."""

from __future__ import annotations

import logging

import httpx
from telegram import BotCommand, Update
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from config import INTERNAL_TOKEN, API_URL, TELEGRAM_TOKEN
from handlers import misc
from logging_config import setup_logging
from messages import MSG_ERROR_GENERAL

logger = logging.getLogger(__name__)


async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Log the failure and let the user know."""
    logger.error("Exception while handling an update", exc_info=context.error)
    if isinstance(update, Update) and update.effective_message:
        await update.effective_message.reply_text(MSG_ERROR_GENERAL)


async def on_reminder_confirm(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Patient tapped "Confirm" on a reminder: record attendance via the API."""
    query = update.callback_query
    data = query.data or ""
    if not data.startswith("confirm:"):
        await query.answer()
        return
    booking_id = data.split(":", 1)[1]
    try:
        response = httpx.post(
            f"{API_URL}/api/internal/bookings/{booking_id}/confirm-attendance",
            headers={"X-Internal-Token": INTERNAL_TOKEN},
            timeout=5,
        )
        if response.status_code == 200:
            await query.answer("✅ Confirmed — see you at your session!")
            await query.edit_message_reply_markup(reply_markup=None)
        else:
            await query.answer("Could not confirm — please open Pulse.", show_alert=True)
    except Exception:
        logger.warning("Confirm callback failed for booking %s", booking_id, exc_info=True)
        await query.answer("Could not confirm — please open Pulse.", show_alert=True)


async def _post_init(application: Application) -> None:
    """Publish the command menu so /login is discoverable in the client UI."""
    await application.bot.set_my_commands(
        [
            BotCommand("start", "Show the Pulse launch button"),
            BotCommand("login", "Fresh one-tap login link"),
            BotCommand("help", "How to use Pulse"),
        ]
    )


def main() -> None:
    setup_logging()

    if not TELEGRAM_TOKEN:
        raise RuntimeError("TELEGRAM_TOKEN is not configured. Add it to the .env file.")

    application = Application.builder().token(TELEGRAM_TOKEN).post_init(_post_init).build()

    application.add_handler(CommandHandler("start", misc.start))
    application.add_handler(CommandHandler("login", misc.login))
    application.add_handler(CommandHandler("help", misc.help_command))
    application.add_handler(
        CallbackQueryHandler(on_reminder_confirm, pattern=r"^confirm:\d+$")
    )
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, misc.fallback))
    application.add_error_handler(error_handler)

    logger.info("Pulse shell bot started")
    application.run_polling()


if __name__ == "__main__":
    main()
