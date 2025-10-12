import { parentPort, workerData } from 'node:worker_threads';
import { setEngine, setLogger, simulateBattle } from '@conquestk/shared/odds';
async function run() {
    const { start, count, attMin, attMax, defMin, defMax, seedHi, seedLo, } = (workerData || {});
    setEngine('shadow');
    let divergences = 0;
    setLogger((entry) => {
        try {
            const e = entry;
            if (e?.tag === 'odds-divergence')
                divergences++;
        }
        catch { }
    });
    const range = attMax - attMin + 1;
    const rdef = defMax - defMin + 1;
    for (let i = 0; i < count; i++) {
        const idx = start + i;
        const att = attMin + (idx % Math.max(1, range));
        const def = defMin + (idx % Math.max(1, rdef));
        const sh = (seedHi ^ idx) >>> 0;
        const sl = (seedLo ^ (idx * 2654435761)) >>> 0;
        await simulateBattle({ seedHi: sh, seedLo: sl, attArmies: att, defArmies: def });
    }
    parentPort?.postMessage({ divergences });
}
void run();
//# sourceMappingURL=oddsShadowWorker.js.map