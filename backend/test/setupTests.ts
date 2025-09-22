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
