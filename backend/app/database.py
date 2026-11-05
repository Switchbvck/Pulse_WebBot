"""SQLAlchemy engine, session factory, and FastAPI dependency."""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import DATABASE_URL

# check_same_thread=False is required for SQLite used from FastAPI's threadpool;
# StaticPool keeps one shared connection for in-memory databases (tests).
engine_kwargs: dict = {"connect_args": {"check_same_thread": False}}
if ":memory:" in DATABASE_URL:
    engine_kwargs["poolclass"] = StaticPool

engine = create_engine(DATABASE_URL, **engine_kwargs)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


def init_db() -> None:
    """Create tables (idempotent) and apply tiny in-place migrations."""
    from app import models  # noqa: F401  — register model classes

    Base.metadata.create_all(bind=engine)
    _sqlite_backfill()


def _sqlite_backfill() -> None:
    """In-place migration: create_all cannot ALTER existing tables.

    bookings.duration defaults old rows to 30 (the old single-slot behavior).
    """
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    if "bookings" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("bookings")}
    if "duration" in columns:
        return
    with engine.begin() as connection:
        connection.execute(
            text("ALTER TABLE bookings ADD COLUMN duration INTEGER NOT NULL DEFAULT 30")
        )


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a request-scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
