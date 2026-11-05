import { useAdminReviews } from '../../lib/queries'
import GlassCard from '../GlassCard'
import Skeleton from '../Skeleton'
import StarRating from '../StarRating'

/** Admin section: latest post-visit reviews. */
export default function ReviewsAdmin() {
  const reviewsQuery = useAdminReviews()
  const reviews = reviewsQuery.data
  const error = reviewsQuery.isError

  return (
    <div>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-mist-dim">
        Latest reviews
      </h2>
      {error ? (
        <GlassCard className="p-4 text-center text-xs text-mist-dim">Could not load reviews.</GlassCard>
      ) : reviews === undefined ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-16 rounded-card" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <GlassCard className="p-4 text-center text-xs text-mist-dim">
          No reviews yet — they appear after rated visits.
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-2">
          {reviews.map((review) => (
            <GlassCard key={review.id} className="!rounded-2xl p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-xs font-semibold text-mist">
                  {review.user_name ?? 'Guest'}
                  <span className="font-normal text-mist-dim"> · {review.service_title ?? 'Pulse'}</span>
                </p>
                <StarRating value={review.rating} size="sm" />
              </div>
              {review.comment && (
                <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-mist-dim">
                  “{review.comment}”
                </p>
              )}
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  )
}
