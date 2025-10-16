import express from 'express'
import { requireAdmin } from '../middleware/adminAuth.js'
import { authenticateToken } from '../middleware/auth.js'
import { getClientMetricsSummary, insertClientMetrics } from '../services/clientMetricsService.js'

const router = express.Router()

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

router.get('/client/summary', authenticateToken, requireAdmin, async (_req, res) => {
  try {
    const summary = await getClientMetricsSummary(24)
    return res.json({ ok: true, data: summary })
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load metrics summary' })
  }
})

export default router
