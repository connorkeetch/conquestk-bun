import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import express from 'express'
import request from 'supertest'

process.env.DATABASE_URL ??= 'postgres://user:pass@localhost:5432/test'

const updatePreferencesMock = jest.fn()
const getPreferencesMock = jest.fn()

jest.mock('pg', () => ({
  __esModule: true,
  Pool: jest.fn(() => ({
    options: {
      max: 1,
      min: 0,
      idleTimeoutMillis: 0,
      connectionTimeoutMillis: 0,
    },
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
    query: jest.fn(async () => ({ rows: [], rowCount: 0 })),
    connect: jest.fn(async () => ({
      query: jest.fn(async () => ({ rows: [], rowCount: 0 })),
      release: jest.fn(),
    })),
    on: jest.fn(() => undefined),
    end: jest.fn(async () => undefined),
  })),
}))

jest.mock('../middleware/auth.js', () => ({
  authenticateToken: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.userId = 'test-user'
    next()
  },
}))

jest.mock('../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}))

jest.mock('../services/UserPreferencesService.js', () => ({
  __esModule: true,
  UserPreferencesService: jest.fn().mockImplementation(() => ({
    updatePreferences: updatePreferencesMock,
    getPreferences: getPreferencesMock,
  })),
}))

const createApp = () => {
  const app = express()
  app.use(express.json())
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const router = require('../routes/profile.js').default as express.Router
  app.use('/api/profile', router)
  return app
}

describe('Profile preferences route', () => {
  beforeEach(() => {
    updatePreferencesMock.mockReset()
    getPreferencesMock.mockReset()
    getPreferencesMock.mockResolvedValue(null)
  })

  it('ignores unsupported preference keys to avoid invalid column updates', async () => {
    updatePreferencesMock.mockResolvedValueOnce(null)

    const response = await request(createApp())
      .put('/api/profile/preferences')
      .send({ notificationsEnabled: false })

    expect(response.status).toBe(200)
    expect(updatePreferencesMock).toHaveBeenCalledWith('test-user', {})
    expect(response.body).toMatchObject({
      userId: 'test-user',
      notificationEnabled: true,
    })
  })
})
