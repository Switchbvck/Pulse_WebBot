"""Pydantic request/response schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

DATE_PATTERN = r"^\d{4}-\d{2}-\d{2}$"
TIME_PATTERN = r"^([01]\d|2[0-3]):[0-5]\d$"


class ServiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    price: float
    duration: int
    icon_name: str


class ServiceCreate(BaseModel):
    title: str = Field(min_length=2, max_length=100)
    description: str = Field(min_length=2, max_length=500)
    price: float = Field(ge=0)
    duration: int = Field(ge=5, le=480)
    icon_name: str = Field(min_length=2, max_length=50)


class ServiceUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = Field(default=None, min_length=2, max_length=500)
    price: float | None = Field(default=None, ge=0)
    duration: int | None = Field(default=None, ge=5, le=480)
    icon_name: str | None = Field(default=None, min_length=2, max_length=50)
    is_active: bool | None = None


class ServiceAdminOut(ServiceOut):
    is_active: bool


class BookingCreate(BaseModel):
    user_telegram_id: int = Field(ge=1)
    user_name: str = Field(min_length=2, max_length=100)
    service_id: int
    date: str = Field(pattern=DATE_PATTERN)
    time_slot: str = Field(pattern=TIME_PATTERN)


class RescheduleRequest(BaseModel):
    date: str = Field(pattern=DATE_PATTERN)
    time_slot: str = Field(pattern=TIME_PATTERN)


class BookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_telegram_id: int
    user_name: str
    service_id: int
    service_title: str | None = None
    date: str
    time_slot: str
    duration: int = 30  # visit length snapshot (minutes) — drives the UI countdown
    status: str
    created_at: datetime
    has_review: bool = False


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=500)


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    booking_id: int
    rating: int
    comment: str | None
    created_at: datetime


class ReviewAdminOut(ReviewOut):
    user_name: str | None = None
    service_title: str | None = None


class ScheduleRule(BaseModel):
    weekday: int = Field(ge=0, le=6)  # 0 = Monday ... 6 = Sunday
    is_open: bool
    start_time: str = Field(pattern=TIME_PATTERN)
    end_time: str = Field(pattern=TIME_PATTERN)


class ScheduleRuleOut(ScheduleRule):
    model_config = ConfigDict(from_attributes=True)


class HolidayCreate(BaseModel):
    date: str = Field(pattern=DATE_PATTERN)
    note: str | None = Field(default=None, max_length=200)


class HolidayOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: str
    note: str | None


class WaitlistJoin(BaseModel):
    date: str = Field(pattern=DATE_PATTERN)
    user_telegram_id: int | None = Field(default=None, ge=1)
    user_name: str | None = Field(default=None, min_length=2, max_length=100)


class WaitlistOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_telegram_id: int
    user_name: str
    date: str
    created_at: datetime


class ServiceReviewOut(BaseModel):
    rating: int
    comment: str | None
    user_name: str | None
    created_at: datetime


class SlotToggle(BaseModel):
    is_available: bool


class SlotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: str
    time_slot: str
    is_available: bool


class AdminOverview(BaseModel):
    total_bookings_today: int
    estimated_revenue: float
    active_clients: int
    average_rating: float | None = None


class AssistantQuery(BaseModel):
    message: str = Field(min_length=1, max_length=500)


class AssistantSuggestion(BaseModel):
    date: str
    time_slot: str
    service_id: int
    service_title: str


class AssistantOut(BaseModel):
    text: str
    suggestions: list[AssistantSuggestion]
