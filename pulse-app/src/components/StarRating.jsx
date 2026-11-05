import { Star } from 'lucide-react'

/** Star rating: display-only, or interactive when `onChange` is provided. */
export default function StarRating({ value = 0, onChange, size = 'md' }) {
  const dimension = size === 'lg' ? 'h-7 w-7' : size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'
  const stars = [1, 2, 3, 4, 5]
  return (
    <div
      className="flex items-center gap-0.5"
      role={onChange ? 'radiogroup' : 'img'}
      aria-label={`Rating: ${value} of 5`}
    >
      {stars.map((star) => {
        const filled = star <= value
        const starNode = (
          <Star
            className={`${dimension} ${filled ? 'fill-amber-400 text-amber-400' : 'text-mist-faint'}`}
            strokeWidth={1.8}
          />
        )
        if (!onChange) return <span key={star}>{starNode}</span>
        return (
          <button
            key={star}
            type="button"
            aria-label={`Rate ${star} of 5`}
            aria-checked={value === star}
            role="radio"
            onClick={() => onChange(star)}
            className="transition-transform active:scale-90"
          >
            {starNode}
          </button>
        )
      })}
    </div>
  )
}
