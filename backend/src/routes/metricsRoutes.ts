/**
 * @fileoverview This file defines the Express routes for handling client-side metrics.
 * It includes an endpoint for clients to submit performance and usage metrics,
 * and an admin-only endpoint to retrieve a summary of these metrics.
 * @module routes/metricsRoutes
 */
import express from 'express'
import { requireAdmin } from '../middleware/adminAuth.js'
import { authenticateToken } from '../middleware/auth.js'
import { getClientMetricsSummary, insertClientMetrics } from '../services/clientMetricsService.js'

const router = express.Router()

/**
 * Route for clients to submit metrics and statistics.
 * @name POST /metrics/client
 * @function
 * @memberof module:routes/metricsRoutes
 * @param {import('express').Request} req - The Express request object, containing metrics, stats, and an optional gameId in the body.
 * @param {import('express').Response} res - The Express response object, indicating success or failure.
 * @returns {Promise<import('express').Response>}
 */
router.post('/client', authenticateToken, async (req, res) => {
  try {
    const { metrics, stats, gameId } = req.body ?? {}
    if (!metrics || typeof metrics !== 'object') {
      return res.status(400).json({ error: 'Missing metrics payload' })
    }
    if (!stats || typeof stats !== 'object') {
      return res.status(400).json({ error: 'Missing stats payload' })
    }
    const sessionId = (metrics as { sessionId?: unknown }).sessionId
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'Missing sessionId' })
    }

    const userId = req.user?.id ?? null
    await insertClientMetrics({
      userId,
      sessionId,
      gameId: typeof gameId === 'string' ? gameId : undefined,
      metrics: metrics as Record<string, unknown>,
      stats: stats as Record<string, unknown>,
    })

    return res.json({ ok: true })
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to store metrics' })
  }
})

/**
 * Route for admins to retrieve a summary of client metrics.
 * @name GET /metrics/client/summary
 * @function
 * @memberof module:routes/metricsRoutes
 * @param {import('express').Request} _req - The Express request object (unused).
 * @param {import('express').Response} res - The Express response object, containing the metrics summary.
 * @returns {Promise<import('express').Response>}
 */
router.get('/client/summary', authenticateToken, requireAdmin, async (_req, res) => {
  try {
    const summary = await getClientMetricsSummary(24)
    return res.json({ ok: true, data: summary })
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load metrics summary' })
  }
})

export default router
