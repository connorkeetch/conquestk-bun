import * as Sentry from '@sentry/node';
import { getErrorMessage, toKnownError } from './errorHelpers.js';
import { logger } from './logger.js';
export function handleRouteError(error, req, message, status = 500, context = {}) {
    const normalizedError = toKnownError(error);
    logger.error('Route error', {
        path: req.originalUrl,
        method: req.method,
        status,
        message,
        error: getErrorMessage(normalizedError),
        stack: normalizedError.stack,
        ...context,
    });
    Sentry.captureException(normalizedError);
    return normalizedError;
}
//# sourceMappingURL=routeErrorHandler.js.map