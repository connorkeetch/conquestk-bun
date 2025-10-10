import { describe, it, expect } from 'vitest'
import { setEngine, setLogger, simulateBattle } from '@conquestk/shared/odds'

describe('shadow mode parity (TS vs WASM)', () => {
  it('no divergences across 10k random seeds/battles', async () => {
    // Ensure WASM bundle is built before running this test (handled by odds:test script)
    const divergences: unknown[] = []
    setLogger((entry) => { divergences.push(entry) })
    setEngine('shadow')
    const N = 10_000
    for (let i = 0; i < N; i++) {
      const seedHi = (0xA1B2C3D4 ^ i) >>> 0
      const seedLo = (0x0F1E2D3C ^ (i * 2654435761)) >>> 0
      const att = 5 + (i % 40)
      const def = 5 + (i % 35)
      await simulateBattle({ seedHi, seedLo, attArmies: att, defArmies: def })
    }
    expect(divergences.length).toBe(0)
  }, 120000)
})
