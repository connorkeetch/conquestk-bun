import fs from 'node:fs/promises';
import path, { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
dotenv.config();
import { query } from '../config/database.js';
async function runMigrations() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const migrationsDir = path.join(__dirname, '../../migrations');
    try {
        await query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        const files = await fs.readdir(migrationsDir);
        const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort();
        const executed = await query('SELECT filename FROM migrations');
        const executedFiles = new Set(executed.rows.map((r) => r.filename));
        for (const file of sqlFiles) {
            if (!executedFiles.has(file)) {
                const sqlContent = await fs.readFile(path.join(migrationsDir, file), 'utf-8');
                const statements = sqlContent
                    .split(';')
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0);
                for (const statement of statements) {
                    try {
                        await query(statement);
                    }
                    catch (error) {
                        if (error instanceof Error) {
                            const message = error.message ?? '';
                            const isIgnorable = message.includes('duplicate column') ||
                                message.includes('already exists') ||
                                (message.includes('syntax error') && statement.includes('IF NOT EXISTS'));
                            if (isIgnorable) {
                                continue;
                            }
                        }
                        throw error;
                    }
                }
                await query('INSERT INTO migrations (filename) VALUES ($1)', [file]);
            }
        }
    }
    catch (_error) {
        process.exit(1);
    }
}
try {
    const entryUrl = pathToFileURL(process.argv[1]).href;
    if (import.meta.url === entryUrl) {
        runMigrations().then(() => process.exit(0));
    }
}
catch {
}
export default runMigrations;
//# sourceMappingURL=runMigrations.js.map