import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bot, X, SendHorizonal } from 'lucide-react'
import { askAssistant, createBooking } from '../../lib/api'
import { getUser, haptic, hapticNotify, showBackButton, hideBackButton } from '../../lib/telegram'
import { useMe } from '../../lib/queries'
import { trapTabKey } from '../../lib/a11y'
import { formatLongDate } from '../../lib/date'
import { SERVICES } from '../../data/catalog'
import ChatBubble from './ChatBubble'
import PromptChips from './PromptChips'

const GREETING = `Hi! I'm the Pulse assistant. I can check availability, quote prices, and book a session for you in one tap. What do you need?`

const PROMPTS = [
  'Find a slot for General Consultation this Friday afternoon',
  'Earliest availability for a Check-up?',
  'Diagnostics tomorrow morning?',
  'What are your prices?',
]

const INPUT_MAX_LENGTH = 500

function resolveServiceName(slot) {
  return (
    slot.serviceTitle ??
    SERVICES.find((service) => service.id === slot.serviceId)?.name ??
    'Pulse session'
  )
}

/** Full-screen AI booking assistant chat, rendered above everything else. */
export default function AssistantOverlay({ onClose }) {
  const user = getUser()
  const me = useMe().data
  const nextId = useRef(2)
  const listRef = useRef(null)
  const containerRef = useRef(null)
  const [messages, setMessages] = useState([
    { id: 1, role: 'bot', text: GREETING, suggestions: [] },
  ])
  const [typing, setTyping] = useState(false)
  const [input, setInput] = useState('')

  // Native Telegram back button closes the chat.
  useEffect(() => {
    showBackButton(onClose)
    return () => hideBackButton()
  }, [onClose])

  // Keep the newest message in view.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, typing])

  function pushBot(text, suggestions = []) {
    setMessages((current) => [
      ...current,
      { id: nextId.current++, role: 'bot', text, suggestions },
    ])
  }

  async function send(rawText) {
    const text = rawText.trim()
    if (!text || typing) return
    haptic('light')
    setInput('')
    setMessages((current) => [...current, { id: nextId.current++, role: 'user', text }])
    setTyping(true)
    try {
      const reply = await askAssistant(text)
      // Suggestions arrive normalized from api.js/mock: {date, time, serviceId, serviceTitle}
      pushBot(reply.text, (reply.suggestions ?? []).map((slot) => ({ ...slot, booked: false })))
    } catch (error) {
      pushBot(
        error?.detail ??
          'Something went wrong on my side — please try again in a moment.',
      )
      hapticNotify('error')
    } finally {
      setTyping(false)
    }
  }

  async function bookSlot(messageId, index) {
    const message = messages.find((item) => item.id === messageId)
    const slot = message?.suggestions?.[index]
    if (!slot || slot.booked) return
    haptic('medium')
    try {
      await createBooking({
        telegram_id: user?.id ?? me?.id,
        user_name:
          user
            ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Guest'
            : (me?.name ?? 'Guest'),
        service_id: slot.serviceId,
        date: slot.date,
        time: slot.time,
      })
      hapticNotify('success')
      setMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? {
                ...item,
                suggestions: item.suggestions.map((s, i) =>
                  i === index ? { ...s, booked: true } : s,
                ),
              }
            : item,
        ),
      )
      pushBot(
        `Done! ${resolveServiceName(slot)} is booked for ${formatLongDate(slot.date)} at ${slot.time}. You can review it under Profile → My Bookings.`,
      )
    } catch (error) {
      hapticNotify('error')
      pushBot(
        error?.detail ??
          'I could not complete the booking — that slot may have just been taken. Try another one.',
      )
    }
  }

  return createPortal(
    <div
      ref={containerRef}
      onKeyDown={(event) => trapTabKey(event, containerRef.current)}
      className="fixed inset-0 z-50 flex flex-col bg-ink"
      role="dialog"
      aria-modal="true"
      aria-label="AI assistant"
    >
      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-24 -top-32 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center gap-3 border-b border-white/[0.06] px-4 pb-3 pt-[max(env(safe-area-inset-top),14px)]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close assistant"
          className="glass-card flex h-10 w-10 items-center justify-center text-mist transition-all active:scale-95"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex flex-1 items-center gap-3">
          <span className="accent-gradient flex h-10 w-10 items-center justify-center rounded-full text-ink shadow-glow">
            <Bot className="h-5 w-5" strokeWidth={2} />
          </span>
          <div>
            <h1 className="text-sm font-bold text-mist">Pulse Assistant</h1>
            <p className="flex items-center gap-1.5 text-[11px] text-mist-dim">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Online · books instantly
            </p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div ref={listRef} className="relative z-10 flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {messages.map((message) => (
          <ChatBubble key={message.id} message={message} onBookSlot={bookSlot} />
        ))}
        {typing && (
          <div className="flex justify-start">
            <div className="glass-card flex items-center gap-1.5 rounded-2xl rounded-bl-md px-4 py-3">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}
      </div>

      {/* Prompt chips + input */}
      <div className="relative z-10 border-t border-white/[0.06] pt-3">
        <PromptChips prompts={PROMPTS} disabled={typing} onPick={send} />
        <form
          className="flex items-center gap-2 px-4 pb-safe pt-1"
          onSubmit={(event) => {
            event.preventDefault()
            send(input)
          }}
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              // Some webviews skip implicit form submission on Enter.
              if (event.key === 'Enter') {
                event.preventDefault()
                send(input)
              }
            }}
            maxLength={INPUT_MAX_LENGTH}
            placeholder="Ask the assistant…"
            aria-label="Message the assistant"
            className="glass-card h-11 flex-1 bg-transparent px-4 text-sm text-mist outline-none placeholder:text-mist-faint"
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={!input.trim() || typing}
            className={`accent-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-ink shadow-glow transition-all active:scale-95 ${
              !input.trim() || typing ? 'opacity-40' : ''
            }`}
          >
            <SendHorizonal className="h-5 w-5" strokeWidth={2} />
          </button>
        </form>
      </div>
    </div>,
    document.body,
  )
}
