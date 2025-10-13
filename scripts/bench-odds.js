#!/usr/bin/env node

// Benchmark simulateBattle throughput for TS vs WASM engines.
// Writes JSON to stdout and to docs/bench/bench-battle.json when possible.

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { setEngine, simulateBattle } from '@conquestk/shared/odds'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

async function benchEngine(kind, N) {
  setEngine(kind)
  const latencies = []
  const start = performance.now()
  for (let i = 0; i < N; i++) {
    const att = randInt(5, 40)
    const def = randInt(5, 35)
    const seedHi = (0xabcd0000 ^ i) >>> 0
    const seedLo = (0x12345678 ^ (i * 1103515245)) >>> 0
    const t0 = performance.now()
    await simulateBattle({ seedHi, seedLo, attArmies: att, defArmies: def })
    latencies.push(performance.now() - t0)
  }
  const total = performance.now() - start
  latencies.sort((a, b) => a - b)
  const p95 = latencies[Math.floor(0.95 * latencies.length)] || 0
  return { engine: kind, totalMs: total, opsPerSec: (N / total) * 1000, p95Ms: p95 }
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const quiet = args.has('--quiet') || process.env.QUIET === '1'
  const N = Number(process.env.BENCH_N || 10000)
  const ts = await benchEngine('ts', N)
  const wasm = await benchEngine('wasm', N)
  const payload = { kind: 'battle', N, ts, wasm, timestamp: new Date().toISOString() }
  if (!quiet) {
    process.stdout.write(`${JSON.stringify(payload)}\n`)
  }
  try {
    const outDir = path.resolve(__dirname, '../docs/bench')
    mkdirSync(outDir, { recursive: true })
    writeFileSync(path.join(outDir, 'bench-battle.json'), JSON.stringify(payload, null, 2))
  } catch {
    // ignore write errors in CI or ephemeral environments
  }
}

main().catch((e) => {
  const args = new Set(process.argv.slice(2))
  const quiet = args.has('--quiet') || process.env.QUIET === '1'
  if (!quiet) {
    const msg = e && typeof e === 'object' && 'stack' in e ? e.stack : String(e)
    process.stderr.write(`${msg}\n`)
  }
  process.exit(1)
})
