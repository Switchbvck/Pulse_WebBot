"""One-time-token and session auth: the fallback when initData is lost.

The bot issues a short-lived OTT; the Mini App exchanges it for a
longer-lived session token (in-memory, dies with the process).
"""

from __future__ import annotations

import secrets
import threading
import time

OTT_TTL_SECONDS = 10 * 60
SESSION_TTL_SECONDS = 7 * 24 * 3600

_lock = threading.Lock()
_ott: dict[str, dict] = {}      # token -> {telegram_id, name, expires}
_sessions: dict[str, dict] = {} # token -> {telegram_id, name, expires}


def _prune(now: float) -> None:
    for store in (_ott, _sessions):
        expired = [token for token, data in store.items() if data["expires"] < now]
        for token in expired:
            store.pop(token, None)


def create_ott(telegram_id: int, name: str, ttl_seconds: int = OTT_TTL_SECONDS) -> str:
    token = secrets.token_urlsafe(24)
    with _lock:
        _prune(time.time())
        _ott[token] = {
            "telegram_id": telegram_id,
            "name": name,
            "expires": time.time() + ttl_seconds,
        }
    return token


def exchange_ott(token: str) -> dict | None:
    """Consume a valid OTT and issue a session. Returns None when invalid."""
    now = time.time()
    with _lock:
        _prune(now)
        data = _ott.pop(token, None)
    if data is None or data["expires"] < now:
        return None
    session_token = secrets.token_urlsafe(32)
    with _lock:
        _sessions[session_token] = {
            "telegram_id": data["telegram_id"],
            "name": data["name"],
            "expires": now + SESSION_TTL_SECONDS,
        }
    return {
        "session_token": session_token,
        "user": {"id": data["telegram_id"], "name": data["name"]},
    }


def session_user(token: str) -> dict | None:
    """Resolve a session token to the stored identity, or None."""
    now = time.time()
    with _lock:
        _prune(now)
        data = _sessions.get(token)
    if data is None or data["expires"] < now:
        return None
    return {"id": data["telegram_id"], "name": data["name"]}
