import fs from 'node:fs';
import path from 'node:path';
import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const FRONTEND_SRC = path.join(PROJECT_ROOT, 'frontend', 'src');
const BACKEND_SRC = path.join(PROJECT_ROOT, 'backend', 'src');
const EPHEMERAL_FRONTEND_ONLY = new Set(['gunts_prescriptions']);
const FILE_EXTENSIONS = new Set(['.ts', '.tsx']);
function walk(dir, files = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, files);
        }
        else if (FILE_EXTENSIONS.has(path.extname(entry.name))) {
            files.push(full);
        }
    }
    return files;
}
function scanFiles() {
    const usedFromCalls = new Set();
    const constantsMap = new Map();
    try {
        const constantsPath = path.join(FRONTEND_SRC, 'constants', 'featureFlags.ts');
        const content = fs.readFileSync(constantsPath, 'utf8');
        const objectLiteralMatch = content.match(/export const FEATURE_FLAGS\s*=\s*\{([\s\S]*?)\}\s*as const/);
        if (objectLiteralMatch) {
            const body = objectLiteralMatch[1];
            const entryRegex = /(\w+)\s*:\s*'([^']+)'/g;
            for (const m of body.matchAll(entryRegex)) {
                constantsMap.set(m[1], m[2]);
            }
        }
    }
    catch (err) {
        logger.warn('Failed to parse FEATURE_FLAGS constants; continuing with call-site scan only', err);
    }
    const allFiles = [...walk(FRONTEND_SRC), ...walk(BACKEND_SRC)];
    const feFeatureRef = /useFeatureFlag\(\s*FEATURE_FLAGS\.(\w+)\s*\)/g;
    const feLiteralRef = /useFeatureFlag\(\s*['"]([a-zA-Z0-9_:\-.]+)['"]\s*\)/g;
    const beLiteralRef = /evaluateFlagByName\(\s*['"]([a-zA-Z0-9_:\-.]+)['"]\s*(?:,|\))/g;
    for (const file of allFiles) {
        const text = fs.readFileSync(file, 'utf8');
        for (const m of text.matchAll(feFeatureRef)) {
            const key = m[1];
            const name = constantsMap.get(key);
            if (name)
                usedFromCalls.add(name);
        }
        for (const m of text.matchAll(feLiteralRef)) {
            usedFromCalls.add(m[1]);
        }
        for (const m of text.matchAll(beLiteralRef)) {
            usedFromCalls.add(m[1]);
        }
    }
    for (const value of constantsMap.values())
        usedFromCalls.add(value);
    for (const ephemeral of EPHEMERAL_FRONTEND_ONLY)
        usedFromCalls.delete(ephemeral);
    return { usedFromCalls, constantsMap };
}
async function getDbFlags() {
    const result = await query('SELECT flag_name FROM feature_flags');
    return new Set(result.rows.map((r) => r.flag_name));
}
function inferCategory(flag) {
    if (flag.startsWith('ui_'))
        return 'ui';
    if (flag.startsWith('gameplay_'))
        return 'gameplay';
    if (flag.startsWith('experimental_'))
        return 'experimental';
    return 'ui';
}
async function insertMissing(flags) {
    if (flags.length === 0)
        return;
    for (const flag of flags) {
        try {
            await query(`INSERT INTO feature_flags (flag_name, description, access_level, category, is_enabled, rollout_percentage, target_criteria)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (flag_name) DO NOTHING`, [
                flag,
                `Auto-created by flags:check for ${flag}`,
                'internal',
                inferCategory(flag),
                false,
                0,
                JSON.stringify({}),
            ]);
            console.log(`Created flag: ${flag}`);
        }
        catch (err) {
            console.error(`Failed to create flag ${flag}:`, err);
        }
    }
}
async function main() {
    const apply = process.argv.includes('--apply') || process.argv.includes('--fix');
    const { usedFromCalls } = scanFiles();
    const dbFlags = await getDbFlags();
    const missing = Array.from(usedFromCalls).filter((f) => !dbFlags.has(f));
    const orphans = Array.from(dbFlags).filter((f) => !usedFromCalls.has(f));
    console.log('— Feature Flag Consistency Report —');
    console.log(`Used in code: ${usedFromCalls.size}`);
    console.log(`In database: ${dbFlags.size}`);
    if (missing.length > 0) {
        console.log('\nMissing in DB (required by code):');
        missing.sort().forEach((f) => {
            console.log(`  - ${f}`);
        });
    }
    else {
        console.log('\nNo missing flags detected.');
    }
    if (orphans.length > 0) {
        console.log('\nOrphaned in DB (not referenced in code):');
        orphans.sort().forEach((f) => {
            console.log(`  - ${f}`);
        });
    }
    else {
        console.log('\nNo orphaned flags detected.');
    }
    if (apply && missing.length > 0) {
        console.log('\nApplying fixes: creating missing flags with safe defaults...');
        await insertMissing(missing);
    }
}
main()
    .then(() => process.exit(0))
    .catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=checkFeatureFlags.js.map