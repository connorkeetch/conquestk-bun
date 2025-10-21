import express from 'express'
import { query } from '../config/database.js'
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

router.get('/client/summary', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const hoursRaw = (req.query?.hours as string | undefined) ?? '24'
    const hours = Number.isFinite(Number(hoursRaw)) && Number(hoursRaw) > 0 ? Number(hoursRaw) : 24
    const clamped = Math.max(1, Math.min(24 * 30, Math.floor(hours))) // 1 hour to 30 days
    const summary = await getClientMetricsSummary(clamped)
    return res.json({ ok: true, data: summary })
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load metrics summary' })
  }
})

// Admin: reset persisted client metrics snapshots (dangerous; dev-phase convenience)
router.post('/client/reset', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { scope, hours } = (req.body ?? {}) as {
      scope?: 'all' | 'older_than_hours'
      hours?: number
    }
    let deleted = 0
    if (scope === 'older_than_hours' && typeof hours === 'number' && hours > 0) {
      const hrs = Math.floor(hours)
      const result = await query(
        `DELETE FROM client_metrics WHERE created_at < NOW() - ($1::text || ' hours')::interval`,
        [String(hrs)],
      )
      deleted = result.rowCount ?? 0
      return res.json({ ok: true, scope: 'older_than_hours', hours: hrs, deleted })
    }
    const result = await query(`DELETE FROM client_metrics`)
    deleted = result.rowCount ?? 0
    return res.json({ ok: true, scope: 'all', deleted })
  } catch (_error) {
    return res.status(500).json({ ok: false, error: 'Failed to reset client metrics' })
  }
})

export default router
