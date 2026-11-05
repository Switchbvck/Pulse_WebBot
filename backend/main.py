"""Pulse API entry point: FastAPI app, CORS, routers, startup seeding."""

import asyncio
import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import BASE_DIR, CORS_ORIGINS
from app.routers import (
    admin,
    admin_catalog,
    assistant,
    auth,
    bookings,
    internal,
    services,
    waitlist,
)
from app.seed import seed_if_empty

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger("pulse.api")

# Thread-based scheduler: the job manages its own event loop via asyncio.run,
# which keeps it independent of FastAPI/ASGI loop lifecycles (tests included).
scheduler = BackgroundScheduler()


def _reminders_job() -> None:
    from app.reminders import send_due_reminders

    asyncio.run(send_due_reminders())


def _slot_window_job() -> None:
    """Roll the bookable slot window forward (hourly)."""
    from app.seed import refresh_slot_window

    refresh_slot_window()


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Create tables, seed demo data, and start the reminder scheduler."""
    from app.database import init_db

    init_db()
    seed_if_empty()
    # replace_existing: the module-level scheduler survives repeated lifespans (tests)
    scheduler.add_job(_reminders_job, "interval", minutes=5, id="reminders", replace_existing=True)
    scheduler.add_job(_slot_window_job, "interval", hours=1, id="slot-window", replace_existing=True)
    scheduler.start()
    logger.info("Pulse API ready (CORS origins: %s)", CORS_ORIGINS)
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(
    title="Pulse API",
    description="Backend for the Pulse appointment-booking Telegram Mini App.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Baseline browser hardening; frame-ancestors keeps the Telegram
    Desktop/Web iframe working while closing other embedders."""
    response = await call_next(request)
    response.headers.setdefault(
        "Content-Security-Policy",
        "frame-ancestors 'self' https://*.telegram.org",
    )
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    return response

for router in (
    services.router,
    bookings.router,
    waitlist.router,
    auth.router,
    admin.router,
    admin_catalog.router,
    internal.router,
    assistant.router,
):
    app.include_router(router, prefix="/api")


@app.get("/api/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


# Serve the built Mini App (pulse-app/dist) from the API origin.
from fastapi.responses import FileResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

DIST_DIR = BASE_DIR.parent / "pulse-app" / "dist"
if DIST_DIR.exists():
    # index.html must never be cached by the Telegram webview (stale bundles).
    @app.get("/", include_in_schema=False)
    def app_index() -> FileResponse:
        return FileResponse(
            DIST_DIR / "index.html",
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )

    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")
    logger.info("Serving Mini App from %s", DIST_DIR)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
