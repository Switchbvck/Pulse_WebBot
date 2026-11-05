"""Logging configuration for the bot and its dependencies."""

from __future__ import annotations

import logging

from config import LOG_FILE, LOG_FORMAT, LOG_LEVEL


def setup_logging() -> None:
    logging.basicConfig(
        format=LOG_FORMAT,
        level=getattr(logging, LOG_LEVEL, logging.INFO),
        handlers=[
            logging.FileHandler(LOG_FILE, encoding="utf-8"),
            logging.StreamHandler(),
        ],
        force=True,
    )

    for noisy_logger in ("httpx", "telegram", "asyncio"):
        logging.getLogger(noisy_logger).setLevel(logging.WARNING)
