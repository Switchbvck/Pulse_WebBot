"""SQLAlchemy ORM models: services, time slots, and bookings."""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class BookingStatus(str, enum.Enum):
    CONFIRMED = "Confirmed"
    CANCELLED = "Cancelled"
    COMPLETED = "Completed"


class Service(Base):
    """A bookable Pulse service."""

    __tablename__ = "services"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(100), unique=True)
    description: Mapped[str] = mapped_column(String(500))
    price: Mapped[float] = mapped_column(Float)
    duration: Mapped[int] = mapped_column(Integer)  # minutes
    icon_name: Mapped[str] = mapped_column(String(50))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    bookings: Mapped[list[Booking]] = relationship(back_populates="service")


class Slot(Base):
    """One bookable time slot on a specific day."""

    __tablename__ = "slots"
    __table_args__ = (UniqueConstraint("date", "time_slot", name="uq_slot_date_time"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    date: Mapped[str] = mapped_column(String(10), index=True)  # YYYY-MM-DD
    time_slot: Mapped[str] = mapped_column(String(5))  # HH:MM
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)


class Booking(Base):
    """A patient booking linked to a service and a time slot."""

    __tablename__ = "bookings"
    __table_args__ = (
        # Backstop for the atomic range claim: one active booking per slot.
        Index(
            "uq_active_booking_slot",
            "date",
            "time_slot",
            unique=True,
            sqlite_where=text("status = 'Confirmed'"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_telegram_id: Mapped[int] = mapped_column(Integer, index=True)
    user_name: Mapped[str] = mapped_column(String(100))
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id"))
    date: Mapped[str] = mapped_column(String(10), index=True)
    time_slot: Mapped[str] = mapped_column(String(5))
    # Length snapshot (minutes) at booking time — releases/reschedules derive
    # the slot range from it, so later catalog edits stay harmless.
    duration: Mapped[int] = mapped_column(Integer, default=30, server_default="30")
    status: Mapped[str] = mapped_column(
        String(20), default=BookingStatus.CONFIRMED.value, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    # At-most-once reminder flags (set even when delivery fails).
    reminder_24h_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    reminder_2h_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    attendance_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)

    service: Mapped[Service] = relationship(back_populates="bookings")
    review: Mapped[Review | None] = relationship(back_populates="booking", uselist=False)

    @property
    def service_title(self) -> str | None:
        return self.service.title if self.service is not None else None

    @property
    def has_review(self) -> bool:
        return self.review is not None


class Review(Base):
    """Post-visit rating (one per booking)."""

    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey("bookings.id"), unique=True)
    user_telegram_id: Mapped[int] = mapped_column(Integer, index=True)
    rating: Mapped[int] = mapped_column(Integer)  # 1..5
    comment: Mapped[str | None] = mapped_column(String(500), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    booking: Mapped[Booking] = relationship(back_populates="review")


class WorkingHours(Base):
    """Opening hours per weekday (0 = Monday ... 6 = Sunday)."""

    __tablename__ = "working_hours"

    weekday: Mapped[int] = mapped_column(Integer, primary_key=True)
    is_open: Mapped[bool] = mapped_column(Boolean, default=True)
    start_time: Mapped[str] = mapped_column(String(5), default="09:00")
    end_time: Mapped[str] = mapped_column(String(5), default="20:30")


class Holiday(Base):
    """A date the clinic is closed (e.g. a public holiday)."""

    __tablename__ = "holidays"

    date: Mapped[str] = mapped_column(String(10), primary_key=True)  # YYYY-MM-DD
    note: Mapped[str | None] = mapped_column(String(200), default=None)


class WaitlistEntry(Base):
    """A patient subscribed to slot-opening notifications for one day."""

    __tablename__ = "waitlist"
    __table_args__ = (UniqueConstraint("user_telegram_id", "date", name="uq_waitlist_user_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_telegram_id: Mapped[int] = mapped_column(Integer, index=True)
    user_name: Mapped[str] = mapped_column(String(100))
    date: Mapped[str] = mapped_column(String(10), index=True)  # YYYY-MM-DD
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
