/** Accessible toggle switch used for slot management. */
export default function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
        checked ? 'accent-gradient' : 'bg-white/10'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}
