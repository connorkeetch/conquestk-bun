#!/usr/bin/env node
// Simple benchmark comparing TS vs WASM engines for randomized matchups.
// Outputs compact JSON with ops/sec and p95 durations.

import { performance } from 'node:perf_hooks'
import { setEngine, simulateBattle } from '../shared/odds/index.js'

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }

async function benchEngine(kind, N) {
  setEngine(kind)
  const latencies = []
  const start = performance.now()
  for (let i = 0; i < N; i++) {
    const att = randInt(5, 40)
    const def = randInt(5, 35)
    const seedHi = (0xABCD0000 ^ i) >>> 0
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
  const N = Number(process.env.BENCH_N || 10000)
  const ts = await benchEngine('ts', N)
  const wasm = await benchEngine('wasm', N)
  console.log(JSON.stringify({ N, ts, wasm }))
}

main().catch((e) => { console.error(e); process.exit(1) })

