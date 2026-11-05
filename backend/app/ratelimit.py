"""In-process sliding-window rate limiting (single-worker deployments)."""

from __future__ import annotations

import os
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.config import RATELIMIT_ASSISTANT, RATELIMIT_BOOKING


class SlidingWindowLimiter:
    """Sliding window per key; raises HTTP 429 with Retry-After when over the limit."""

    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._next_prune = time.monotonic() + window_seconds

    def hit(self, key: str) -> None:
        now = time.monotonic()
        self._prune(now)
        bucket = self._hits[key]
        while bucket and now - bucket[0] > self.window_seconds:
            bucket.popleft()
        if len(bucket) >= self.max_requests:
            retry_after = max(1, int(self.window_seconds - (now - bucket[0])))
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests — please slow down a little",
                headers={"Retry-After": str(retry_after)},
            )
        bucket.append(now)

    def _prune(self, now: float) -> None:
        """Periodically drop idle keys so the map cannot grow without bound."""
        if now < self._next_prune:
            return
        stale = [
            key
            for key, bucket in self._hits.items()
            if not bucket or now - bucket[-1] > self.window_seconds
        ]
        for key in stale:
            self._hits.pop(key, None)
        self._next_prune = now + self.window_seconds


def parse_limit(raw: str, default: str) -> tuple[int, int]:
    """Parse an "N/window-seconds" string like "10/60"."""
    count, _, window = (raw or default).strip().partition("/")
    return int(count or default.split("/")[0]), int(window or default.split("/")[1])


def _client_key(request: Request) -> str:
    """Client identity: the right-most X-Forwarded-For entry behind a proxy
    (ngrok et al.), the socket peer otherwise."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip() or "unknown"
    return request.client.host if request.client else "unknown"


booking_limiter = SlidingWindowLimiter(*parse_limit(os.getenv("PULSE_RATELIMIT_BOOKING", ""), RATELIMIT_BOOKING))
assistant_limiter = SlidingWindowLimiter(
    *parse_limit(os.getenv("PULSE_RATELIMIT_ASSISTANT", ""), RATELIMIT_ASSISTANT)
)


async def limit_booking(request: Request) -> None:
    booking_limiter.hit(_client_key(request))


async def limit_assistant(request: Request) -> None:
    assistant_limiter.hit(_client_key(request))
