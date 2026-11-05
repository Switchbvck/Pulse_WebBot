import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { showBackButton, hideBackButton } from '../lib/telegram'
import { trapTabKey } from '../lib/a11y'

/**
 * Bottom-sheet modal with a dimmed backdrop.
 * Rendered through a portal so it paints above the fixed bottom navigation,
 * with focus trapping and native back-button support.
 */
export default function Modal({ open, onClose, children }) {
  const containerRef = useRef(null)

  // Native Telegram back button dismisses the sheet.
  useEffect(() => {
    if (!open) return undefined
    showBackButton(onClose)
    return () => hideBackButton()
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={containerRef}
        onKeyDown={(event) => trapTabKey(event, containerRef.current)}
        className="relative z-10 mx-auto w-full max-w-md animate-slide-up rounded-t-3xl border-t border-white/10 bg-ink-soft p-6 pb-safe"
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
