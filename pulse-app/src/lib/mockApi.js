// In-memory mock backend for standalone `npm run dev`: availability follows
// the editable schedule with deterministic pseudo-random "already booked" mix.

import { SERVICES } from '../data/catalog'
import { toISODate, pad2 } from './date'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Deterministic 0..1 hash of a string. */
function seeded(str) {
  let hash = 0
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash % 1000) / 1000
}

const DEMO_USER_ID = 771234567

function shiftDays(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return toISODate(date)
}

const TODAY = toISODate(new Date())

/* ----------------------------- services state ----------------------------- */

let servicesState = SERVICES.map((service) => ({ ...service, is_active: true }))

/* ---------------------------- appointments state --------------------------- */

let appointments = [
  { id: 'apt-demo-1', telegram_id: DEMO_USER_ID, user_name: 'Alex Morgan', service_id: 'svc-checkup', date: shiftDays(2), time: '11:30', status: 'upcoming' },
  { id: 'apt-demo-2', telegram_id: DEMO_USER_ID, user_name: 'Alex Morgan', service_id: 'svc-therapy', date: shiftDays(6), time: '18:00', status: 'upcoming' },
  { id: 'apt-demo-3', telegram_id: DEMO_USER_ID, user_name: 'Alex Morgan', service_id: 'svc-consult', date: shiftDays(-4), time: '14:00', status: 'completed' },
  { id: 'apt-demo-4', telegram_id: DEMO_USER_ID, user_name: 'Alex Morgan', service_id: 'svc-diagnostics', date: shiftDays(-12), time: '09:30', status: 'completed' },
  { id: 'apt-admin-1', telegram_id: 1002, user_name: 'Maya Chen', service_id: 'svc-consult', date: TODAY, time: '09:00', status: 'completed' },
  { id: 'apt-admin-2', telegram_id: 1003, user_name: 'Liam Patel', service_id: 'svc-diagnostics', date: TODAY, time: '13:30', status: 'upcoming' },
  { id: 'apt-admin-3', telegram_id: 1004, user_name: 'Sofia Reyes', service_id: 'svc-therapy', date: TODAY, time: '16:00', status: 'upcoming' },
  { id: 'apt-admin-4', telegram_id: 1005, user_name: 'Noah Kim', service_id: 'svc-telemedicine', date: TODAY, time: '11:00', status: 'cancelled' },
  { id: 'apt-admin-5', telegram_id: 1006, user_name: 'Emma Novak', service_id: 'svc-specialist', date: shiftDays(1), time: '10:30', status: 'upcoming' },
  { id: 'apt-admin-6', telegram_id: 1007, user_name: 'Daniel Ford', service_id: 'svc-consult', date: shiftDays(3), time: '15:00', status: 'upcoming' },
]

const reviewedBookingIds = new Set()

/* ------------------------------ schedule state ----------------------------- */

let scheduleState = {
  weekdays: Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    is_open: true,
    start_time: '09:00',
    end_time: '20:30',
  })),
  holidays: [], // [{ date, note }]
}

// Manual admin overrides: "YYYY-MM-DD|HH:MM" -> boolean (enabled).
const slotOverrides = {}

/* -------------------------------- helpers --------------------------------- */

const ALL_TIMES = []
for (let minutes = 9 * 60; minutes <= 20 * 60 + 30; minutes += 30) {
  ALL_TIMES.push(`${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`)
}

function isPastSlot(date, time) {
  if (date !== TODAY) return false
  const now = new Date()
  return time <= `${pad2(now.getHours())}:${pad2(now.getMinutes())}`
}

/** Seeded base availability, before schedule rules apply. */
function baseSlotEnabled(date, time) {
  if (isPastSlot(date, time)) return false
  return seeded(`${date}T${time}`) >= 0.35
}

function weekdayRule(dateISO) {
  const weekday = (new Date(`${dateISO}T12:00:00`).getDay() + 6) % 7 // 0 = Monday
  return scheduleState.weekdays[weekday]
}

/** Is the clinic open at all on this date (hours + holidays)? */
function isClinicOpen(dateISO) {
  if (scheduleState.holidays.some((holiday) => holiday.date === dateISO)) return false
  return weekdayRule(dateISO)?.is_open ?? false
}

function serviceName(serviceId) {
  return servicesState.find((service) => service.id === serviceId)?.name ?? 'Pulse session'
}

function serviceDuration(serviceId) {
  return servicesState.find((service) => service.id === serviceId)?.duration_min ?? 30
}

/**
 * Grid times held by an appointment: [start, start + duration).
 * Mirrors backend app.schedule.covered_times so the demo behaves like live.
 */
function coveredTimes(start, durationMin) {
  const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  const times = []
  for (let m = toMinutes(start); m < toMinutes(start) + Math.max(durationMin, 1); m += 30) {
    times.push(`${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`)
  }
  return times
}

