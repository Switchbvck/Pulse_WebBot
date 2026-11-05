// Rule-based "AI" booking assistant (demo brain). In live mode the same
// reply shape is expected from POST /assistant/query.

import { SERVICES } from '../data/catalog'
import { formatLongDate, toISODate, upcomingDays } from './date'
import { fetchSlots } from './mockApi'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const SERVICE_KEYWORDS = [
  { id: 'svc-consult', tokens: ['consultation', 'consult'] },
  { id: 'svc-diagnostics', tokens: ['diagnostics', 'diagnostic', 'imaging', 'lab'] },
  { id: 'svc-specialist', tokens: ['specialist'] },
  { id: 'svc-therapy', tokens: ['therapy'] },
  { id: 'svc-checkup', tokens: ['check-up', 'checkup', 'check up', 'screening'] },
  { id: 'svc-telemedicine', tokens: ['telemedicine', 'video visit', 'online visit'] },
]

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function todayISO() {
  return toISODate(new Date())
}

function tomorrowISO() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return toISODate(d)
}

function daypartOf(time) {
  const hour = Number(time.slice(0, 2))
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

function serviceName(serviceId) {
  return SERVICES.find((service) => service.id === serviceId)?.name ?? 'your session'
}

function dateLabelFor(iso) {
  if (iso === todayISO()) return 'today'
  if (iso === tomorrowISO()) return 'tomorrow'
  return formatLongDate(iso)
}

/** Extract { service, dateISO, dateLabel, daypart, earliest, wantsServices } from text. */
function parseQuery(text) {
  const lowered = text.toLowerCase()

  const serviceId =
    SERVICE_KEYWORDS.find((entry) => entry.tokens.some((token) => lowered.includes(token)))?.id ??
    null

  const days = upcomingDays(14)
  let dateISO = null
  if (/\btoday\b/.test(lowered)) {
    dateISO = todayISO()
  } else if (/\btomorrow\b/.test(lowered)) {
    dateISO = tomorrowISO()
  } else if (/weekend/.test(lowered)) {
    const weekendDay = days.find((day) => day.getDay() === 6 || day.getDay() === 0)
    if (weekendDay) dateISO = toISODate(weekendDay)
  } else {
    const weekday = WEEKDAYS.find((name) => lowered.includes(name))
    if (weekday) {
      const match = days.find((day) => WEEKDAYS[day.getDay()] === weekday)
      if (match) dateISO = toISODate(match)
    }
  }

  const daypart = /morning/.test(lowered)
    ? 'morning'
    : /afternoon/.test(lowered)
      ? 'afternoon'
      : /evening|night/.test(lowered)
        ? 'evening'
        : null

  return {
    serviceId,
    dateISO,
    dateLabel: dateISO ? dateLabelFor(dateISO) : null,
    daypart,
    earliest: /earliest|soonest|asap|next available|first available/.test(lowered),
    wantsServices: /what (services|do you offer)|price|prices|how much|cost/.test(lowered),
  }
}

function toSuggestions(slots, serviceId) {
  const title = serviceName(serviceId)
  return slots
    .slice(0, 3)
    .map((time) => ({ date: null, time, serviceId, serviceTitle: title, booked: false }))
}

/** Generate the assistant reply for a user message. */
export async function generateReply(text) {
  await delay(800 + Math.random() * 600)
  const query = parseQuery(text)

  // Price list / service overview
  if (query.wantsServices && !query.serviceId) {
    const lines = SERVICES.map(
      (service) => `• ${service.name} — $${service.price} (${service.duration_min} min)`,
    ).join('\n')
    return {
      text: `Here is the current Pulse price list:\n${lines}\n\nTell me a service and a day, and I will find open slots.`,
      suggestions: [],
    }
  }

  // "Earliest availability for X?"
  if (query.earliest && query.serviceId) {
    for (const day of upcomingDays(14)) {
      const iso = toISODate(day)

      const slots = await fetchSlots(iso, query.serviceId)
      if (slots.length > 0) {
        return {
          text: `The earliest opening for ${serviceName(query.serviceId)} is ${slots[0]} ${dateLabelFor(iso)}. These are also open:`,
          suggestions: toSuggestions(slots, query.serviceId).map((slot) => ({ ...slot, date: iso })),
        }
      }
    }
    return {
      text: `I could not find any open slots for ${serviceName(query.serviceId)} in the next two weeks.`,
      suggestions: [],
    }
  }
  if (query.earliest) {
    return {
      text: 'Which service should I look for? I can check Consultation, Diagnostics, Specialist Care, Therapy, Check-up, or Telemedicine.',
      suggestions: [],
    }
  }

  // Slot search for a detected service
  if (query.serviceId) {
    const targetDate = query.dateISO ?? todayISO()

    let slots = await fetchSlots(targetDate, query.serviceId)
    if (query.daypart) slots = slots.filter((time) => daypartOf(time) === query.daypart)

    if (slots.length > 0) {
      return {
        text: `I found ${slots.length} open slot${slots.length > 1 ? 's' : ''} for ${serviceName(query.serviceId)} ${query.dateLabel ?? 'today'}${query.daypart ? ` in the ${query.daypart}` : ''}. Tap one to book instantly:`,
        suggestions: toSuggestions(slots, query.serviceId).map((slot) => ({
          ...slot,
          date: targetDate,
        })),
      }
    }

    // Nothing on the requested day — offer the closest day that has openings.
    for (const day of upcomingDays(8).slice(1)) {
      const iso = toISODate(day)

      let nearby = await fetchSlots(iso, query.serviceId)
      if (query.daypart) nearby = nearby.filter((time) => daypartOf(time) === query.daypart)
      if (nearby.length > 0) {
        return {
          text: `No openings for ${serviceName(query.serviceId)} ${query.dateLabel ?? 'today'}${query.daypart ? ` in the ${query.daypart}` : ''} — but it is free on ${dateLabelFor(iso)}:`,
          suggestions: toSuggestions(nearby, query.serviceId).map((slot) => ({
            ...slot,
            date: iso,
          })),
        }
      }
    }
    return {
      text: `Unfortunately ${serviceName(query.serviceId)} is fully booked for the next week. Try a different service or time of day.`,
      suggestions: [],
    }
  }

  // Date/day-part without a service
  if (query.dateISO || query.daypart) {
    return {
      text: `Got it — ${query.dateLabel ?? 'any day'}${query.daypart ? `, ${query.daypart}` : ''}. Which service should I book?`,
      suggestions: [],
    }
  }

  return {
    text: 'I can check availability, quote prices, and book sessions in one tap. Try: "Find a slot for General Consultation this Friday afternoon".',
    suggestions: [],
  }
}
