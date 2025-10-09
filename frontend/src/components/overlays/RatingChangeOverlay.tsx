import type React from 'react'
import { useEffect, useState } from 'react'
import RatingChangeAnimation from '@/components/RatingChangeAnimation'
import {
  type RatingChangePayload,
  ratingChangeModalService,
} from '@/services/ratingChangeModalService'

// Lightweight global overlay that shows the rating/CP change animation
// Opened via ratingChangeModalService from anywhere (e.g., notification click)
const RatingChangeOverlay: React.FC = () => {
  const [active, setActive] = useState<RatingChangePayload | null>(null)

  useEffect(() => {
    const unsub = ratingChangeModalService.subscribe((payload) => setActive(payload))
    return unsub
  }, [])

  if (!active) return null

  return (
    <div className="fixed inset-0 z-[120] pointer-events-none" aria-live="polite">
      <RatingChangeAnimation
        change={active.change}
        onComplete={() => {
          // Let the animation fade then clear
          setActive(null)
        }}
      />
    </div>
  )
}

export default RatingChangeOverlay
