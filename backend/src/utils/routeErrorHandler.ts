import * as Sentry from '@sentry/node'
import type { Request } from 'express'
import { getErrorMessage, toKnownError } from './errorHelpers'
import { logger } from './logger'

export function handleRouteError(
  error: unknown,
  req: Request,
  message: string,
  status = 500,
  context: Record<string, unknown> = {},
) {
  const normalizedError = toKnownError(error)

  logger.error('Route error', {
    path: req.originalUrl,
    method: req.method,
    status,
    message,
    error: getErrorMessage(normalizedError),
    stack: normalizedError.stack,
    ...context,
  })

  Sentry.captureException(normalizedError)

  return normalizedError
}
