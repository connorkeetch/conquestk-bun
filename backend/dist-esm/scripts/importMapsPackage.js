import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { storeBase64Image, storeImageBuffer } from '../utils/imageStorage.js';
import { logger } from '../utils/logger.js';
const parseArgs = () => {
    const opts = {};
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--zip' && args[i + 1])
            opts.zipPath = args[++i];
        else if (a === '--dir' && args[i + 1])
            opts.dirPath = args[++i];
        else if (a === '--user' && args[i + 1])
            opts.userId = args[++i];
        else if (a === '--dry')
            opts.dryRun = true;
        else if (a === '--approve')
            opts.approve = true;
        else if (a === '--draft-on-fail')
            opts.draftOnFail = true;
        else if (a === '--force-draft')
            opts.forceDraft = true;
        else if (a === '--name-suffix' && args[i + 1])
            opts.nameSuffix = args[++i];
    }
    return opts;
};
const ensurePath = (p) => (path.isAbsolute(p) ? p : path.resolve(process.cwd(), p));
const listCandidateJsonFiles = (root) => {
    const out = [];
    const scan = (dir, depth) => {
        if (depth > 6)
            return;
        let entries = [];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
                scan(full, depth + 1);
            }
            else if (e.isFile() && e.name.toLowerCase().endsWith('.json')) {
                out.push(full);
            }
        }
    };
    scan(root, 0);
    return out.sort((a, b) => {
        const aIsMap = path.basename(a).toLowerCase() === 'map.json';
        const bIsMap = path.basename(b).toLowerCase() === 'map.json';
        if (aIsMap && !bIsMap)
            return -1;
        if (!aIsMap && bIsMap)
            return 1;
        return a.localeCompare(b);
    });
};
const extToMime = (ext) => {
    const e = ext.toLowerCase().replace(/^\./, '');
    switch (e) {
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        case 'webp':
            return 'image/webp';
        case 'gif':
            return 'image/gif';
        default:
            return 'image/png';
    }
};
const slug = (name) => name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'map';
const findImageFile = (folder, preferred) => {
    if (preferred) {
        const candidate = path.join(folder, preferred);
        if (fs.existsSync(candidate)) {
            return { filePath: candidate, mimeType: extToMime(path.extname(candidate)) };
        }
    }
    const names = ['background.png', 'background.jpg', 'background.jpeg', 'background.webp'];
    for (const n of names) {
        const candidate = path.join(folder, n);
        if (fs.existsSync(candidate)) {
            return { filePath: candidate, mimeType: extToMime(path.extname(candidate)) };
        }
    }
    for (const file of fs.readdirSync(folder)) {
        if (/\.(png|jpe?g|webp|gif)$/i.test(file)) {
            const candidate = path.join(folder, file);
            return { filePath: candidate, mimeType: extToMime(path.extname(candidate)) };
        }
    }
    return null;
};
async function resolveCreatorUserId(explicit) {
    if (explicit)
        return explicit;
    const { query } = (await import('../config/database.js'));
    const admin = await query('SELECT id FROM users WHERE is_admin = TRUE ORDER BY created_at ASC LIMIT 1');
    if (admin.rows[0]?.id)
        return admin.rows[0].id;
    const any = await query('SELECT id FROM users ORDER BY created_at ASC LIMIT 1');
    if (any.rows[0]?.id)
        return any.rows[0].id;
    throw new Error('No users found. Create a user first or pass --user <id>.');
}
async function resolveAdminUserId() {
    const { query } = (await import('../config/database.js'));
    const admin = await query('SELECT id FROM users WHERE is_admin = TRUE ORDER BY created_at ASC LIMIT 1');
    if (admin.rows[0]?.id)
        return admin.rows[0].id;
    throw new Error('No admin users found; cannot approve maps automatically');
}
const normalizeImageUrl = (url) => {
    if (!url)
        return url;
    const endpoint = process.env.ASSET_ENDPOINT?.replace(/\/$/, '');
    const bucket = process.env.ASSET_BUCKET?.replace(/\/$/, '');
    const publicBase = process.env.PUBLIC_ASSET_BASE_URL?.replace(/\/$/, '');
    if (publicBase && endpoint && bucket) {
        const oldPrefix = `${endpoint}/${bucket}`;
        if (url.startsWith(oldPrefix)) {
            return url.replace(oldPrefix, publicBase);
        }
    }
    return url;
};
async function extractZip(zipPath) {
    try {
        const AdmZip = (await import('adm-zip')).default;
        const tempDir = path.join(os.tmpdir(), `maps-import-${randomUUID()}`);
        fs.mkdirSync(tempDir, { recursive: true });
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(tempDir, true);
        return tempDir;
    }
    catch (err) {
        logger.error('Failed to load/extract zip. Install adm-zip or extract manually and use --dir.', err);
        throw new Error('adm-zip not installed. Run: cd backend && npm i adm-zip');
    }
}
async function run() {
    const opts = parseArgs();
    let userId;
    if (!opts.dryRun) {
        userId = await resolveCreatorUserId(opts.userId || process.env.IMPORT_USER_ID);
        logger.info(`Using creator user: ${userId}`);
    }
    else {
        logger.info('Dry run: skipping user lookup and database writes');
    }
    let workingRoot;
    if (opts.dirPath) {
        workingRoot = ensurePath(opts.dirPath);
    }
    else if (opts.zipPath) {
        const zipAbs = ensurePath(opts.zipPath);
        if (!fs.existsSync(zipAbs))
            throw new Error(`Zip not found: ${zipAbs}`);
        workingRoot = await extractZip(zipAbs);
    }
    else {
        const defaultZip = path.resolve(process.cwd(), '../../maps-package.zip');
        if (!fs.existsSync(defaultZip))
            throw new Error('Provide --zip <file> or --dir <folder>');
        workingRoot = await extractZip(defaultZip);
    }
    const jsonFiles = listCandidateJsonFiles(workingRoot);
    if (jsonFiles.length === 0) {
        logger.warn('No map JSON files found in the package');
        return;
    }
    for (const jsonPath of jsonFiles) {
        const folder = path.dirname(jsonPath);
        try {
            const raw = fs.readFileSync(jsonPath, 'utf8');
            const data = JSON.parse(raw);
            if (!data.name || typeof data.name !== 'string')
                throw new Error('map.json missing name');
            if (opts.nameSuffix && typeof opts.nameSuffix === 'string') {
                data.name = `${data.name}${opts.nameSuffix}`;
            }
            const { query } = (await import('../config/database.js'));
            const existingMap = await query('SELECT id FROM maps WHERE LOWER(name) = LOWER($1) LIMIT 1', [data.name.trim()]);
            const existingDraft = await query("SELECT id FROM map_drafts WHERE LOWER(name) = LOWER($1) AND draft_status != 'submitted' LIMIT 1", [data.name.trim()]);
            if (existingMap.rows[0]?.id || existingDraft.rows[0]?.id) {
                logger.info('⏭️  Skipping existing map by name', {
                    name: data.name,
                    existingMapId: existingMap.rows[0]?.id,
                    existingDraftId: existingDraft.rows[0]?.id,
                    source: jsonPath,
                });
                continue;
            }
            let imageUrl;
            let imageWidth;
            let imageHeight;
            const subdir = `imports/${slug(data.name)}`;
            if (data.image && typeof data.image.data === 'string') {
                const match = data.image.data.match(/^data:[^;]+;base64,(.*)$/);
                const base64 = match ? match[1] : data.image.data;
                const info = await storeBase64Image(base64, {
                    mimeType: data.image.mimeType || 'image/png',
                    preferredFilename: data.imageFilename || 'background.png',
                    subdirectory: subdir,
                });
                imageUrl = normalizeImageUrl(info.relativeUrl);
                imageWidth = info.width;
                imageHeight = info.height;
            }
            else {
                const found = findImageFile(folder, data.imageFilename);
                if (!found)
                    throw new Error('No image found in folder');
                const buffer = fs.readFileSync(found.filePath);
                const info = await storeImageBuffer(buffer, {
                    mimeType: found.mimeType,
                    preferredFilename: path.basename(found.filePath),
                    subdirectory: subdir,
                });
                imageUrl = normalizeImageUrl(info.relativeUrl);
                imageWidth = info.width;
                imageHeight = info.height;
            }
            const canvasDims = data;
            const metadata = {
                territories: (Array.isArray(data.territories)
                    ? data.territories
                    : []),
                sectors: (() => {
                    const grp = data;
                    if (Array.isArray(grp.sectors))
                        return grp.sectors;
                    if (Array.isArray(grp.continents))
                        return grp.continents;
                    return [];
                })(),
                adjacencies: (Array.isArray(data.adjacencies)
                    ? data.adjacencies
                    : []),
                capitalAssignments: data.capitalAssignments || {},
                territoryModifiers: (data.territoryModifiers || undefined),
                width: typeof canvasDims.canvas_width === 'number'
                    ? canvasDims.canvas_width
                    : typeof data.width === 'number'
                        ? data.width
                        : imageWidth,
                height: typeof canvasDims.canvas_height === 'number'
                    ? canvasDims.canvas_height
                    : typeof data.height === 'number'
                        ? data.height
                        : imageHeight,
            };
            const csvTerritories = fs.readdirSync(folder).find((f) => /^territories_.*\.csv$/i.test(f));
            const csvAdj = fs.readdirSync(folder).find((f) => /^adjacencies_.*\.csv$/i.test(f));
            const csvRegions = fs.readdirSync(folder).find((f) => /^regions_.*\.csv$/i.test(f));
            const csvBonuses = fs.readdirSync(folder).find((f) => /^bonuses_.*\.csv$/i.test(f));
            const csvCapitals = fs.readdirSync(folder).find((f) => /^capitals_.*\.csv$/i.test(f));
            const parseCsv = (filePath) => {
                const text = fs.readFileSync(filePath, 'utf8');
                return text
                    .replace(/\r\n/g, '\n')
                    .replace(/\r/g, '\n')
                    .split('\n')
                    .filter((l) => l.trim().length > 0)
                    .map((l) => l.split(',').map((s) => s.trim()));
            };
            if (csvTerritories) {
                const rows = parseCsv(path.join(folder, csvTerritories));
                const header = rows.shift() || [];
                const idxId = header.findIndex((h) => h.toLowerCase().includes('territory'));
                const idxName = header.findIndex((h) => h.toLowerCase() === 'name');
                const idxX = header.findIndex((h) => h.toLowerCase() === 'x');
                const idxY = header.findIndex((h) => h.toLowerCase() === 'y');
                const territories = rows
                    .map((r) => ({
                    id: (r[idxId] ?? '').toString(),
                    name: r[idxName] ?? undefined,
                    x: Number(r[idxX] ?? '0') || 0,
                    y: Number(r[idxY] ?? '0') || 0,
                }))
                    .filter((t) => t.id && t.name);
                metadata.territories = territories;
            }
            if (csvAdj) {
                const rows = parseCsv(path.join(folder, csvAdj));
                const header = rows.shift() || [];
                const idxFrom = header.findIndex((h) => h.toLowerCase() === 'source' || h.toLowerCase() === 'from');
                const idxTo = header.findIndex((h) => h.toLowerCase() === 'target' || h.toLowerCase() === 'to');
                const adjs = rows
                    .map((r) => ({ from: r[idxFrom], to: r[idxTo] }))
                    .filter((a) => typeof a.from === 'string' && typeof a.to === 'string');
                metadata.adjacencies = adjs;
            }
            if (csvRegions && csvBonuses) {
                const regRows = parseCsv(path.join(folder, csvRegions));
                const bonusRows = parseCsv(path.join(folder, csvBonuses));
                if (regRows.length > 1) {
                }
                if (bonusRows.length > 1) {
                }
            }
            if (csvCapitals) {
                const capRows = parseCsv(path.join(folder, csvCapitals));
                if (capRows.length > 1) {
                    const ids = capRows
                        .slice(1)
                        .map((r) => r[0])
                        .filter(Boolean);
                    if (!metadata.capitalAssignments)
                        metadata.capitalAssignments = {};
                    metadata.capitalAssignments['2'] = ids;
                }
            }
            const normTerritories = Array.isArray(metadata.territories)
                ? metadata.territories.map((t) => {
                    const rec = t;
                    const connections = rec.connections;
                    if (rec && !Array.isArray(connections)) {
                        const neighbors = Array.isArray(rec.neighbors)
                            ? rec.neighbors
                            : Array.isArray(rec.neighbours)
                                ? rec.neighbours
                                : Array.isArray(rec.links)
                                    ? rec.links
                                    : Array.isArray(rec.adjacent)
                                        ? rec.adjacent
                                        : undefined;
                        if (Array.isArray(neighbors)) {
                            return {
                                ...rec,
                                connections: neighbors.filter((x) => typeof x === 'string'),
                            };
                        }
                    }
                    return t;
                })
                : [];
            const normAdjacencies = (() => {
                const pairs = [];
                const seen = new Set();
                const addPair = (from, to) => {
                    if (typeof from !== 'string')
                        return;
                    if (typeof to !== 'string')
                        return;
                    const f = from.trim();
                    const t = to.trim();
                    if (!f || !t || f === t)
                        return;
                    const key = f < t ? `${f}|${t}` : `${t}|${f}`;
                    if (seen.has(key))
                        return;
                    seen.add(key);
                    pairs.push({ from: f, to: t });
                    pairs.push({ from: t, to: f });
                };
                const raw = Array.isArray(metadata.adjacencies)
                    ? metadata.adjacencies
                    : [];
                if (raw.length > 0) {
                    for (const a of raw) {
                        if (!a || typeof a !== 'object')
                            continue;
                        const from = (a.from || a.fromTerritoryId || a.territory_from || a.source);
                        const toVal = (a.to || a.toTerritoryId || a.territory_to || a.target);
                        if (Array.isArray(toVal)) {
                            for (const t of toVal)
                                addPair(from, t);
                        }
                        else {
                            addPair(from, toVal);
                        }
                    }
                    return pairs;
                }
                for (const t of normTerritories) {
                    const from = (t?.id || t?.name);
                    if (!from || !Array.isArray(t?.connections))
                        continue;
                    for (const c of t.connections)
                        addPair(from, c);
                }
                return pairs;
            })();
            metadata.territories = normTerritories;
            metadata.adjacencies = normAdjacencies;
            if (opts.dryRun) {
                logger.info(`DRY RUN: would import "${data.name}" from ${folder}`);
                continue;
            }
            if (opts.forceDraft) {
                const { default: mapWorkflowService } = (await import('../services/mapWorkflowService.js'));
                const draft = await mapWorkflowService.saveDraft(userId, {
                    name: data.name,
                    description: data.description || undefined,
                    territories: metadata.territories,
                    sectors: metadata.sectors,
                    adjacencies: metadata.adjacencies,
                    capitalAssignments: metadata.capitalAssignments,
                    imageUrl,
                    imageWidth,
                    imageHeight,
                    isPublic: false,
                    tags: Array.isArray(data.tags) ? data.tags : [],
                });
                logger.info(`📝 Saved draft: ${data.name} (${draft.id})`);
                continue;
            }
            try {
                const { mapService } = (await import('../services/mapService.js'));
                const created = await mapService.createMap(userId, {
                    name: data.name,
                    description: data.description || undefined,
                    imageUrl,
                    imageWidth,
                    imageHeight,
                    isPublic: false,
                    tags: Array.isArray(data.tags) ? data.tags : [],
                    minPlayers: typeof data.minPlayers === 'number' ? data.minPlayers : 2,
                    maxPlayers: typeof data.maxPlayers === 'number' ? data.maxPlayers : 6,
                    metadata: {
                        territories: metadata.territories,
                        sectors: metadata.sectors,
                        adjacencies: metadata.adjacencies,
                        capitalAssignments: metadata.capitalAssignments,
                        width: metadata.width,
                        height: metadata.height,
                    },
                });
                logger.info(`✅ Imported map: ${created.name} (${created.id})`);
                try {
                    const { query } = (await import('../config/database.js'));
                    const t = await query('SELECT COUNT(*) AS c FROM map_territories WHERE map_id = $1', [
                        created.id,
                    ]);
                    const c = await query('SELECT COUNT(*) AS c FROM map_sectors WHERE map_id = $1', [
                        created.id,
                    ]);
                    const a = await query('SELECT COUNT(*) AS c FROM territory_adjacencies WHERE map_id = $1', [created.id]);
                    logger.info('📊 Inserted rows', {
                        mapId: created.id,
                        territories: parseInt(t.rows[0]?.c || '0', 10),
                        sectors: parseInt(c.rows[0]?.c || '0', 10),
                        adjacencies: parseInt(a.rows[0]?.c || '0', 10),
                    });
                }
                catch (countErr) {
                    logger.warn('Could not fetch row counts after import', { error: countErr });
                }
                if (opts.approve) {
                    try {
                        const adminId = await resolveAdminUserId();
                        const { default: mapWorkflowService } = (await import('../services/mapWorkflowService.js'));
                        await mapWorkflowService.approveMap(created.id, adminId, {
                            notes: 'Auto-approved by import script',
                        });
                        logger.info(`🔓 Approved map: ${created.name} (${created.id})`);
                    }
                    catch (approveErr) {
                        logger.warn('Failed to auto-approve map (skipping)', {
                            mapId: created.id,
                            error: approveErr,
                        });
                    }
                }
            }
            catch (createErr) {
                if (opts.draftOnFail) {
                    const { default: mapWorkflowService } = (await import('../services/mapWorkflowService.js'));
                    const draft = await mapWorkflowService.saveDraft(userId, {
                        name: data.name,
                        description: data.description || undefined,
                        territories: metadata.territories,
                        sectors: metadata.sectors,
                        adjacencies: metadata.adjacencies,
                        capitalAssignments: metadata.capitalAssignments,
                        imageUrl,
                        imageWidth,
                        imageHeight,
                        isPublic: false,
                        tags: Array.isArray(data.tags) ? data.tags : [],
                    });
                    logger.info(`📝 Saved draft: ${data.name} (${draft.id})`);
                }
                else {
                    throw createErr;
                }
            }
        }
        catch (err) {
            logger.error(`❌ Failed to process ${jsonPath}`, { error: err });
        }
    }
    try {
        const endpoint = process.env.ASSET_ENDPOINT?.replace(/\/$/, '');
        const bucket = process.env.ASSET_BUCKET?.replace(/\/$/, '');
        const publicBase = process.env.PUBLIC_ASSET_BASE_URL?.replace(/\/$/, '');
        if (endpoint && bucket && publicBase) {
            const oldPrefix = `${endpoint}/${bucket}`;
            const like = `${oldPrefix}/%`;
            const { query } = (await import('../config/database.js'));
            const mapsToUpdate = await query(`SELECT COUNT(*) AS total FROM maps WHERE image_url LIKE $1`, [like]);
            const mapsCount = parseInt(mapsToUpdate.rows[0]?.total || '0', 10);
            if (mapsCount > 0) {
                logger.info(`Post-import: updating ${mapsCount} map image URL(s) to ${publicBase}`);
                await query(`UPDATE maps SET image_url = REPLACE(image_url, $1, $2) WHERE image_url LIKE $3`, [oldPrefix, publicBase, like]);
            }
            const draftsToUpdate = await query(`SELECT COUNT(*) AS total FROM map_drafts WHERE image_url LIKE $1`, [like]);
            const draftsCount = parseInt(draftsToUpdate.rows[0]?.total || '0', 10);
            if (draftsCount > 0) {
                logger.info(`Post-import: updating ${draftsCount} draft image URL(s) to ${publicBase}`);
                await query(`UPDATE map_drafts SET image_url = REPLACE(image_url, $1, $2) WHERE image_url LIKE $3`, [oldPrefix, publicBase, like]);
            }
        }
        else {
            logger.info('Post-import URL normalization skipped: ensure ASSET_ENDPOINT, ASSET_BUCKET, and PUBLIC_ASSET_BASE_URL are set to auto-rewrite raw R2 URLs to CDN');
        }
    }
    catch (normErr) {
        logger.warn('Post-import image URL normalization failed (non-critical):', normErr);
    }
}
run()
    .then(() => process.exit(0))
    .catch((err) => {
    logger.error('Import job failed', err);
    process.exit(1);
});
//# sourceMappingURL=importMapsPackage.js.map