/** Availability of a single grid slot (schedule + holiday + admin override). */
function rawSlotAvailable(dateISO, time) {
  const override = slotOverrides[`${dateISO}|${time}`]
  if (override !== undefined) return override
  if (!isClinicOpen(dateISO)) return false
  const rule = weekdayRule(dateISO)
  if (time < rule.start_time || time > rule.end_time) return false
  return baseSlotEnabled(dateISO, time)
}

/** Grid times held by existing (demo) appointments on that date. */
function occupiedTimes(dateISO) {
  const occupied = new Set()
  for (const appointment of appointments) {
    if (appointment.date !== dateISO || appointment.status === 'cancelled') continue
    for (const time of coveredTimes(appointment.time, serviceDuration(appointment.service_id))) {
      occupied.add(time)
    }
  }
  return occupied
}

/* --------------------------------- user ----------------------------------- */

export async function fetchServices() {
  await delay(450)
  return servicesState.filter((service) => service.is_active).map(({ is_active, ...rest }) => rest)
}

/**
 * Duration-aware availability: with `serviceId`, a start is offered only
 * when its WHOLE appointment range fits into free grid time.
 */
export async function fetchSlots(date, serviceId = null) {
  await delay(400)
  const duration = serviceDuration(serviceId)
  const occupied = occupiedTimes(date)
  return ALL_TIMES.filter((time) =>
    coveredTimes(time, duration).every(
      (covered) => !occupied.has(covered) && rawSlotAvailable(date, covered),
    ),
  )
}

export async function fetchAppointments(telegramId) {
  await delay(500)
  return appointments
    .filter((appointment) => appointment.telegram_id === telegramId)
    .map((appointment) => ({ ...appointment, has_review: reviewedBookingIds.has(appointment.id) }))
}

export async function createBooking(payload) {
  await delay(700)
  const occupied = occupiedTimes(payload.date)
  const fits = coveredTimes(payload.time, serviceDuration(payload.service_id)).every(
    (covered) => !occupied.has(covered) && rawSlotAvailable(payload.date, covered),
  )
  if (!fits) {
    throw new Error('This slot is no longer available — please pick another time')
  }
  const appointment = {
    id: `apt-${Date.now()}`,
    telegram_id: payload.telegram_id,
    user_name: payload.user_name,
    service_id: payload.service_id,
    date: payload.date,
    time: payload.time,
    status: 'upcoming',
  }
  appointments = [...appointments, appointment]
  return appointment
}

export async function cancelBooking(id) {
  await delay(450)
  appointments = appointments.filter((appointment) => appointment.id !== id)
  return { ok: true }
}

export async function rescheduleBooking(id, payload) {
  await delay(600)
  appointments = appointments.map((appointment) =>
    appointment.id === id
      ? { ...appointment, date: payload.date, time: payload.time }
      : appointment,
  )
  return appointments.find((appointment) => appointment.id === id)
}

export async function fetchServiceReviews(serviceId) {
  await delay(350)
  return [...reviewedBookingIds]
    .map((bookingId) => {
      const appointment = appointments.find((item) => item.id === bookingId)
      return {
        rating: 5,
        comment: 'Great session!',
        user_name: appointment?.user_name ?? null,
        created_at: new Date().toISOString(),
        service_id: appointment?.service_id,
      }
    })
    .filter((review) => String(review.service_id) === String(serviceId))
    .map(({ service_id, ...review }) => review)
}

/* ------------------------------ waiting list ------------------------------ */

let waitlistState = []

export async function joinWaitlist(date, identity) {
  await delay(400)
  if (waitlistState.some((entry) => entry.telegram_id === identity?.id && entry.date === date)) {
    throw new Error('You are already on the waitlist for this day')
  }
  const entry = {
    id: `wl-${Date.now()}`,
    telegram_id: identity?.id ?? 0,
    user_name: identity?.name ?? 'Guest',
    date,
  }
  waitlistState = [...waitlistState, entry]
  return { id: entry.id, date, user_name: entry.user_name }
}

export async function fetchWaitlist(telegramId) {
  await delay(300)
  return waitlistState
    .filter((entry) => entry.telegram_id === telegramId)
    .map((entry) => ({ id: entry.id, date: entry.date, user_name: entry.user_name }))
}

export async function deleteWaitlistEntry(entryId) {
  await delay(250)
  waitlistState = waitlistState.filter((entry) => entry.id !== entryId)
  return { ok: true }
}

/* --------------------------------- admin ---------------------------------- */

export async function fetchAdminServices() {
  await delay(300)
  return servicesState.map((service) => ({
    ...service,
    price: Number(service.price),
  }))
}

export async function createAdminService(payload) {
  await delay(300)
  if (servicesState.some((service) => service.name === payload.name)) {
    throw new Error('A service with this name already exists')
  }
  const service = {
    id: `svc-${Date.now()}`,
    name: payload.name,
    description: payload.description,
    price: Number(payload.price),
    duration_min: Number(payload.duration_min),
    icon: payload.icon,
    is_active: true,
  }
  servicesState = [...servicesState, service]
  return service
}

