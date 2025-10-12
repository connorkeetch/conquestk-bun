import express from 'express'
import { getEngine as getOddsEngine } from '@conquestk/shared/odds'

const router = express.Router()

async function checkWasmAvailability() {
  try {
    // Use a non-literal specifier to avoid TypeScript resolving types at build time for this optional dep
    const spec = '@conquestk/wasm-odds' as string
    const mod = (await import(spec)) as { loadWasm: () => Promise<{ version: () => string }> }
    const api = await mod.loadWasm()
    const version = typeof api?.version === 'function' ? api.version() : undefined
    return { available: true as const, version }
  } catch (error) {
    return { available: false as const, error: (error as Error)?.message || 'unknown error' }
  }
}

router.get('/status', async (_req, res) => {
  const engine = getOddsEngine()
  const wasm = await checkWasmAvailability()
  res.json({ success: true, data: { engine, wasmAvailable: wasm.available, wasmVersion: wasm.available ? wasm.version : undefined } })
})

export default router
