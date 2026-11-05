// Backend API client (live) with an in-memory mock fallback (demo mode).
// Live responses are mapped from backend naming (time_slot, "Confirmed"…)
// into the shape the UI components expect.

import { getInitData } from './telegram'
import { generateReply } from './assistant'
import { appointmentDate } from './date'
import * as mock from './mockApi'

const API_BASE = import.meta.env.VITE_API_BASE_URL?.trim()
const REQUEST_TIMEOUT_MS = 10_000

/** 'live' when a backend URL is configured, 'mock' otherwise. */
export const apiSource = API_BASE ? 'live' : 'mock'

const SESSION_KEY = 'pulse.session'

export function getSessionToken() {
  try {
    return localStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

/** Exchange a one-time bot token for a stored session identity. */
export async function exchangeOtt(ott) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${API_BASE}/auth/ott`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({ token: ott }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Login failed (${response.status})`)
    const data = await response.json()
    localStorage.setItem(SESSION_KEY, data.session_token)
    return data.user // { id, name }
  } finally {
    clearTimeout(timer)
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // localStorage unavailable (private mode)
  }
}

async function request(path, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        'X-Telegram-Init-Data': getInitData(),
        'X-Session-Token': getSessionToken() ?? '',
        ...(options.headers ?? {}),
      },
    })
    if (!response.ok) {
      // 401 with a stored session = the server no longer knows it (in-memory
      // sessions die on restart); drop it and fall back to initData.
      if (response.status === 401 && getSessionToken()) clearSession()
      // Surface the backend's human-readable detail (e.g. 409 slot conflicts).
      let message = `Request failed with status ${response.status}`
      try {
        const body = await response.json()
        if (body && typeof body.detail === 'string') message = body.detail
      } catch {
        // Non-JSON error body
      }
      const error = new Error(message)
      error.status = response.status
      throw error
    }
    return response.status === 204 ? null : await response.json()
  } finally {
    clearTimeout(timer)
  }
}

/* ------------------------- backend -> UI adapters ------------------------- */

const STATUS_MAP = {
  Confirmed: 'upcoming',
  upcoming: 'upcoming',
  Completed: 'completed',
  completed: 'completed',
  Cancelled: 'cancelled',
  cancelled: 'cancelled',
}

function mapService(service) {
  return {
    id: service.id,
    name: service.title,
    description: service.description,
    price: service.price,
    duration_min: service.duration,
    icon: service.icon_name,
  }
}

function mapBooking(booking) {
  const time = booking.time_slot ?? booking.time
  let status = STATUS_MAP[booking.status] ?? 'upcoming'
  // Backend keeps past bookings "Confirmed" — history shows them as completed.
  if (status === 'upcoming' && appointmentDate(booking.date, time) <= new Date()) {
    status = 'completed'
  }
  return {
    id: booking.id,
    service_id: booking.service_id,
    service_name: booking.service_title ?? booking.service_name,
    user_name: booking.user_name,
    date: booking.date,
    time,
    status,
    hasReview: booking.has_review ?? false,
  }
}

function mapAssistantReply(reply) {
  return {
    text: reply.text,
    suggestions: (reply.suggestions ?? []).map((slot) => ({
      date: slot.date,
      time: slot.time_slot ?? slot.time,
      serviceId: slot.service_id ?? slot.serviceId,
      serviceTitle: slot.service_title,
      booked: false,
    })),
  }
}

function mapAdminSlots(rows) {
  return rows.map((row) => ({
    id: row.id,
    time: row.time_slot ?? row.time,
    enabled: row.is_available ?? row.enabled,
  }))
}

/* --------------------------------- raw IO --------------------------------- */

/** Fetch a binary payload (QR PNG, CSV) with auth headers, as a Blob. */
async function requestBlob(path) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      signal: controller.signal,
      headers: { 'X-Telegram-Init-Data': getInitData(), 'ngrok-skip-browser-warning': 'true', 'X-Session-Token': getSessionToken() ?? '' },
    })
    if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
    return await response.blob()
  } finally {
    clearTimeout(timer)
  }
}

