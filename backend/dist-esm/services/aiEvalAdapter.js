import { computeConquestProbability, evaluateCandidates as wasmEvaluate, } from '@conquestk/shared/odds';
import { logger } from '../utils/logger.js';
export async function evaluateCandidatesAdapter(state, candidates, opts) {
    const mode = (process.env.AI_EVAL_ENGINE || 'ts').toLowerCase();
    if (mode === 'wasm') {
        try {
            return await wasmEvaluate(state, candidates, opts);
        }
        catch (e) {
            logger.warn('AI eval WASM unavailable; falling back to TS', { error: e?.message });
            return scoreCandidatesTs(state, candidates);
        }
    }
    if (mode === 'shadow') {
        let wasmScores = null;
        try {
            wasmScores = await wasmEvaluate(state, candidates, opts);
        }
        catch (e) {
            logger.warn('AI eval WASM unavailable in shadow mode', { error: e?.message });
        }
        const tsScores = scoreCandidatesTs(state, candidates);
        if (wasmScores && wasmScores.length === tsScores.length) {
            let diffs = 0;
            for (let i = 0; i < tsScores.length; i++) {
                if (Math.abs(tsScores[i] - wasmScores[i]) > 1e-9)
                    diffs++;
            }
            if (diffs > 0) {
                logger.info('ai-eval-divergence', { diffs, n: tsScores.length, mode });
            }
        }
        return tsScores;
    }
    return scoreCandidatesTs(state, candidates);
}
function scoreCandidatesTs(state, candidates) {
    const byId = new Map(state.territories.map((t) => [t.id, t]));
    const out = [];
    for (const c of candidates) {
        if (c.kind === 'attack') {
            const from = byId.get(c.from);
            const to = byId.get(c.to);
            if (from &&
                to &&
                from.ownerId === state.currentPlayerId &&
                to.ownerId !== state.currentPlayerId) {
                const att = Math.max(0, (from.armies | 0) - 1);
                const def = Math.max(0, to.armies | 0);
                out.push(computeConquestProbability(att, def));
            }
            else
                out.push(0);
        }
        else
            out.push(0);
    }
    return out;
}
//# sourceMappingURL=aiEvalAdapter.js.map