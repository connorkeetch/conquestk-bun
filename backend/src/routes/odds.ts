/**
 * @fileoverview This file defines the Express routes for the odds calculation service.
 * It includes a status endpoint to check the availability and version of the WebAssembly (WASM) module for odds calculation.
 * @module routes/odds
 */
import { getEngine as getOddsEngine } from '@conquestk/shared/odds'
import express from 'express'

const router = express.Router()

/**
 * Checks for the availability of the WebAssembly (WASM) module for odds calculation.
 * It attempts to dynamically import the module and retrieve its version.
 * @returns {Promise<{available: true, version: string | undefined} | {available: false, error: string}>} An object indicating whether the WASM module is available, and if so, its version. If not, it includes an error message.
 */
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

/**
 * Route to get the status of the odds calculation engine.
 * It returns the current engine type (e.g., 'js' or 'wasm') and checks for the availability of the WASM module.
 * @name GET /odds/status
 * @function
 * @memberof module:routes/odds
 * @param {import('express').Request} _req - The Express request object (unused).
 * @param {import('express').Response} res - The Express response object, containing the status of the odds engine.
 * @returns {Promise<void>}
 */
router.get('/status', async (_req, res) => {
  const engine = getOddsEngine()
  const wasm = await checkWasmAvailability()
  res.json({
    success: true,
    data: {
      engine,
      wasmAvailable: wasm.available,
      wasmVersion: wasm.available ? wasm.version : undefined,
    },
  })
})

export default router
