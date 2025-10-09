type RatingChangePayload = {
  change: number
  oldRating?: number
  newRating?: number
  oldRank?: string
  newRank?: string
}

type Listener = (payload: RatingChangePayload | null) => void

class RatingChangeModalService {
  private static instance: RatingChangeModalService
  private listeners = new Set<Listener>()

  static getInstance(): RatingChangeModalService {
    if (!RatingChangeModalService.instance) {
      RatingChangeModalService.instance = new RatingChangeModalService()
    }
    return RatingChangeModalService.instance
  }

  open(payload: RatingChangePayload) {
    for (const l of this.listeners) l(payload)
  }

  close() {
    for (const l of this.listeners) l(null)
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export const ratingChangeModalService = RatingChangeModalService.getInstance()
export type { RatingChangePayload }
