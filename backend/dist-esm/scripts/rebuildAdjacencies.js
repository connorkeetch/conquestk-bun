"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = __importDefault(require("node:path"));
const dotenv_1 = __importDefault(require("dotenv"));
const logger_js_1 = require("../utils/logger.js");
dotenv_1.default.config({ path: node_path_1.default.resolve(process.cwd(), '.env') });
const pick = (...candidates) => {
    for (const c of candidates)
        if (c?.trim())
            return c.trim();
    return undefined;
};
async function run() {
    const mapId = process.argv[2];
    if (!mapId) {
        logger_js_1.logger.error('Usage: ts-node src/scripts/rebuildAdjacencies.ts <mapId>');
        process.exit(1);
    }
    const { query } = (await import('../config/database.js'));
    const result = await query('SELECT id, name, metadata FROM maps WHERE id = $1', [mapId]);
    const row = result.rows[0];
    if (!row) {
        logger_js_1.logger.error('Map not found', { mapId });
        process.exit(1);
    }
    const metadata = (() => {
        const raw = row.metadata;
        if (!raw)
            return {};
        if (typeof raw === 'string') {
            try {
                return JSON.parse(raw);
            }
            catch {
                return {};
            }
        }
        return raw;
    })();
    const territories = Array.isArray(metadata.territories) ? metadata.territories : [];
    const adjacencies = Array.isArray(metadata.adjacencies) ? metadata.adjacencies : [];
    if (territories.length === 0) {
        logger_js_1.logger.error('No territories in metadata; cannot rebuild adjacencies');
        process.exit(1);
    }
    const idToName = new Map();
    for (const t of territories) {
        const nameUsed = pick(t.name, t.id) || 'Territory';
        if (t.id)
            idToName.set(t.id.trim(), nameUsed);
        if (t.name)
            idToName.set(t.name.trim(), nameUsed);
    }
    const normalize = (key) => {
        if (!key)
            return undefined;
        const trimmed = key.trim();
        return idToName.get(trimmed) || trimmed;
    };
    const pairs = [];
    const seen = new Set();
    const addPair = (from, to) => {
        const nf = normalize(from);
        const nt = normalize(to);
        if (!nf || !nt || nf === nt)
            return;
        const key = nf < nt ? `${nf}|${nt}` : `${nt}|${nf}`;
        if (seen.has(key))
            return;
        seen.add(key);
        pairs.push({ from: nf, to: nt });
        pairs.push({ from: nt, to: nf });
    };
    if (adjacencies.length > 0) {
        for (const a of adjacencies) {
            const from = pick(a.from, a.fromTerritoryId, a.territory_from, a.source);
            const to = pick(a.to, a.toTerritoryId, a.territory_to, a.target);
            addPair(from, to);
        }
    }
    else {
        for (const t of territories) {
            const from = pick(t.id, t.name);
            if (!from || !Array.isArray(t.connections))
                continue;
            for (const c of t.connections)
                addPair(from, c);
        }
    }
    logger_js_1.logger.info(`Rebuilding adjacencies for ${row.name}: ${pairs.length} directed edges`);
    await query('DELETE FROM territory_adjacencies WHERE map_id = $1', [mapId]);
    for (const { from, to } of pairs) {
        await query(`INSERT INTO territory_adjacencies (map_id, territory_from, territory_to)
       VALUES ($1,$2,$3)
       ON CONFLICT (map_id, territory_from, territory_to) DO NOTHING`, [mapId, from, to]);
    }
    logger_js_1.logger.info('Adjacencies rebuilt successfully');
}
run().catch((err) => {
    logger_js_1.logger.error('Failed to rebuild adjacencies', err);
    process.exit(1);
});
//# sourceMappingURL=rebuildAdjacencies.js.map