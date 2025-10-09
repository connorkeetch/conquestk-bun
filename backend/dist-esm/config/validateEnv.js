"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENV_VARIABLES = void 0;
exports.validateEnvironmentVariables = validateEnvironmentVariables;
const logger_js_1 = require("../utils/logger.js");
const isPositiveInteger = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0;
};
const isValidPort = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 && parsed < 65536;
};
const ENV_VARIABLES = [
    {
        name: 'DATABASE_URL',
        required: true,
        description: 'PostgreSQL connection string',
        validator: (value) => value.startsWith('postgres://') || value.startsWith('postgresql://'),
    },
    {
        name: 'PORT',
        required: false,
        defaultValue: '5001',
        validator: isValidPort,
        description: 'Server port number',
    },
    {
        name: 'JWT_SECRET',
        required: true,
        description: 'Secret key for JWT token signing',
        validator: (value) => value.length >= 32,
    },
    {
        name: 'JWT_EXPIRES_IN',
        required: false,
        defaultValue: '7d',
        description: 'JWT token expiration time',
    },
    {
        name: 'SESSION_SECRET',
        required: false,
        description: 'Secret key for session encryption',
        validator: (value) => {
            if (value.startsWith('$'))
                return true;
            return value.length >= 32;
        },
    },
    {
        name: 'NODE_ENV',
        required: false,
        defaultValue: 'development',
        validator: (value) => ['development', 'production', 'staging', 'test'].includes(value),
        description: 'Application environment',
    },
    {
        name: 'DB_POOL_MAX',
        required: false,
        defaultValue: '20',
        validator: isPositiveInteger,
        description: 'Maximum database connections',
    },
    {
        name: 'DB_POOL_IDLE_TIMEOUT',
        required: false,
        defaultValue: '30000',
        validator: isPositiveInteger,
        description: 'Database idle connection timeout (ms)',
    },
    {
        name: 'DB_POOL_CONNECTION_TIMEOUT',
        required: false,
        defaultValue: '2000',
        validator: isPositiveInteger,
        description: 'Database connection timeout (ms)',
    },
    {
        name: 'DB_STATEMENT_TIMEOUT',
        required: false,
        defaultValue: '30000',
        validator: isPositiveInteger,
        description: 'Database statement timeout (ms)',
    },
    {
        name: 'DB_QUERY_TIMEOUT',
        required: false,
        defaultValue: '30000',
        validator: isPositiveInteger,
        description: 'Database query timeout (ms)',
    },
    {
        name: 'MAX_FILE_SIZE',
        required: false,
        defaultValue: '5242880',
        validator: isPositiveInteger,
        description: 'Maximum file upload size (bytes)',
    },
    {
        name: 'CORS_ORIGIN',
        required: false,
        defaultValue: 'http://localhost:5173',
        description: 'CORS allowed origins',
    },
    {
        name: 'REDIS_URL',
        required: false,
        description: 'Redis connection URL for sessions/caching',
    },
    {
        name: 'SMTP_HOST',
        required: false,
        description: 'SMTP server for sending emails',
    },
    {
        name: 'SMTP_PORT',
        required: false,
        defaultValue: '587',
        validator: (value) => Number.isInteger(Number.parseInt(value, 10)),
        description: 'SMTP server port',
    },
    {
        name: 'SMTP_USER',
        required: false,
        description: 'SMTP authentication username',
    },
    {
        name: 'SMTP_PASS',
        required: false,
        description: 'SMTP authentication password',
    },
    {
        name: 'ADMIN_EMAIL',
        required: false,
        description: 'Admin email for notifications',
        validator: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    },
    {
        name: 'ASSET_BUCKET',
        required: false,
        description: 'S3 bucket name for asset storage (e.g. Cloudflare R2)',
    },
    {
        name: 'ASSET_ENDPOINT',
        required: false,
        description: 'Custom endpoint for the S3-compatible storage',
    },
    {
        name: 'ASSET_ACCESS_KEY_ID',
        required: false,
        description: 'Access key for the asset storage bucket',
    },
    {
        name: 'ASSET_SECRET_ACCESS_KEY',
        required: false,
        description: 'Secret key for the asset storage bucket',
    },
    {
        name: 'ASSET_REGION',
        required: false,
        defaultValue: 'auto',
        description: 'Region/placement hint for the S3-compatible storage',
    },
    {
        name: 'PUBLIC_ASSET_BASE_URL',
        required: false,
        description: 'Public base URL for serving uploaded assets',
    },
];
exports.ENV_VARIABLES = ENV_VARIABLES;
function validateEnvironmentVariables() {
    logger_js_1.logger.info('🔍 Validating environment variables...');
    const errors = [];
    const warnings = [];
    const applied = [];
    if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
        if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith('$')) {
            errors.push('❌ Missing JWT_SECRET in production/staging. Set a stable 32+ char value.');
        }
        if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.startsWith('$')) {
            errors.push('❌ Missing SESSION_SECRET in production/staging. Set a stable 32+ char value.');
        }
    }
    for (const envVar of ENV_VARIABLES) {
        const value = process.env[envVar.name];
        if (envVar.required && !value) {
            errors.push(`❌ Missing required environment variable: ${envVar.name}${envVar.description ? ` (${envVar.description})` : ''}`);
            continue;
        }
        if (!value && envVar.defaultValue) {
            process.env[envVar.name] = envVar.defaultValue;
            applied.push(`✅ Applied default value for ${envVar.name}: ${envVar.defaultValue}`);
            continue;
        }
        if (!value) {
            continue;
        }
        if (envVar.validator && !envVar.validator(value)) {
            errors.push(`❌ Invalid value for ${envVar.name}: "${value}"${envVar.description ? ` (${envVar.description})` : ''}`);
            continue;
        }
        if (envVar.name.includes('SECRET') || envVar.name.includes('KEY')) {
            if (value === 'your-secret-here' || value === 'change-me' || value.length < 16) {
                warnings.push(`⚠️  Weak value for ${envVar.name} - please use a strong secret`);
            }
        }
    }
    const assetKeys = [
        'ASSET_BUCKET',
        'ASSET_ENDPOINT',
        'ASSET_ACCESS_KEY_ID',
        'ASSET_SECRET_ACCESS_KEY',
    ];
    const providedAssetKeys = assetKeys.filter((key) => process.env[key]);
    if (providedAssetKeys.length > 0 && providedAssetKeys.length < assetKeys.length) {
        errors.push('Asset storage configuration is incomplete. Provide ASSET_BUCKET, ASSET_ENDPOINT, ASSET_ACCESS_KEY_ID, and ASSET_SECRET_ACCESS_KEY, or remove them to fall back to local storage.');
    }
    if (providedAssetKeys.length === assetKeys.length && !process.env.PUBLIC_ASSET_BASE_URL) {
        warnings.push('PUBLIC_ASSET_BASE_URL is recommended when remote asset storage is configured to ensure URLs resolve correctly.');
    }
    if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
        if (!process.env.REDIS_URL) {
            warnings.push('⚠️  REDIS_URL not set - sessions will use memory storage (not recommended for production)');
        }
        if (!process.env.SMTP_HOST && !process.env.RESEND_API_KEY) {
            warnings.push('⚠️  Email service not configured (SMTP_HOST or RESEND_API_KEY missing)');
        }
    }
    if (applied.length > 0) {
        logger_js_1.logger.info('Applied defaults:');
        for (const msg of applied) {
            logger_js_1.logger.info(msg);
        }
    }
    if (warnings.length > 0) {
        logger_js_1.logger.warn('Environment warnings:');
        for (const msg of warnings) {
            logger_js_1.logger.warn(msg);
        }
    }
    if (errors.length > 0) {
        logger_js_1.logger.error('Environment validation failed:');
        for (const msg of errors) {
            logger_js_1.logger.error(msg);
        }
        if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
            logger_js_1.logger.error('🛑 Cannot start server with missing/invalid environment variables in production');
            process.exit(1);
        }
        else {
            logger_js_1.logger.warn('⚠️  Starting with missing/invalid environment variables (development mode)');
        }
    }
    else {
        logger_js_1.logger.info('✅ Environment variables validated successfully');
    }
    logger_js_1.logger.info(`📊 Environment Summary:
  - Mode: ${process.env.NODE_ENV || 'development'}
  - Port: ${process.env.PORT || '5001'}
  - Database: ${process.env.DATABASE_URL ? 'Configured' : 'Not configured'}
  - Redis: ${process.env.REDIS_URL ? 'Configured' : 'Not configured'}
  - Email: ${process.env.SMTP_HOST ? 'Configured' : 'Not configured'}`);
}
//# sourceMappingURL=validateEnv.js.map