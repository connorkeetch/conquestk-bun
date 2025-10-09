"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const database_js_1 = require("../config/database.js");
async function runMigrations() {
    const migrationsDir = node_path_1.default.join(__dirname, '../../migrations');
    try {
        await (0, database_js_1.query)(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        const files = await promises_1.default.readdir(migrationsDir);
        const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort();
        const executed = await (0, database_js_1.query)('SELECT filename FROM migrations');
        const executedFiles = new Set(executed.rows.map((r) => r.filename));
        for (const file of sqlFiles) {
            if (!executedFiles.has(file)) {
                const sqlContent = await promises_1.default.readFile(node_path_1.default.join(migrationsDir, file), 'utf-8');
                const statements = sqlContent
                    .split(';')
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0);
                for (const statement of statements) {
                    try {
                        await (0, database_js_1.query)(statement);
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
                await (0, database_js_1.query)('INSERT INTO migrations (filename) VALUES ($1)', [file]);
            }
        }
    }
    catch (_error) {
        process.exit(1);
    }
}
if (require.main === module) {
    runMigrations().then(() => process.exit(0));
}
exports.default = runMigrations;
//# sourceMappingURL=runMigrations.js.map