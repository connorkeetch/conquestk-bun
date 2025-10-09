"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Sentry = __importStar(require("@sentry/node"));
const dotenv_1 = __importDefault(require("dotenv"));
const logger_js_1 = require("./utils/logger.js");
if (process.env.NODE_ENV !== 'production') {
    dotenv_1.default.config();
}
if (process.env.SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',
        tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
        release: process.env.npm_package_version,
        sendDefaultPii: process.env.NODE_ENV !== 'production',
        profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
        beforeSend(event, hint) {
            if (process.env.NODE_ENV === 'production') {
                const originalException = hint?.originalException;
                const errorMessage = originalException instanceof Error
                    ? originalException.message
                    : typeof originalException === 'string'
                        ? originalException
                        : null;
                if (errorMessage?.includes('Validation')) {
                    return null;
                }
                if (event.exception?.values?.[0]?.value?.includes('404')) {
                    return null;
                }
            }
            return event;
        },
        beforeSendTransaction(event) {
            if (event.transaction === 'GET /health') {
                return null;
            }
            if (event.transaction === 'GET /test') {
                return null;
            }
            return event;
        },
    });
    logger_js_1.logger.info('✅ Sentry initialized for Sentry error tracking', {
        environment: process.env.NODE_ENV,
    });
}
else {
    logger_js_1.logger.info('ℹ️  Sentry DSN not provided - error tracking disabled');
}
exports.default = Sentry;
//# sourceMappingURL=instrument.js.map