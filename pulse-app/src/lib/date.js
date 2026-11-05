// Date helpers used by the booking wizard and profile screens.
// All date-only values travel as ISO strings "YYYY-MM-DD" in local time.

/** Format a Date as a local "YYYY-MM-DD" string. */
export function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Next `count` days starting today, with midnight-normalized times. */
export function upcomingDays(count = 14) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(today)
    day.setDate(day.getDate() + i)
    return day
  })
}

/** True when the ISO date is today. */
export function isToday(iso) {
  return iso === toISODate(new Date())
}

/** Full Date from an ISO date ("YYYY-MM-DD") and "HH:MM" time. */
export function appointmentDate(iso, time) {
  return new Date(`${iso}T${time}:00`)
}

/** "Fri, Nov 7" style label for an ISO date. */
export function formatLongDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/** { d, h, m, s, total } remaining between now and the target Date. */
export function countdownParts(target, now = new Date()) {
  const total = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000))
  return {
    d: Math.floor(total / 86400),
    h: Math.floor((total % 86400) / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
    total,
  }
}

/** Two-digit zero padding for timer blocks. */
export function pad2(value) {
  return String(value).padStart(2, '0')
}

/** Greeting word for the current time of day. */
export function dayGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}
