"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ quiet: true });
const database_js_1 = require("../config/database.js");
const migrationRunner_js_1 = require("../utils/migrationRunner.js");
const migrationTracker_js_1 = require("../utils/migrationTracker.js");
async function runMigration() {
    try {
        await (0, database_js_1.initDatabase)();
        const migrationTracker = new migrationTracker_js_1.MigrationTracker();
        const migrationRunner = new migrationRunner_js_1.MigrationRunner(migrationTracker);
        await migrationRunner.runPendingMigrations();
        process.exit(0);
    }
    catch (_error) {
        process.exit(1);
    }
}
runMigration();
//# sourceMappingURL=runMigration.js.map