# Odds Engine (TS ↔ WASM) and Shadow Mode

This document describes the Rust → WebAssembly combat odds engine and how it integrates with the existing TypeScript implementation using a “shadow mode” rollout.

## Overview

- New package: `shared/wasm-odds` implements Risk combat simulation in Rust, compiled to WebAssembly via `wasm-bindgen` + `wasm-pack`.
- Thin TypeScript loader exposes a stable API for Node and browser (Vite) without relying on global `fetch`.
- A shared facade `shared/odds` switches between engines: `ts` (default), `wasm`, or `shadow` (compute both, log divergences, return TS result).

## Determinism

- PRNG: xoshiro128++ seeded by caller-provided 64-bit seed (hi/lo u32). Seed expansion via SplitMix64.
- No ambient RNG — every function takes a seed explicitly.
- Dice and combat logic are integer-only.

## API surface

From `@conquestk/wasm-odds`:
- `version()`
- `simulate_step(seed_hi, seed_lo, att_dice, def_dice)`
- `simulate_battle(seed_hi, seed_lo, att_armies, def_armies, policy)`
- `monte_carlo(att, def, trials, seed_hi, seed_lo)`
- `odds_matrix(max_att, max_def, trials, seed_hi, seed_lo)`

From `@conquestk/shared/odds`:
- `setEngine('ts' | 'wasm' | 'shadow')`
- `setLogger(fn)` to capture structured divergence logs in backend
- `simulateBattle({ seedHi, seedLo, attArmies, defArmies, policy })`
- `simulateStep({ seedHi, seedLo, attDice, defDice })`
- `monteCarlo({ attArmies, defArmies, trials, seedHi, seedLo })`
- `computeConquestOdds(att, def)` (exact odds from existing TS DP)

## Build and scripts

- `npm run odds:build`: build the WASM package (release/bundler target).
- `npm run odds:test`: build WASM, run Rust tests, run WASM interop tests, then run shadow-mode parity tests via Vitest.
- `npm run odds:bench`: build WASM, run Criterion benches (Rust), then Node harness comparing TS vs WASM throughput.

## CI

The CI job installs Rust + wasm-pack and runs `npm run odds:test` on Linux. Benchmarking can be gated to main/nightly if desired.

## Shadow rollout

- Staging uses `ODDS_ENGINE=shadow` by default. Backend wires `setLogger` to the structured logger.
- We count divergences over time; target is 0 across 100k+ simulations.
- Flip to `ODDS_ENGINE=wasm` when divergence is 0 for a week. Keep a kill switch: set to `ts` to rollback.

## Admin/Benchmark Route

- Endpoint: `POST /api/benchmark/odds-shadow-verify`
- Auth: Admin (uses existing authenticate middleware)
- Body (JSON):
  - `trials` (number, default 100000)
  - `attMin`/`attMax` (default 5/40), `defMin`/`defMax` (default 5/35)
  - `seedHi`/`seedLo` (u32 seeds to drive determinism)
- Behavior: forces odds engine to `shadow`, runs N randomized battles, counts divergences via odds facade logger, then restores previous engine.
- Metrics: updates `odds_shadow_checked_total`, `odds_shadow_divergence_total`, and `odds_shadow_divergence_rate` (gauge) labeled by environment and kind=`battle`.
- Response: `{ trials, divergences, divergenceRate, durationMs, opsPerSec, range }`

## Nightly Scheduled Verification (optional)

- Implemented as a BullMQ job under the Maintenance worker.
- Enable via environment variables:
  - `ODDS_SHADOW_SCHEDULED=true` (enable nightly run)
  - `ODDS_SHADOW_CRON="30 3 * * *"` (cron schedule; default 03:30 daily)
  - `ODDS_SHADOW_TRIALS=100000` (number of battles)
  - `ODDS_SHADOW_ATT_MIN=5`, `ODDS_SHADOW_ATT_MAX=40`
  - `ODDS_SHADOW_DEF_MIN=5`, `ODDS_SHADOW_DEF_MAX=35`
  - `ODDS_SHADOW_SEED_HI=0xA1B2C3D4`, `ODDS_SHADOW_SEED_LO=0x0F1E2D3C`
- Metrics updated after each run: `odds_shadow_*` as above.

## Dev Cheatsheet (Rust/WASM)

- Install toolchain (one-time):
  - curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  - source "$HOME/.cargo/env"
  - rustup show (verifies install; rust-toolchain.toml pins `stable` + wasm32 target)
  - Install wasm-pack (latest): https://rustwasm.github.io/wasm-pack/installer/

- Build and test from repo root:
  - Build WASM pkg: `npm run odds:build`
  - Rust tests: `cd shared/wasm-odds && npm run test:rs`
  - WASM interop + shadow parity: `npm run odds:test`
  - Full build (frontend + backend + shared): `npm run build`

- Lint and format (Rust):
  - Check formatting: `npm run odds:fmt:check`
  - Auto-format: `npm run odds:fmt:write`
  - Lint (deny warnings): `npm run odds:lint:rs`

- Benchmarks (optional):
  - Run Criterion + Node benches and update docs: `npm run odds:bench`
  - Results land in `docs/bench/*.json` and the block below.

<!-- BENCH:START -->
### Latest Benchmarks

- Battle: N=10000 (timestamp 2025-10-12T03:53:04.934Z)
  - TS ops/sec: 193621.4, p95: 0.01ms
  - WASM ops/sec: 190791.1, p95: 0.01ms
- Monte Carlo: trials=50000 (timestamp 2025-10-12T03:53:06.252Z)
  - TS effective trials/sec: 183018.0
  - WASM effective trials/sec: 981659.5
<!-- BENCH:END -->


- Troubleshooting:
  - Update toolchain: `rustup update`
  - Clean build: `cd shared/wasm-odds/crate && cargo clean`
  - wasm-opt not found: install Binaryen (`wasm-pack` bundles it on CI; locally use your package manager or Binaryen releases). The build will continue without it but optimization is skipped.
  - SIMD not taking effect in browsers: ensure modern browser and that your deployment isn’t stripping WASM features. Node builds always include simd128; browsers fall back if unsupported.
  - Targets: we build both `bundler` (for Vite) and `nodejs` (for backend). The TS loader auto-selects the right one at runtime.
