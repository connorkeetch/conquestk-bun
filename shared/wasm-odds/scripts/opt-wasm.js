#!/usr/bin/env node
/*
 Post-process WASM artifacts with wasm-opt for maximum speed.
 -O3: aggressive optimizations
 --enable-simd: respect SIMD ops
 Skips silently if wasm-opt is unavailable.
*/
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const root = path.resolve(__dirname, '..', '..')
const targets = [
  path.join(root, 'pkg', 'wasm_odds_bg.wasm'),
  path.join(root, 'pkg-node', 'wasm_odds_bg.wasm'),
]

function optimize(p) {
  if (!existsSync(p)) return
  const res = spawnSync('wasm-opt', ['-O3', '--enable-simd', '-o', p, p], {
    stdio: 'inherit',
  })
  if (res.error) {
    // eslint-disable-next-line no-console
    console.warn('[opt-wasm] wasm-opt not found or failed; skipping', res.error?.message)
  }
}

for (const t of targets) optimize(t)

