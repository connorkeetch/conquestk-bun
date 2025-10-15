import express, { type Request, type Response } from 'express'
import { logger } from '../utils/logger.js'

const router = express.Router()

// Public endpoint to accept minimal web-vitals beacons (no auth, rate-limited globally)
router.post('/vitals', (req: Request, res: Response) => {
  try {
    const { metric, value, url, tag, id, classHint, size, theme, dpr, ts } = req.body ?? {}

    // Basic validation and normalization
    const m = typeof metric === 'string' ? metric.toUpperCase() : 'UNKNOWN'
    const v = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null
    const path = typeof url === 'string' ? url : undefined
    const safeTag = typeof tag === 'string' ? tag.toUpperCase() : undefined

    // Log to server logs; do not persist
    logger.info('web-vitals', {
      metric: m,
      value: v,
      path,
      tag: safeTag,
      id: typeof id === 'string' ? id.slice(0, 48) : undefined,
      classHint: Array.isArray(classHint) ? classHint.slice(0, 3) : undefined,
      size: typeof size === 'number' ? Math.round(size) : undefined,
      theme: typeof theme === 'string' ? theme : undefined,
      dpr: typeof dpr === 'number' ? dpr : undefined,
      ts: typeof ts === 'number' ? ts : Date.now(),
    })

    res.json({ success: true })
  } catch (error) {
    logger.warn('web-vitals: failed to process payload', { error: (error as Error)?.message })
    res.status(200).json({ success: true })
  }
})

export default router

