import { Pool } from 'pg';
import { logger } from '../utils/logger.js';
function convertQuestionMarksToPgPlaceholders(sql, params) {
    let placeholderIndex = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let converted = '';
    for (let i = 0; i < sql.length; i++) {
        const char = sql[i];
        if (char === "'" && !inDoubleQuote) {
            converted += char;
            if (inSingleQuote && sql[i + 1] === "'") {
                converted += "'";
                i++;
                continue;
            }
            inSingleQuote = !inSingleQuote;
            continue;
        }
        if (char === '"' && !inSingleQuote) {
            converted += char;
            if (inDoubleQuote && sql[i + 1] === '"') {
                converted += '"';
                i++;
                continue;
            }
            inDoubleQuote = !inDoubleQuote;
            continue;
        }
        if (!inSingleQuote && !inDoubleQuote && char === '?') {
            placeholderIndex++;
            converted += `$${placeholderIndex}`;
            continue;
        }
        converted += char;
    }
    if (placeholderIndex !== params.length) {
        logger.warn('Converted parameter count does not match supplied values', {
            sql,
            expected: placeholderIndex,
            provided: params.length,
        });
    }
    return converted;
}
let pgPool = null;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    logger.error('❌ DATABASE_URL is required for PostgreSQL connection');
    throw new Error('DATABASE_URL environment variable is not set');
}
try {
    logger.info('🔧 Initializing PostgreSQL connection pool');
    const isRailway = databaseUrl.includes('railway');
    const connectionTimeout = isRailway
        ? 15000
        : parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '5000', 10);
    const isProduction = process.env.NODE_ENV === 'production';
    pgPool = new Pool({
        connectionString: databaseUrl,
        max: parseInt(process.env.DB_POOL_MAX || (isProduction ? '25' : '15'), 10),
        min: parseInt(process.env.DB_POOL_MIN || (isProduction ? '5' : '2'), 10),
        idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || (isProduction ? '60000' : '30000'), 10),
        connectionTimeoutMillis: connectionTimeout,
        statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000', 10),
        query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000', 10),
        application_name: 'conquestk-backend',
        ssl: isRailway || isProduction ? { rejectUnauthorized: false } : undefined,
        keepAlive: isRailway,
        keepAliveInitialDelayMillis: isRailway ? 10000 : 0,
    });
    logger.info(`📊 Database config: Railway=${isRailway}, Timeout=${connectionTimeout}ms, SSL=${isRailway || isProduction}, Pool: ${pgPool.options.min}-${pgPool.options.max}`);
    pgPool.on('connect', (_client) => {
        if (pgPool) {
            logger.debug(`🔌 New client connected. Pool: ${pgPool.totalCount} total, ${pgPool.idleCount} idle, ${pgPool.waitingCount} waiting`);
        }
    });
    pgPool.on('error', (err, _client) => {
        logger.error('❌ Unexpected error on idle client:', err);
    });
    pgPool.on('remove', (_client) => {
        if (pgPool) {
            logger.debug(`🔌 Client removed. Pool: ${pgPool.totalCount} total, ${pgPool.idleCount} idle`);
        }
    });
    const shouldTestConnection = process.env.NODE_ENV !== 'test' && process.env.SKIP_DB_CONNECTION_TEST !== 'true';
    if (shouldTestConnection) {
        pgPool.query('SELECT 1', (err) => {
            if (err) {
                logger.error('❌ PostgreSQL connection test failed:', err);
                throw err;
            }
            logger.info('✅ PostgreSQL connection established');
        });
    }
    else {
        logger.debug('ℹ️ Skipping PostgreSQL connection test in test environment');
    }
}
catch (error) {
    logger.error('❌ Failed to create PostgreSQL pool:', error);
    throw error;
}
export async function query(text, params, options) {
    const executor = options?.client ?? pgPool;
    if (!executor) {
        throw new Error('Database connection not available');
    }
    try {
        let preparedText = text;
        const values = params ? [...params] : undefined;
        if (values && values.length > 0 && text.includes('?')) {
            preparedText = convertQuestionMarksToPgPlaceholders(text, values);
        }
        const queryValues = values ? [...values] : undefined;
        const result = await executor.query(preparedText, queryValues);
        return {
            rows: result.rows,
            rowCount: result.rowCount,
        };
    }
    catch (error) {
        logger.error('Query error:', error);
        throw error;
    }
}
export async function transaction(callback) {
    if (!pgPool) {
        throw new Error('Database connection not available');
    }
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
export async function withClient(callback, options = {}) {
    if (options.client) {
        return await callback(options.client);
    }
    if (!pgPool) {
        throw new Error('Database connection not available');
    }
    const client = await pgPool.connect();
    try {
        return await callback(client);
    }
    finally {
        client.release();
    }
}
export async function initDatabase() {
    logger.info('📊 Checking database tables...');
    try {
        const result = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      )
    `);
        if (result.rows[0]?.exists) {
            logger.info('✅ Database tables verified');
        }
        else {
            logger.warn('⚠️  Database tables not found. Run migrations to create them.');
        }
    }
    catch (error) {
        logger.error('❌ Database initialization failed:', error);
        throw error;
    }
}
export async function closeDatabase() {
    if (pgPool) {
        await pgPool.end();
        logger.info('🔌 Database connection closed');
    }
}
export function buildUpdateQuery(table, updates, conditions) {
    if (Object.keys(updates).length === 0) {
        throw new Error('buildUpdateQuery: updates object cannot be empty');
    }
    if (Object.keys(conditions).length === 0) {
        throw new Error('buildUpdateQuery: conditions object cannot be empty');
    }
    const updateParts = [];
    const conditionParts = [];
    const values = [];
    let paramCounter = 1;
    for (const [key, value] of Object.entries(updates)) {
        if (!/^[a-z_][a-z0-9_]*$/i.test(key)) {
            throw new Error(`buildUpdateQuery: Invalid column name format: ${key}`);
        }
        updateParts.push(`${key} = $${paramCounter}`);
        values.push(value);
        paramCounter++;
    }
    for (const [key, value] of Object.entries(conditions)) {
        if (!/^[a-z_][a-z0-9_]*$/i.test(key)) {
            throw new Error(`buildUpdateQuery: Invalid column name format: ${key}`);
        }
        conditionParts.push(`${key} = $${paramCounter}`);
        values.push(value);
        paramCounter++;
    }
    if (!/^[a-z_][a-z0-9_]*$/i.test(table)) {
        throw new Error(`buildUpdateQuery: Invalid table name format: ${table}`);
    }
    const text = `
    UPDATE ${table}
    SET ${updateParts.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE ${conditionParts.join(' AND ')}
  `;
    return { text, values };
}
export function buildInsertQuery(table, data, returning = '*') {
    if (Object.keys(data).length === 0) {
        throw new Error('buildInsertQuery: data object cannot be empty');
    }
    const columns = [];
    const placeholders = [];
    const values = [];
    let paramCounter = 1;
    for (const [key, value] of Object.entries(data)) {
        if (!/^[a-z_][a-z0-9_]*$/i.test(key)) {
            throw new Error(`buildInsertQuery: Invalid column name format: ${key}`);
        }
        columns.push(key);
        placeholders.push(`$${paramCounter}`);
        values.push(value);
        paramCounter++;
    }
    if (!/^[a-z_][a-z0-9_]*$/i.test(table)) {
        throw new Error(`buildInsertQuery: Invalid table name format: ${table}`);
    }
    if (returning !== '*' && !/^[a-z_][a-z0-9_,\s]*$/i.test(returning)) {
        throw new Error(`buildInsertQuery: Invalid RETURNING clause format: ${returning}`);
    }
    const text = `
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES (${placeholders.join(', ')})
    RETURNING ${returning}
  `;
    return { text, values };
}
export async function getClient() {
    if (!pgPool) {
        throw new Error('Database connection not available');
    }
    return await pgPool.connect();
}
export function getPool() {
    if (!pgPool) {
        throw new Error('Database connection not available');
    }
    return pgPool;
}
export function getPoolMetrics() {
    if (!pgPool) {
        return { error: 'Pool not initialized' };
    }
    return {
        totalCount: pgPool.totalCount,
        idleCount: pgPool.idleCount,
        waitingCount: pgPool.waitingCount,
        config: {
            max: pgPool.options.max,
            min: pgPool.options.min,
            idleTimeoutMillis: pgPool.options.idleTimeoutMillis,
            connectionTimeoutMillis: pgPool.options.connectionTimeoutMillis ?? null,
        },
        utilization: pgPool.totalCount > 0
            ? `${(((pgPool.totalCount - pgPool.idleCount) / pgPool.totalCount) * 100).toFixed(1)}%`
            : '0%',
    };
}
export default { query, transaction, initDatabase, closeDatabase, getClient };
//# sourceMappingURL=database.js.map