# @conquestk/wasm-odds

Rust → WebAssembly engine for Risk-style combat and odds. Provides deterministic simulations and Monte Carlo estimation with a caller-provided 64-bit seed. Designed for use in both Node (backend) and browser (Vite) environments.

## API

- version(): string
- simulate_step(seed_hi: u32, seed_lo: u32, att_dice: u8, def_dice: u8) → { attacker_losses, defender_losses }
- simulate_battle(seed_hi: u32, seed_lo: u32, att_armies: u16, def_armies: u16, policy: object) → { attacker_won, attacker_remaining, defender_remaining, steps }
- monte_carlo(att_armies: u16, def_armies: u16, trials: u32, seed_hi: u32, seed_lo: u32) → { trials, wins, losses, p_win, p_loss, att_remaining_hist, def_remaining_hist }
- odds_matrix(max_att: u16, max_def: u16, trials: u32, seed_hi: u32, seed_lo: u32) → number[][]

All integers are returned in JSON-compatible shapes. Internally, the combat logic uses integer math only.

## Determinism

- Uses xoshiro128++ PRNG with SplitMix64 seeding from a caller-provided 64-bit seed (hi, lo u32 pair).
- No ambient RNG is used. Every function takes a seed explicitly.
- Dice are generated with integer math; core combat uses no floating point.

## Build

Prereqs: Rust stable and wasm-pack (documented versions in repo docs).

```bash
npm install
npm run wasm:build    # Produces pkg/wasm_odds_bg.wasm, wasm_odds.js, wasm_odds.d.ts
```

## Usage

### Node (ESM)

```ts
import { loadWasm } from '@conquestk/wasm-odds'

const wasm = await loadWasm() // resolves pkg/wasm_odds_bg.wasm by URL
const mc = wasm.monte_carlo(20, 15, 50000, 0xABCD0001, 0x12345678)
console.log(mc.p_win)
```

### Browser (Vite)

```ts
import { loadWasm } from '@conquestk/wasm-odds'

const wasmUrl = new URL('./pkg/wasm_odds_bg.wasm', import.meta.url).toString()
const wasm = await loadWasm(wasmUrl)
```

### Passing pre-fetched bytes

```ts
const bytes = await fetch(wasmUrl).then(r => r.arrayBuffer())
const wasm = await loadWasm(bytes)
```

## Testing

- Rust: `npm run test:rs`
- TypeScript (interop): `npm run test:ts` (requires a prior `npm run wasm:build` if running tests that import the built package)

