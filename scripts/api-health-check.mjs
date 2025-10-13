#!/usr/bin/env node
'use strict'

/**
 * API Health/Status Aggregator
 * - Hits core health/metrics endpoints (public + authenticated) and prints a summary.
 * - Saves a full JSON report to scripts/output/health-report-<timestamp>.json
 *
 * Usage examples:
 *  node scripts/api-health-check.mjs --base https://conquestk.com --token <JWT>
 *  node scripts/api-health-check.mjs --base https://dev.conquestk.com --login admin@example.com:password
 *  BASE_URL=http://localhost:5001 TOKEN=... node scripts/api-health-check.mjs
 *
 * Flags:
 *  --base <url>             Base URL (default: http://localhost:5001)
 *  --token <jwt>            Bearer token
 *  --login user:pass        Perform login to obtain JWT (identifier/email + password)
 *  --timeout <ms>           Per-request timeout (default: 6000)
 *  --include-debug          Include /debug endpoints (default: false)
 *  --include-benchmark      Include benchmark status endpoint (default: false)
 *  --output <path>          Output JSON path (default: scripts/output/health-report-<ts>.json)
 */

const { mkdir, writeFile } = await import('node:fs/promises')
const path = await import('node:path')

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (['include-debug', 'include-benchmark'].includes(key)) {
      out[key] = true
      continue
    }
    if (next && !next.startsWith('--')) {
      out[key] = next
      i += 1
    } else {
      out[key] = true
    }
  }
  return out
}

const argv = parseArgs(process.argv.slice(2))
const BASE_URL = (argv.base || process.env.BASE_URL || 'http://localhost:5001').replace(/\/$/, '')
const TIMEOUT = Number.parseInt(String(argv.timeout ?? process.env.TIMEOUT ?? '6000'), 10) || 6000
const LOGIN = argv.login || process.env.LOGIN || ''
let TOKEN = argv.token || process.env.TOKEN || ''
const INCLUDE_DEBUG = Boolean(argv['include-debug'] || process.env.INCLUDE_DEBUG)
const INCLUDE_BENCH = Boolean(argv['include-benchmark'] || process.env.INCLUDE_BENCH)

const OUTPUT_DIR = path.join('scripts', 'output')
const TS = new Date().toISOString().replace(/[:.]/g, '')
const DEFAULT_OUTPUT = path.join(OUTPUT_DIR, `health-report-${TS}.json`)
const OUTPUT_PATH = argv.output || process.env.OUTPUT || DEFAULT_OUTPUT

function hr(ms) {
  return `${ms.toFixed(0)}ms`
}

function withTimeout(promise, ms, label) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  return {
    controller,
    exec: (async () => {
      try {
        const res = await promise(controller.signal)
        clearTimeout(id)
        return res
      } catch (err) {
        clearTimeout(id)
        throw new Error(`${label} timed out after ${ms}ms or failed: ${String(err && err.message ? err.message : err)}`)
      }
    })(),
  }
}

