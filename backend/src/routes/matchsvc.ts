import { Router } from 'express'
import { logger } from '../utils/logger.js'
import { checkRedisHealth } from '../config/redis.js'
import { isMatchSvcSubscriberActive } from '../services/matchSvcIntegration.js'
import { MatchSvcClient } from '@conquestk/match-client'

const router = Router()

router.get('/status', async (_req, res) => {
  const baseUrl = process.env.MATCHSVC_URL || 'http://localhost:8085'
  const hmac = process.env.MATCHSVC_HMAC_SECRET

  // 1) Health check
  let health = 'unknown'
  let healthCode: number | undefined
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2500)
    const resp = await fetch(`${baseUrl}/healthz`, { method: 'GET', signal: controller.signal })
    clearTimeout(timeout)
    health = resp.ok ? 'ok' : `fail`
    healthCode = resp.status
  } catch (e) {
    health = 'fail'
    healthCode = 0
    logger.debug('matchsvc health check failed', { error: (e as Error)?.message })
  }

  // 2) Redis health
  const redisHealth = await checkRedisHealth().catch(() => ({ healthy: false, message: 'error' }))

  // 3) Signature/auth test (no side effect): POST /v1/queue/dequeue with dummy ticket
  let authTest: 'ok' | 'unauthorized' | 'skipped' | 'error' = 'skipped'
  let authStatus: number | undefined
  if (hmac) {
    try {
      const client = new MatchSvcClient({ baseUrl, hmacSecret: hmac })
      const r = await client.dequeue('status-check')
      // Any 2xx means auth accepted; if not throwing, we got 200 OK {status: 'gone'}
      authTest = 'ok'
      authStatus = 200
    } catch (e) {
      const msg = String((e as Error).message || '')
      if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) authTest = 'unauthorized'
      else authTest = 'error'
      const m = msg.match(/\s(\d{3})$/)
      authStatus = m ? Number.parseInt(m[1]!, 10) : undefined
    }
  }

  const payload = {
    ok: health === 'ok' && redisHealth.healthy && (authTest === 'ok' || authTest === 'skipped'),
    service: { url: baseUrl, health, statusCode: healthCode },
    auth: { configured: Boolean(hmac), test: authTest, statusCode: authStatus },
    redis: redisHealth,
    subscriber: { active: isMatchSvcSubscriberActive() },
    ts: new Date().toISOString(),
  }

  res.json(payload)
})

export default router