export function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/* ---------------------------------- user ---------------------------------- */

export const fetchMe = () =>
  API_BASE
    ? request('/me')
    : Promise.resolve({ id: 771234567, name: 'Alex Morgan', is_admin: true, anonymous: true })

export const fetchServices = () =>
  API_BASE
    ? request('/services').then((rows) => rows.map(mapService))
    : mock.fetchServices()

/** Bookable "HH:MM" starts; with serviceId only duration-fitting starts. */
export const fetchSlots = (date, serviceId = null) =>
  API_BASE
    ? request(
        `/slots?date=${encodeURIComponent(date)}${
          serviceId != null ? `&service_id=${encodeURIComponent(serviceId)}` : ''
        }`,
      )
    : mock.fetchSlots(date, serviceId)

export const fetchAppointments = (telegramId) =>
  API_BASE
    ? request(`/bookings?user_id=${encodeURIComponent(telegramId)}`).then((rows) =>
        rows.map(mapBooking),
      )
    : mock.fetchAppointments(telegramId)

export const createBooking = (payload) =>
  API_BASE
    ? request('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          user_telegram_id: payload.telegram_id,
          user_name: payload.user_name,
          service_id: payload.service_id,
          date: payload.date,
          time_slot: payload.time,
        }),
      }).then(mapBooking)
    : mock.createBooking(payload)

export const cancelBooking = (id) =>
  API_BASE
    ? request(`/bookings/${encodeURIComponent(id)}/cancel`, { method: 'POST' }).then(mapBooking)
    : mock.cancelBooking(id)

export const rescheduleBooking = (id, payload) =>
  API_BASE
    ? request(`/bookings/${encodeURIComponent(id)}/reschedule`, {
        method: 'POST',
        body: JSON.stringify({ date: payload.date, time_slot: payload.time }),
      }).then(mapBooking)
    : mock.rescheduleBooking(id, payload)

/* ------------------------------ AI assistant ------------------------------ */

export const askAssistant = (message) =>
  API_BASE
    ? request('/assistant/query', {
        method: 'POST',
        body: JSON.stringify({ message }),
      }).then(mapAssistantReply)
    : generateReply(message)

/* ---------------------------------- admin --------------------------------- */

export const fetchAdminMetrics = () =>
  API_BASE
    ? request('/admin/overview').then((data) => ({
        bookingsToday: data.total_bookings_today,
        revenueEstimate: data.estimated_revenue,
        activeClients: data.active_clients,
      }))
    : mock.fetchAdminMetrics()

export const fetchAdminSchedule = (date) =>
  API_BASE
    ? request(`/bookings?date=${encodeURIComponent(date)}`).then((rows) =>
        rows.map(mapBooking),
      )
    : mock.fetchAdminSchedule(date)

export const fetchAdminSlots = (date) =>
  API_BASE
    ? request(`/admin/slots?date=${encodeURIComponent(date)}`).then(mapAdminSlots)
    : mock.fetchAdminSlots(date)

export const setSlotEnabled = (slotId, enabled) =>
  API_BASE
    ? request(`/admin/slots/${encodeURIComponent(slotId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_available: enabled }),
      }).then((slot) => ({ id: slot.id, time: slot.time_slot, enabled: slot.is_available }))
    : mock.setSlotEnabled(slotId, enabled)

/* ------------------------------ admin: catalog ---------------------------- */

export const fetchAdminServices = () =>
  API_BASE ? request('/admin/services').then((rows) => rows.map(mapServiceAdmin)) : mock.fetchAdminServices()

function mapServiceAdmin(service) {
  return { ...mapService(service), isActive: service.is_active }
}

export const createAdminService = (payload) =>
  API_BASE
    ? request('/admin/services', {
        method: 'POST',
        body: JSON.stringify({
          title: payload.name,
          description: payload.description,
          price: payload.price,
          duration: payload.duration_min,
          icon_name: payload.icon,
        }),
      }).then(mapServiceAdmin)
    : mock.createAdminService(payload)

export const updateAdminService = (id, patch) =>
  API_BASE
    ? request(`/admin/services/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...(patch.name != null && { title: patch.name }),
          ...(patch.description != null && { description: patch.description }),
          ...(patch.price != null && { price: patch.price }),
          ...(patch.duration_min != null && { duration: patch.duration_min }),
          ...(patch.icon != null && { icon_name: patch.icon }),
          ...(patch.isActive != null && { is_active: patch.isActive }),
        }),
      }).then(mapServiceAdmin)
    : mock.updateAdminService(id, patch)

