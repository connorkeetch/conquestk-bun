#!/usr/bin/env node
'use strict'

/**
 * API Health/Status Aggregator
 * - Hits core health/metrics endpoints (public + authenticated) and prints a summary.
 * - Saves a full JSON report to scripts/output/health-report-<timestamp>.json
 * - Also writes Markdown and HTML summaries next to the JSON by default
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
 *  --markdown <path>        Output Markdown path (default: <output>.md)
 *  --md <path>              Alias for --markdown
 *  --html <path>            Output HTML path (default: <output>.html)
 *  --no-markdown            Disable Markdown summary output
 *  --no-html                Disable HTML summary output
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
const OUTPUT_BASE = OUTPUT_PATH.replace(/\.json$/i, '')
const WRITE_MARKDOWN = !(argv['no-markdown'] || process.env.NO_MARKDOWN)
const WRITE_HTML = !(argv['no-html'] || process.env.NO_HTML)
const MD_PATH = argv.markdown || argv.md || process.env.MARKDOWN || `${OUTPUT_BASE}.md`
const HTML_PATH = argv.html || process.env.HTML || `${OUTPUT_BASE}.html`

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

function renderMarkdown(baseUrl, results) {
  const summary = summarize(results)
  const okMark = (ok) => (ok ? '✔' : '✖')
  const lines = []
  lines.push(`# ConquestK API Health Report`)
  lines.push('')
  lines.push(`- Generated: ${new Date().toISOString()}`)
  lines.push(`- Base URL: ${baseUrl}`)
  lines.push('')
  for (const cat of Object.keys(summary)) {
    const s = summary[cat]
    lines.push(`## ${cat} — ${s.ok}/${s.total} OK`)
    lines.push('')
    lines.push('| Endpoint | Status | Code | Time | Notes |')
    lines.push('|---|---:|---:|---:|---|')
    for (const r of results.filter((x) => x.category === cat)) {
      const code = r.statusCode || 'ERR'
      const notes = r.ok ? '' : (r.error || (typeof r.body === 'object' && r.body && (r.body.error || r.body.message)) || '')
      lines.push(`| \
${r.path} | ${okMark(r.ok)} | ${code} | ${hr(r.durationMs)} | ${String(notes || '').replace(/\n/g, ' ')} |`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderHtml(baseUrl, results) {
  const summary = summarize(results)
  const okMark = (ok) => (ok ? '✔' : '✖')
  const cats = Object.keys(summary)
  const sections = cats
    .map((cat) => {
      const s = summary[cat]
      const rows = results
        .filter((x) => x.category === cat)
        .map((r) => {
          const code = r.statusCode || 'ERR'
          const note = r.ok
            ? ''
            : escapeHtml(
                r.error || (typeof r.body === 'object' && r.body && (r.body.error || r.body.message)) || ''
              )
          return `
            <tr class="${r.ok ? 'ok' : 'fail'}">
              <td class="path">${escapeHtml(r.path)}</td>
              <td class="status">${okMark(r.ok)}</td>
              <td class="code">${code}</td>
              <td class="time">${hr(r.durationMs)}</td>
              <td class="note">${note}</td>
            </tr>
          `
        })
        .join('\n')
      return `
        <section>
          <h2>${escapeHtml(cat)} — ${s.ok}/${s.total} OK</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Endpoint</th><th>Status</th><th>Code</th><th>Time</th><th>Notes</th></tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        </section>
      `
    })
    .join('\n')

  const allOk = results.every((r) => r.ok)
  const overall = allOk ? 'OK' : 'Issues Detected'

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ConquestK API Health Report</title>
    <style>
      :root { --ok: #0a7a3d; --fail: #b00020; --fg: #111; --bg: #fff; --muted: #666; --row: #f8f9fa; }
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: var(--fg); background: var(--bg); margin: 0; padding: 24px; }
      h1 { margin: 0 0 8px; }
      header { margin-bottom: 16px; }
      .meta { color: var(--muted); font-size: 14px; }
      section { margin: 20px 0 28px; }
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      th, td { border-bottom: 1px solid #e5e7eb; padding: 8px 10px; text-align: left; vertical-align: top; }
      thead th { position: sticky; top: 0; background: #fff; }
      tr:nth-child(even) { background: var(--row); }
      td.status { font-weight: 700; }
      tr.ok td.status { color: var(--ok); }
      tr.fail td.status { color: var(--fail); }
      td.code, td.time { white-space: nowrap; }
      .badge { display: inline-block; padding: 2px 6px; border-radius: 6px; font-size: 12px; margin-left: 6px; }
      .badge.ok { background: #e6f4ea; color: var(--ok); }
      .badge.fail { background: #fde7eb; color: var(--fail); }
      footer { margin-top: 24px; color: var(--muted); font-size: 12px; }
    </style>
  </head>
  <body>
    <header>
      <h1>ConquestK API Health Report <span class="badge ${allOk ? 'ok' : 'fail'}">${overall}</span></h1>
      <div class="meta">Generated ${escapeHtml(new Date().toISOString())} · Base ${escapeHtml(baseUrl)}</div>
    </header>
    ${sections}
    <footer>Generated by scripts/api-health-check.mjs</footer>
  </body>
</html>`
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
  if (WRITE_MARKDOWN) {
    const md = renderMarkdown(BASE_URL, results)
    await writeFile(MD_PATH, md, 'utf8')
    console.log(`Saved Markdown summary to: ${MD_PATH}`)
  }
  if (WRITE_HTML) {
    const html = renderHtml(BASE_URL, results)
    await writeFile(HTML_PATH, html, 'utf8')
    console.log(`Saved HTML summary to: ${HTML_PATH}`)
  }
  if (!token) {
    console.log('Note: Authenticated endpoints may show 401/403 without a token.')
  }
}

main().catch((e) => {
  console.error('Fatal error:', e)
  process.exit(1)
})
