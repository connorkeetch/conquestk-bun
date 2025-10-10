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

