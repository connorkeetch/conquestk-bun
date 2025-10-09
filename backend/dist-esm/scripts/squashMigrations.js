"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const dotenv_1 = __importDefault(require("dotenv"));
const pg_1 = require("pg");
dotenv_1.default.config({ path: (0, node_path_1.join)(__dirname, '../../.env.local') });
dotenv_1.default.config({ path: (0, node_path_1.join)(__dirname, '../../.env') });
dotenv_1.default.config();
function parseArgs(argv) {
    const opts = {
        output: 'backend/migrations/001_baseline_schema.sql',
        tempDb: false,
        yes: false,
        dropTemp: true,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--output' || arg === '-o') {
            const next = argv[i + 1];
            if (!next || next.startsWith('--')) {
                throw new Error('Missing value for --output');
            }
            opts.output = next;
            i += 1;
        }
        else if (arg === '--temp-db' || arg === '--tempdb') {
            opts.tempDb = true;
        }
        else if (arg === '--yes' || arg === '-y') {
            opts.yes = true;
        }
        else if (arg === '--no-drop-temp') {
            opts.dropTemp = false;
        }
    }
    return opts;
}
function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}
async function which(cmd) {
    return await new Promise((resolve) => {
        const s = (0, node_child_process_1.spawn)(process.platform === 'win32' ? 'where' : 'which', [cmd], {
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        let out = '';
        s.stdout.on('data', (d) => {
            out += d.toString();
        });
        s.on('close', (code) => {
            resolve(code === 0 ? out.trim().split(/\r?\n/)[0] : null);
        });
    });
}
function randomSuffix(len = 6) {
    return node_crypto_1.default.randomBytes(len).toString('hex').slice(0, len);
}
function parseDatabaseUrl(url) {
    const u = new URL(url);
    const host = u.hostname;
    const port = u.port ? Number(u.port) : 5432;
    const user = u.username || undefined;
    const password = u.password || undefined;
    const database = u.pathname.replace(/^\//, '') || undefined;
    const ssl = u.searchParams.has('sslmode')
        ? u.searchParams.get('sslmode') !== 'disable'
        : /\.proxy\.rlwy\.net$/.test(host) || /railway/.test(host);
    return { user, password, host, port, database, ssl, raw: url };
}
function makeConnString(base, overrideDb) {
    const u = new URL(base.raw);
    if (overrideDb)
        u.pathname = `/${overrideDb}`;
    return u.toString();
}
async function createTempDatabase(baseUrl) {
    const base = parseDatabaseUrl(baseUrl);
    const adminDb = base.database && base.database !== 'postgres' ? 'postgres' : base.database || 'postgres';
    const tempName = `conquestk_squash_${new Date()
        .toISOString()
        .replace(/[-:T.]/g, '')
        .slice(0, 12)}_${randomSuffix(4)}`;
    const adminUrl = makeConnString(base, adminDb);
    const client = new pg_1.Client({
        connectionString: adminUrl,
        ssl: base.ssl ? { rejectUnauthorized: false } : undefined,
    });
    await client.connect();
    try {
        await client.query(`CREATE DATABASE ${JSON.stringify(tempName).slice(1, -1).replace(/"/g, '')}`);
    }
    finally {
        await client.end();
    }
    const tempUrl = makeConnString(base, tempName);
    return { name: tempName, url: tempUrl };
}
async function dropDatabase(baseUrl, dbName) {
    const base = parseDatabaseUrl(baseUrl);
    const adminDb = base.database && base.database !== 'postgres' ? 'postgres' : base.database || 'postgres';
    const adminUrl = makeConnString(base, adminDb);
    const client = new pg_1.Client({
        connectionString: adminUrl,
        ssl: base.ssl ? { rejectUnauthorized: false } : undefined,
    });
    await client.connect();
    try {
        await client.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [dbName]);
        await client.query(`DROP DATABASE IF EXISTS ${JSON.stringify(dbName).slice(1, -1).replace(/"/g, '')}`);
    }
    finally {
        await client.end();
    }
}
async function runMigrationsAgainst(url) {
    await new Promise((resolve, reject) => {
        const p = (0, node_child_process_1.spawn)(process.execPath, [require.resolve('ts-node/dist/bin.js'), 'src/scripts/runMigration.ts'], {
            cwd: (0, node_path_1.join)(__dirname, '..', '..'),
            env: { ...process.env, DATABASE_URL: url },
            stdio: 'inherit',
        });
        p.on('close', (code) => {
            if (code === 0)
                resolve();
            else
                reject(new Error(`Migration process exited with code ${code}`));
        });
    });
}
async function pgDumpSchema(url, outPath) {
    const pgDumpPath = await which('pg_dump');
    if (!pgDumpPath) {
        throw new Error('pg_dump not found on PATH. Install PostgreSQL client tools to continue.');
    }
    const outDir = (0, node_path_1.dirname)(outPath);
    if (!(0, node_fs_1.existsSync)(outDir)) {
        (0, node_fs_1.mkdirSync)(outDir, { recursive: true });
    }
    await new Promise((resolve, reject) => {
        const args = [
            '--schema-only',
            '--no-owner',
            '--no-privileges',
            '--if-exists',
            '--clean',
            '--quote-all-identifiers',
            '--schema=public',
            url,
        ];
        const p = (0, node_child_process_1.spawn)(pgDumpPath, args, { stdio: ['ignore', 'pipe', 'inherit'] });
        let dump = '';
        p.stdout.on('data', (d) => {
            dump += d.toString();
        });
        p.on('close', (code) => {
            if (code !== 0)
                return reject(new Error(`pg_dump exit code ${code}`));
            const prelude = [
                'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
                'CREATE EXTENSION IF NOT EXISTS pgcrypto;',
                'CREATE EXTENSION IF NOT EXISTS citext;',
                'CREATE EXTENSION IF NOT EXISTS pg_trgm;',
                '',
            ].join('\n');
            const content = `${prelude}${dump}`;
            (0, node_fs_1.writeFileSync)(outPath, content, 'utf8');
            resolve();
        });
    });
}
async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const dbUrl = process.env.DATABASE_URL;
    assert(dbUrl, 'DATABASE_URL must be set in environment');
    if (!opts.yes) {
        throw new Error('Refusing to run without --yes acknowledgement. This operation creates/drops DBs when --temp-db is used and generates a new baseline file.');
    }
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Refusing to run in production NODE_ENV');
    }
    let sourceUrl = dbUrl;
    let createdTemp = null;
    if (opts.tempDb) {
        console.log('⏳ Creating temporary database for a clean baseline...');
        createdTemp = await createTempDatabase(dbUrl);
        console.log(`🆕 Temp DB: ${createdTemp.name}`);
        console.log('🔄 Applying migrations to temp DB...');
        await runMigrationsAgainst(createdTemp.url);
        sourceUrl = createdTemp.url;
    }
    else {
        console.log('ℹ️ Using current DATABASE_URL for schema dump (ensure it is fully migrated)');
    }
    const outPath = (0, node_path_1.join)(process.cwd(), opts.output);
    console.log(`📦 Dumping schema to ${opts.output} ...`);
    await pgDumpSchema(sourceUrl, outPath);
    console.log('✅ Baseline schema written');
    if (createdTemp && opts.dropTemp) {
        console.log('🧹 Dropping temporary database...');
        await dropDatabase(dbUrl, createdTemp.name);
    }
    console.log('\nNext steps:');
    console.log('  1) Review the generated baseline SQL and test it against a fresh DB.');
    console.log('  2) Create a new branch, archive the old migrations, and keep only:');
    console.log('     - The single baseline file you just generated');
    console.log('     - Any data seed files you explicitly still want (e.g., achievements)');
    console.log('  3) Reset schema_migrations in non-prod DBs: TRUNCATE schema_migrations;');
    console.log('  4) Run npm run migrate on a fresh DB to validate a clean bootstrap.');
}
main().catch((err) => {
    console.error('❌ Squash failed:', err?.message || err);
    process.exit(1);
});
//# sourceMappingURL=squashMigrations.js.map