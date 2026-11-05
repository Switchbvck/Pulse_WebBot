import { Home, CalendarPlus, User, ShieldCheck } from 'lucide-react'
import { haptic } from '../lib/telegram'

const ITEMS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'book', label: 'Book', icon: CalendarPlus },
  { id: 'profile', label: 'Profile', icon: User },
]

/**
 * Fixed glass tab bar pinned to the bottom of the viewport.
 * `showAdmin` adds the restricted Admin tab (role-gated by the caller).
 */
export default function BottomNav({ active, onChange, showAdmin = false }) {
  const items = showAdmin
    ? [...ITEMS, { id: 'admin', label: 'Admin', icon: ShieldCheck }]
    : ITEMS
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-ink/80 backdrop-blur-2xl">
      <div
        className={`mx-auto grid max-w-md ${showAdmin ? 'grid-cols-4' : 'grid-cols-3'} px-6 pt-2 pb-safe`}
      >
        {items.map(({ id, label, icon: Icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                haptic('light')
                onChange(id)
              }}
              className="group flex flex-col items-center gap-1 outline-none"
              aria-current={isActive ? 'page' : undefined}
            >
              <span
                className={`flex h-7 w-14 items-center justify-center rounded-full transition-colors duration-200 ${
                  isActive ? 'bg-accent/10' : 'bg-transparent'
                }`}
              >
                <Icon
                  className={`h-5 w-5 transition-colors duration-200 ${
                    isActive ? 'text-accent' : 'text-mist-faint group-active:text-mist-dim'
                  }`}
                  strokeWidth={isActive ? 2.2 : 1.8}
                />
              </span>
              <span
                className={`text-[11px] font-medium transition-colors duration-200 ${
                  isActive ? 'text-accent' : 'text-mist-faint'
                }`}
              >
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
