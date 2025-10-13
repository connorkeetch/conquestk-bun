#!/usr/bin/env node

// Benchmark monte_carlo throughput for TS vs WASM.
// Writes JSON to stdout and docs/bench/bench-mc.json.

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { monteCarlo, setEngine } from '@conquestk/shared/odds'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function cases() {
  return [
    { att: 20, def: 15 },
    { att: 35, def: 30 },
    { att: 10, def: 8 },
    { att: 50, def: 40 },
  ]
}

async function benchEngine(kind, trials) {
  setEngine(kind)
  const items = cases()
  const start = performance.now()
  for (let i = 0; i < items.length; i++) {
    const { att, def } = items[i]
    const seedHi = (0xf00d0000 ^ i) >>> 0
    const seedLo = (0xbeef5678 ^ (i * 1103515245)) >>> 0
    await monteCarlo({ attArmies: att, defArmies: def, trials, seedHi, seedLo })
  }
  const total = performance.now() - start
  // Effective rolls per second approximated by (items * trials)/total
  const opsPerSec = (items.length * trials) / (total / 1000)
  return { engine: kind, totalMs: total, opsPerSec }
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const quiet = args.has('--quiet') || process.env.QUIET === '1'
  const trials = Number(process.env.MC_TRIALS || 50000)
  const ts = await benchEngine('ts', trials)
  const wasm = await benchEngine('wasm', trials)
  const payload = { kind: 'mc', trials, ts, wasm, timestamp: new Date().toISOString() }
  if (!quiet) {
    console.log(JSON.stringify(payload))
  }
  try {
    const outDir = path.resolve(__dirname, '../docs/bench')
    mkdirSync(outDir, { recursive: true })
    writeFileSync(path.join(outDir, 'bench-mc.json'), JSON.stringify(payload, null, 2))
  } catch {
    // ignore write errors in CI or ephemeral environments
  }
}

main().catch((e) => {
  const args = new Set(process.argv.slice(2))
  const quiet = args.has('--quiet') || process.env.QUIET === '1'
  if (!quiet) {
    console.error(e)
  }
  process.exit(1)
})
