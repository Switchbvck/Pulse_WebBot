// Thin, defensive wrapper around the Telegram WebApp SDK: outside Telegram
// every helper degrades gracefully so the UI works in a plain browser.

const raw = typeof window !== 'undefined' ? window.Telegram?.WebApp : null

/** Raw Telegram WebApp instance, or null when running in a browser. */
export const tg = raw ?? null

/** True inside a Telegram client: the SDK injects itself in ANY browser, so
 * platform ("unknown" outside Telegram) is the reliable signal. */
export const isTelegram = Boolean(
  raw && raw.platform && raw.platform !== "unknown",
)

// Fallback identity so the app is demoable outside Telegram.
const DEV_USER = {
  id: 771234567,
  first_name: 'Alex',
  last_name: 'Morgan',
  username: 'alexm',
  photo_url: '',
}

/**
 * Telegram user (initDataUnsafe.user).
 * Outside Telegram: demo profile. Inside: the real identity, or null when
 * Telegram handed none over — callers must treat null as "unavailable".
 */
export function getUser() {
  const tgUser = raw?.initDataUnsafe?.user
  if (tgUser) return tgUser
  if (!isTelegram) return DEV_USER // browser — demo identity
  return null
}

/** Signed login payload to be forwarded to the backend for validation. */
export function getInitData() {
  return raw?.initData ?? ''
}

/**
 * Deep-link start parameter: t.me/<bot>?startapp=<serviceId> passes it through
 * initDataUnsafe.start_param; outside Telegram we accept ?service=<id>.
 */
export function getStartParam() {
  const fromUrl =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('service')
      : null
  return raw?.initDataUnsafe?.start_param ?? fromUrl ?? null
}

const BRAND_BG = '#0F1115'

/** Call once on mount: expand to full height and sync the chrome colors. */
export function initTelegram() {
  if (!raw) return
  raw.ready()
  raw.expand()
  try {
    raw.setHeaderColor(BRAND_BG)
    raw.setBackgroundColor(BRAND_BG)
  } catch {
    // Older clients only accept theme constants — brand chrome stays our CSS.
  }
  try {
    raw.disableVerticalSwipes?.()
  } catch {
    // Feature is client-version dependent; safe to ignore.
  }
}

/** Light impact feedback for taps and selections. */
export function haptic(style = 'light') {
  try {
    raw?.HapticFeedback?.impactOccurred(style)
  } catch {
    // Haptics are unavailable outside Telegram.
  }
}

/** Notification feedback: 'success' | 'warning' | 'error'. */
export function hapticNotify(type = 'success') {
  try {
    raw?.HapticFeedback?.notificationOccurred(type)
  } catch {
    // Haptics are unavailable outside Telegram.
  }
}

let backHandler = null

/** Show the native Telegram back button bound to `handler`. */
export function showBackButton(handler) {
  if (!raw?.BackButton) return
  if (backHandler) raw.BackButton.offClick(backHandler)
  backHandler = handler
  raw.BackButton.onClick(handler)
  raw.BackButton.show()
}

/** Detach and hide the native back button. */
export function hideBackButton() {
  if (!raw?.BackButton) return
  if (backHandler) raw.BackButton.offClick(backHandler)
  backHandler = null
  raw.BackButton.hide()
}
