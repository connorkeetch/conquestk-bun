import express from 'express';
import { getEngine as getOddsEngine } from '@conquestk/shared/odds';
const router = express.Router();
async function checkWasmAvailability() {
    try {
        const spec = '@conquestk/wasm-odds';
        const mod = (await import(spec));
        const api = await mod.loadWasm();
        const version = typeof api?.version === 'function' ? api.version() : undefined;
        return { available: true, version };
    }
    catch (error) {
        return { available: false, error: error?.message || 'unknown error' };
    }
}
router.get('/status', async (_req, res) => {
    const engine = getOddsEngine();
    const wasm = await checkWasmAvailability();
    res.json({ success: true, data: { engine, wasmAvailable: wasm.available, wasmVersion: wasm.available ? wasm.version : undefined } });
});
export default router;
//# sourceMappingURL=odds.js.map