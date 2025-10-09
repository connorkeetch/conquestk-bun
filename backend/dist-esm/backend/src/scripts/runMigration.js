import dotenv from 'dotenv';
dotenv.config({ quiet: true });
import { initDatabase } from '../config/database.js';
import { MigrationRunner } from '../utils/migrationRunner.js';
import { MigrationTracker } from '../utils/migrationTracker.js';
async function runMigration() {
    try {
        await initDatabase();
        const migrationTracker = new MigrationTracker();
        const migrationRunner = new MigrationRunner(migrationTracker);
        await migrationRunner.runPendingMigrations();
        process.exit(0);
    }
    catch (_error) {
        process.exit(1);
    }
}
runMigration();
//# sourceMappingURL=runMigration.js.map