export async function updateAdminService(id, patch) {
  await delay(250)
  if (patch.name && servicesState.some((service) => service.id !== id && service.name === patch.name)) {
    throw new Error('A service with this name already exists')
  }
  servicesState = servicesState.map((service) =>
    service.id === id ? { ...service, ...patch, price: patch.price != null ? Number(patch.price) : service.price } : service,
  )
  return servicesState.find((service) => service.id === id)
}

export async function fetchAdminScheduleRules() {
  await delay(250)
  return scheduleState.weekdays.map((rule) => ({ ...rule }))
}

export async function updateAdminScheduleRules(rules) {
  await delay(300)
  scheduleState = { ...scheduleState, weekdays: rules.map((rule) => ({ ...rule })) }
  return scheduleState.weekdays
}

export async function addAdminHoliday(date, note) {
  await delay(250)
  if (scheduleState.holidays.some((holiday) => holiday.date === date)) {
    throw new Error('This date is already a holiday')
  }
  scheduleState = {
    ...scheduleState,
    holidays: [...scheduleState.holidays, { date, note: note || null }],
  }
  return { date, note: note || null }
}

export async function deleteAdminHoliday(date) {
  await delay(250)
  scheduleState = {
    ...scheduleState,
    holidays: scheduleState.holidays.filter((holiday) => holiday.date !== date),
  }
  return { ok: true }
}

export async function fetchPublicSchedule() {
  await delay(200)
  return {
    weekdays: scheduleState.weekdays.map((rule) => ({ ...rule })),
    holidays: scheduleState.holidays.map((holiday) => ({ ...holiday })),
  }
}

export async function fetchAdminSlots(date) {
  await delay(350)
  const open = isClinicOpen(date)
  const rule = weekdayRule(date)
  return ALL_TIMES.map((time) => {
    const override = slotOverrides[`${date}|${time}`]
    if (override !== undefined) {
      return { id: `${date}|${time}`, time, enabled: override }
    }
    const inHours = open && time >= rule.start_time && time <= rule.end_time
    return { id: `${date}|${time}`, time, enabled: inHours && baseSlotEnabled(date, time) }
  })
}

export async function setSlotEnabled(slotId, enabled) {
  await delay(150)
  slotOverrides[slotId] = enabled // slotId is "YYYY-MM-DD|HH:MM"
  return { id: slotId, enabled }
}

export async function fetchAdminSchedule(date) {
  await delay(400)
  return appointments
    .filter((appointment) => appointment.date === date)
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((appointment) => ({
      ...appointment,
      service_name: serviceName(appointment.service_id),
    }))
}

export async function fetchAdminMetrics() {
  await delay(450)
  const weekAhead = shiftDays(7)
  const upcomingWeek = appointments.filter(
    (appointment) =>
      appointment.status === 'upcoming' &&
      appointment.date >= TODAY &&
      appointment.date <= weekAhead,
  )
  const revenue = upcomingWeek.reduce(
    (sum, appointment) =>
      sum + (servicesState.find((service) => service.id === appointment.service_id)?.price ?? 0),
    0,
  )
  const rated = [...reviewedBookingIds]
  return {
    bookingsToday: appointments.filter(
      (appointment) => appointment.date === TODAY && appointment.status !== 'cancelled',
    ).length,
    revenueEstimate: revenue,
    activeClients: new Set(
      appointments.filter((appointment) => appointment.status !== 'cancelled').map((a) => a.telegram_id),
    ).size,
    averageRating: rated.length > 0 ? 5.0 : null,
  }
}

export async function fetchAdminReviews() {
  await delay(350)
  return [...reviewedBookingIds].map((bookingId, index) => {
    const appointment = appointments.find((item) => item.id === bookingId)
    return {
      id: `rev-${index}`,
      booking_id: bookingId,
      rating: 5,
      comment: index % 2 === 0 ? 'Great session!' : null,
      created_at: new Date().toISOString(),
      user_name: appointment?.user_name ?? null,
      service_title: appointment ? serviceName(appointment.service_id) : null,
    }
  })
}

export async function fetchAnalytics() {
  await delay(400)
  const days = []
  for (let offset = -3; offset <= 3; offset += 1) {
    const iso = shiftDays(offset)
    days.push({
      date: iso,
      count: appointments.filter(
        (appointment) => appointment.date === iso && appointment.status !== 'cancelled',
      ).length,
    })
  }
  const counts = new Map()
  for (const appointment of appointments) {
    if (appointment.status === 'cancelled') continue
    counts.set(appointment.service_id, (counts.get(appointment.service_id) ?? 0) + 1)
  }
  const topServices = [...counts.entries()]
    .map(([serviceId, count]) => ({ title: serviceName(serviceId), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
  return { bookingsPerDay: days, topServices }
}

export async function downloadBookingsCsv() {
  await delay(400)
  const header = 'id,user_telegram_id,user_name,service,date,time,status,created_at'
  const rows = appointments.map((appointment) =>
    [
      appointment.id,
      appointment.telegram_id,
      appointment.user_name,
      serviceName(appointment.service_id),
      appointment.date,
      appointment.time,
      appointment.status,
      TODAY,
    ].join(','),
  )
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'pulse-bookings.csv'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
