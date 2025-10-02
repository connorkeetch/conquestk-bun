import { afterAll, jest } from '@jest/globals'

const noop = jest.fn()

const mockLogger = {
  info: noop,
  warn: noop,
  error: noop,
  debug: noop,
  child: jest.fn().mockImplementation(() => mockLogger),
}

jest.mock('../src/utils/logger', () => ({
  logger: mockLogger,
}))

process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/conquestk_test'

// Ensure background timers from rate limiter don't keep Jest alive
afterAll(async () => {
  try {
    const mod = await import('../src/middleware/rateLimiter')
    if (typeof mod.stopRateLimiterCleanup === 'function') {
      mod.stopRateLimiterCleanup()
    }
  } catch {
    // noop
  }
})