async function loginIfRequested() {
  if (TOKEN) return { token: TOKEN, from: 'env' }
  if (!LOGIN) return null
  const [identifier, password] = String(LOGIN).split(':')
  if (!identifier || !password) {
    throw new Error('Invalid --login format. Expected identifier:password')
  }
  const url = `${BASE_URL}/api/auth/login`
  const body = { identifier, password }
  const t0 = Date.now()
  const { exec } = withTimeout(async (signal) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    return r
  }, TIMEOUT, 'login')
  const res = await exec
  const dt = Date.now() - t0
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Login failed (${res.status}) in ${hr(dt)}: ${txt}`)
  }
  const json = await res.json().catch(() => ({}))
  if (!json || typeof json.token !== 'string' || !json.token) {
    throw new Error('Login succeeded but token missing in response')
  }
  TOKEN = json.token
  return { token: TOKEN, from: 'login', durationMs: dt }
}

function buildEndpoints() {
  /** @type {{name:string, path:string, method?:string, auth?:boolean, category:string}[]} */
  const endpoints = []

  // Core/public
  endpoints.push(
    { name: 'api-health', path: '/api/health', category: 'core' },
    { name: 'health', path: '/health', category: 'core' },
    { name: 'queues-ping', path: '/api/queues/ping', category: 'queues' },
    { name: 'odds-status', path: '/api/odds/status', category: 'odds' },
    { name: 'matchsvc-status', path: '/api/matchsvc/status', category: 'matchsvc' },
  )

  if (INCLUDE_DEBUG) {
    endpoints.push(
      { name: 'debug-env', path: '/debug/env', category: 'debug' },
      { name: 'debug-tables', path: '/debug/tables', category: 'debug' },
    )
  }

  // Authenticated (prefer admin)
  endpoints.push(
    // performance
    { name: 'perf-dashboard', path: '/api/performance/dashboard', auth: true, category: 'performance' },
    { name: 'perf-metrics', path: '/api/performance/metrics', auth: true, category: 'performance' },
    {
      name: 'perf-metrics-history',
      path: '/api/performance/metrics/history?hours=24',
      auth: true,
      category: 'performance',
    },
    {
      name: 'perf-odds-history',
      path: '/api/performance/metrics/odds-history?hours=24',
      auth: true,
      category: 'performance',
    },
    { name: 'perf-alerts-active', path: '/api/performance/alerts?active=true', auth: true, category: 'performance' },
    { name: 'perf-health-detailed', path: '/api/performance/health/detailed', auth: true, category: 'performance' },
    { name: 'perf-cache-stats', path: '/api/performance/cache/stats', auth: true, category: 'performance' },
    { name: 'perf-db-stats', path: '/api/performance/database/stats', auth: true, category: 'performance' },
    { name: 'perf-cdn-stats', path: '/api/performance/cdn/stats', auth: true, category: 'performance' },
    {
      name: 'perf-optimization-recs',
      path: '/api/performance/optimization/recommendations',
      auth: true,
      category: 'performance',
    },
    { name: 'perf-report', path: '/api/performance/report?hours=24', auth: true, category: 'performance' },

    // queues
    { name: 'queues-health', path: '/api/queues/health', auth: true, category: 'queues' },
    { name: 'queues-stats', path: '/api/queues/stats', auth: true, category: 'queues' },
    { name: 'queues-dashboard', path: '/api/queues/dashboard', auth: true, category: 'queues' },

    // admin
    { name: 'admin-status', path: '/api/admin/status', auth: true, category: 'admin' },
    { name: 'admin-system-status', path: '/api/admin/system/status', auth: true, category: 'admin' },
  )

  if (INCLUDE_BENCH) {
    endpoints.push({ name: 'benchmark-status', path: '/api/benchmark/status', auth: true, category: 'benchmark' })
  }

  return endpoints
}

async function requestOne(ep, token) {
  const url = `${BASE_URL}${ep.path}`
  const headers = { 'user-agent': 'ck-health-check/1.0' }
  if (ep.auth && token) headers['authorization'] = `Bearer ${token}`
  const method = ep.method || 'GET'
  const t0 = Date.now()
  try {
    const { exec } = withTimeout(async (signal) => fetch(url, { method, headers, signal }), TIMEOUT, ep.name)
    const res = await exec
    const dt = Date.now() - t0
    const contentType = String(res.headers.get('content-type') || '')
    let body
    let bodyType = 'text'
    try {
      if (contentType.includes('application/json')) {
        body = await res.json()
        bodyType = 'json'
      } else {
        body = await res.text()
      }
    } catch (_e) {
      body = await res.text().catch(() => '')
    }
    return {
      name: ep.name,
      category: ep.category,
      path: ep.path,
      method,
      statusCode: res.status,
      ok: res.ok,
      durationMs: dt,
      bodyType,
      body,
    }
  } catch (error) {
    const dt = Date.now() - t0
    return {
      name: ep.name,
      category: ep.category,
      path: ep.path,
      method,
      statusCode: 0,
      ok: false,
      durationMs: dt,
      error: String(error && error.message ? error.message : error),
    }
  }
}

function summarize(results) {
  const byCat = new Map()
  for (const r of results) {
    const c = byCat.get(r.category) || { total: 0, ok: 0 }
    c.total += 1
    if (r.ok) c.ok += 1
    byCat.set(r.category, c)
  }
  return Object.fromEntries(byCat)
}

function printSummary(base, results) {
  const summary = summarize(results)
  const okMark = (ok) => (ok ? '✔' : '✖')
  console.log('')
  console.log(`API Health Report @ ${new Date().toISOString()}`)
  console.log(`Base: ${base}`)
  console.log('')
  for (const cat of Object.keys(summary)) {
    const s = summary[cat]
    console.log(`- ${cat}: ${s.ok}/${s.total} OK`)
    for (const r of results.filter((x) => x.category === cat)) {
      const label = `${okMark(r.ok)} ${r.name} (${r.statusCode || 'ERR'}) in ${hr(r.durationMs)}`
      console.log(`  ${label}`)
    }
  }
  console.log('')
}

async function main() {
  const loginResult = await loginIfRequested().catch((e) => {
    console.error(String(e && e.message ? e.message : e))
    process.exitCode = 1
    return null
  })

  const token = TOKEN || (loginResult && loginResult.token) || ''
  const endpoints = buildEndpoints()

  // Execute with light concurrency to avoid stampeding the server
  const results = []
  const batchSize = 4
  for (let i = 0; i < endpoints.length; i += batchSize) {
    const batch = endpoints.slice(i, i + batchSize)
    const settled = await Promise.allSettled(batch.map((ep) => requestOne(ep, token)))
    for (const s of settled) {
      if (s.status === 'fulfilled') results.push(s.value)
      else results.push({ name: 'unknown', category: 'unknown', path: 'unknown', method: 'GET', statusCode: 0, ok: false, durationMs: 0, error: String(s.reason) })
    }
  }

  await mkdir(OUTPUT_DIR, { recursive: true }).catch(() => {})
  await writeFile(OUTPUT_PATH, JSON.stringify({ baseUrl: BASE_URL, generatedAt: new Date().toISOString(), results }, null, 2), 'utf8')
  printSummary(BASE_URL, results)
  console.log(`Saved full JSON report to: ${OUTPUT_PATH}`)
  if (!token) {
    console.log('Note: Authenticated endpoints may show 401/403 without a token.')
  }
}

main().catch((e) => {
  console.error('Fatal error:', e)
  process.exit(1)
})

