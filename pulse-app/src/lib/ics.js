// "Add to calendar" (.ics) generation for appointments.
// Times are written as floating local times (no TZ suffix), which keeps the
// clinic-local semantics consistent across the app.

function icsEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,')
}

function formatStamp(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `T${pad(date.getHours())}${pad(date.getMinutes())}00`
  )
}

/** Trigger a browser download of an .ics file for one appointment. */
export function downloadIcsAppointment({ title, date, time, durationMin = 60 }) {
  const start = new Date(`${date}T${time}:00`)
  const end = new Date(start.getTime() + durationMin * 60_000)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pulse//Booking//EN',
    'BEGIN:VEVENT',
    `UID:pulse-${date}-${time}-${Date.now()}@pulse.app`,
    `DTSTART:${formatStamp(start)}`,
    `DTEND:${formatStamp(end)}`,
    `SUMMARY:${icsEscape(title)} — Pulse`,
    'DESCRIPTION:Booked via the Pulse Mini App.',
    'LOCATION:Pulse',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `pulse-${date}-${time}.ics`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
