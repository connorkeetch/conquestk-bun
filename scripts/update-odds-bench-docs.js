#!/usr/bin/env node
// Update docs/tech/odds-engine.md with latest benchmark numbers.
// Replaces the block between <!-- BENCH:START --> and <!-- BENCH:END -->.

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const docsPath = path.join(root, 'docs', 'tech', 'odds-engine.md')
const battlePath = path.join(root, 'docs', 'bench', 'bench-battle.json')
const mcPath = path.join(root, 'docs', 'bench', 'bench-mc.json')

function safeRead(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null }
}

const battle = safeRead(battlePath)
const mc = safeRead(mcPath)
if (!battle && !mc) process.exit(0)

const lines = []
lines.push('<!-- BENCH:START -->')
lines.push('### Latest Benchmarks')
lines.push('')
if (battle) {
  lines.push(`- Battle: N=${battle.N} (timestamp ${battle.timestamp})`)
  lines.push(
    `  - TS ops/sec: ${battle.ts.opsPerSec.toFixed(1)}, p95: ${battle.ts.p95Ms.toFixed(2)}ms`
  )
  lines.push(
    `  - WASM ops/sec: ${battle.wasm.opsPerSec.toFixed(1)}, p95: ${battle.wasm.p95Ms.toFixed(2)}ms`
  )
}
if (mc) {
  lines.push(`- Monte Carlo: trials=${mc.trials} (timestamp ${mc.timestamp})`)
  lines.push(`  - TS effective trials/sec: ${mc.ts.opsPerSec.toFixed(1)}`)
  lines.push(`  - WASM effective trials/sec: ${mc.wasm.opsPerSec.toFixed(1)}`)
}
lines.push('<!-- BENCH:END -->')

let md = readFileSync(docsPath, 'utf8')
const start = md.indexOf('<!-- BENCH:START -->')
const end = md.indexOf('<!-- BENCH:END -->')
if (start !== -1 && end !== -1 && end > start) {
  const before = md.slice(0, start)
  const after = md.slice(end + '<!-- BENCH:END -->'.length)
  md = `${before}${lines.join('\n')}\n${after}`
} else {
  md = `${md}\n\n${lines.join('\n')}\n`
}
writeFileSync(docsPath, md)

