"""Telegram Mini App initData validation (HMAC-SHA256 per Telegram docs)."""

from __future__ import annotations

import hashlib
import hmac
import time
from urllib.parse import parse_qsl

from app.config import INITDATA_MAX_AGE_SECONDS


def validate_init_data(init_data: str, bot_token: str) -> dict[str, str] | None:
    """Return the parsed initData fields when the signature is valid, else None.

    Implementation follows https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    Signatures older than INITDATA_MAX_AGE_SECONDS are rejected: auth_date is
    part of the signed payload, so this bounds replay of a captured header.
    """
    try:
        pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    except ValueError:
        return None

    received_hash = pairs.pop("hash", None)
    if not received_hash:
        return None

    data_check_string = "\n".join(f"{key}={pairs[key]}" for key in sorted(pairs))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    calculated = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(calculated, received_hash):
        return None

    try:
        auth_age = time.time() - int(pairs.get("auth_date", "0"))
    except ValueError:
        return None
    if auth_age < 0 or auth_age > INITDATA_MAX_AGE_SECONDS:
        return None

    return pairs