/** QR code PNG (Blob) for a service deep link; null when unavailable. */
export const fetchServiceQr = (id) =>
  API_BASE ? requestBlob(`/admin/services/${encodeURIComponent(id)}/qr`) : Promise.resolve(null)

/* ------------------------------ admin: schedule --------------------------- */

export const fetchPublicSchedule = () =>
  API_BASE ? request('/schedule') : mock.fetchPublicSchedule()

export const fetchAdminScheduleRules = () =>
  API_BASE ? request('/admin/schedule') : mock.fetchAdminScheduleRules()

export const updateAdminScheduleRules = (rules) =>
  API_BASE
    ? request('/admin/schedule', { method: 'PATCH', body: JSON.stringify(rules) })
    : mock.updateAdminScheduleRules(rules)

export const addAdminHoliday = (date, note) =>
  API_BASE
    ? request('/admin/holidays', { method: 'POST', body: JSON.stringify({ date, note: note || null }) })
    : mock.addAdminHoliday(date, note)

export const deleteAdminHoliday = (date) =>
  API_BASE
    ? request(`/admin/holidays/${encodeURIComponent(date)}`, { method: 'DELETE' })
    : mock.deleteAdminHoliday(date)

/* ------------------------------- admin: reviews --------------------------- */

export const fetchAdminReviews = () =>
  API_BASE ? request('/admin/reviews') : mock.fetchAdminReviews()

export const fetchAnalytics = () =>
  API_BASE
    ? request('/admin/analytics?days=7').then((data) => ({
        bookingsPerDay: data.bookings_per_day ?? [],
        topServices: data.top_services ?? [],
      }))
    : mock.fetchAnalytics()

export const downloadBookingsCsv = () =>
  API_BASE
    ? requestBlob('/admin/bookings.csv').then((blob) => {
        triggerBlobDownload(blob, 'pulse-bookings.csv')
      })
    : mock.downloadBookingsCsv()

/* --------------------------------- reviews -------------------------------- */

export const createReview = (bookingId, payload) =>
  API_BASE
    ? request(`/bookings/${encodeURIComponent(bookingId)}/review`, {
        method: 'POST',
        body: JSON.stringify({ rating: payload.rating, comment: payload.comment || null }),
      })
    : mock.createReview(bookingId, payload)

/* ------------------------------ waiting list ------------------------------ */

export const joinWaitlist = (date, identity) =>
  API_BASE
    ? request('/waitlist', {
        method: 'POST',
        body: JSON.stringify({
          date,
          ...(identity ? { user_telegram_id: identity.id, user_name: identity.name } : {}),
        }),
      })
    : mock.joinWaitlist(date, identity)

export const fetchWaitlist = (telegramId) =>
  API_BASE
    ? request(`/waitlist?user_id=${encodeURIComponent(telegramId)}`)
    : mock.fetchWaitlist(telegramId)

export const deleteWaitlistEntry = (entryId) =>
  API_BASE
    ? request(`/waitlist/${encodeURIComponent(entryId)}`, { method: 'DELETE' })
    : mock.deleteWaitlistEntry(entryId)

/* --------------------------- public service reviews ----------------------- */

export const fetchServiceReviews = (serviceId) =>
  API_BASE
    ? request(`/services/${encodeURIComponent(serviceId)}/reviews`)
    : mock.fetchServiceReviews(serviceId)
