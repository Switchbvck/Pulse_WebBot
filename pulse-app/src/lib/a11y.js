// Minimal keyboard focus trap for overlays (modals, full-screen chats).

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Cycle Tab focus within the container element. Attach to onKeyDown. */
export function trapTabKey(event, container) {
  if (event.key !== 'Tab' || !container) return
  const focusables = Array.from(container.querySelectorAll(FOCUSABLE)).filter(
    (element) => element.offsetParent !== null,
  )
  if (focusables.length === 0) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
