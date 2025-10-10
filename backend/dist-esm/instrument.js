import * as Sentry from '@sentry/node';
import dotenv from 'dotenv';
import { logger } from './utils/logger.js';
if (process.env.NODE_ENV !== 'production') {
    dotenv.config();
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
    logger.info('✅ Sentry initialized for Sentry error tracking', {
        environment: process.env.NODE_ENV,
    });
}
else {
    logger.info('ℹ️  Sentry DSN not provided - error tracking disabled');
}
export default Sentry;
//# sourceMappingURL=instrument.js.map