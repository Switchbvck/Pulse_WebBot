"""Authentication dependencies: Telegram identity or anonymous dev access."""

from __future__ import annotations

import json
from typing import NamedTuple

from fastapi import Depends, Header, HTTPException, status

from app.config import ADMIN_IDS, ALLOW_ANONYMOUS, BOT_TOKEN, DEV_ADMIN
from app.telegram import validate_init_data


class CurrentUser(NamedTuple):
    """Resolved caller identity; id=None means anonymous (dev) access."""

    id: int | None
    name: str | None
    is_admin: bool
    anonymous: bool


def get_current_user(
    x_session_token: str | None = Header(default=None, alias="X-Session-Token"),
    x_telegram_init_data: str | None = Header(default=None, alias="X-Telegram-Init-Data"),
) -> CurrentUser:
    """Resolve the caller: session token -> Telegram initData -> dev fallback."""
    if x_session_token:
        from app.auth import session_user

        session = session_user(x_session_token)
        if session is not None:
            return CurrentUser(
                id=session["id"],
                name=session["name"],
                is_admin=session["id"] in ADMIN_IDS,
                anonymous=False,
            )
        # Stale token (in-memory sessions die with the process): ignore it
        # and fall through instead of failing every request with 401.

    if x_telegram_init_data:
        if not BOT_TOKEN:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "Telegram authentication is not configured on the server",
            )
        pairs = validate_init_data(x_telegram_init_data, BOT_TOKEN)
        if pairs is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Telegram initData signature")
        try:
            raw_user = json.loads(pairs.get("user", "{}"))
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED, "Malformed Telegram user payload"
            ) from exc
        user_id = int(raw_user.get("id", 0))
        name = " ".join(
            part for part in (raw_user.get("first_name"), raw_user.get("last_name")) if part
        ).strip() or "Guest"
        return CurrentUser(id=user_id, name=name, is_admin=user_id in ADMIN_IDS, anonymous=False)

    if ALLOW_ANONYMOUS:
        return CurrentUser(id=None, name=None, is_admin=DEV_ADMIN, anonymous=True)
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required")


def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Guard for /api/admin/* endpoints."""
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Administrator access required")
    return user
