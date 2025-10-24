process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://tester:tester@localhost:5432/risk_game_test'

import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { NextFunction, Request, Response } from 'express'
import express from 'express'
import request from 'supertest'

type TestRequest = Request & {
  userId?: string
  user?: {
    id: string
    isAdmin?: boolean
  }
}

jest.mock('../config/database', () => {
  const queryMock = jest.fn()
  return {
    __esModule: true,
    query: queryMock,
    getPool: jest.fn().mockResolvedValue({ query: queryMock }),
    getClient: jest.fn().mockResolvedValue({ query: queryMock, release: jest.fn() }),
    transaction: jest.fn(),
  }
})

jest.mock('../middleware/auth', () => ({
  authenticateToken: (req: TestRequest, _res: Response, next: NextFunction) => {
    const headerUser = req.headers['x-test-user-id']
    req.userId = typeof headerUser === 'string' ? headerUser : 'test-user'
    const isAdminHeader = req.headers['x-test-admin']
    req.user = {
      id: req.userId,
      isAdmin: isAdminHeader === 'true',
    }
    next()
  },
}))

const databaseModule = require('../config/database') as {
  query: jest.Mock
}
const queryMock = databaseModule.query

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  let mapsRouter: express.Router | undefined
  jest.isolateModules(() => {
    const module = require('../routes/maps') as { default: express.Router }
    mapsRouter = module.default
  })

  if (!mapsRouter) {
    throw new Error('Failed to load maps router')
  }

  app.use('/api/maps', mapsRouter)
  return app
}

describe('Map permission enforcement', () => {
  beforeEach(() => {
    queryMock.mockReset()
  })

  it('returns 403 when updateMap is attempted without edit access', async () => {
    const mapId = '667b1615-2156-4999-969b-4599fa529c69'

    queryMock
      .mockResolvedValueOnce({ rows: [{ creator_id: 'owner-id' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })

    const response = await request(createApp())
      .put(`/api/maps/${mapId}`)
      .set('x-test-user-id', 'intruder')
      .field('name', 'Updated Map')

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'You do not have permission to edit this map' })
  })

  it('returns 404 when map is missing during update', async () => {
    const mapId = 'a98a2523-d38b-4348-a03a-fb96d87acf07'

    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 })

    const response = await request(createApp())
      .put(`/api/maps/${mapId}`)
      .set('x-test-user-id', 'editor')
      .field('name', 'Updated Map')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'Map not found' })
  })

  it('denies territory creation for non-authorized user', async () => {
    const mapId = '4158eeab-f47f-44ed-b373-0a8301d929f4'

    queryMock
      .mockResolvedValueOnce({ rows: [{ map_id: mapId }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ creator_id: 'different-owner' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })

    const response = await request(createApp())
      .post(`/api/maps/${mapId}/territories`)
      .set('x-test-user-id', 'unauthorized-user')
      .send({
        territoryId: 'territory-1',
        name: 'Forbidden Territory',
        sectorId: null,
        boundaryCoords: [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
          { x: 0, y: 5 },
        ],
        armyPosition: { x: 1, y: 1 },
      })

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'You do not have permission to edit this map' })
  })

  it('denies adjacency creation when user lacks territory access', async () => {
    const mapId = 'd0f1f81b-7218-4986-a253-605bde43a95b'

    queryMock
      .mockResolvedValueOnce({ rows: [{ map_id: mapId }, { map_id: mapId }], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [{ creator_id: 'another-owner' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })

    const response = await request(createApp())
      .post('/api/maps/adjacencies')
      .set('x-test-user-id', 'unauthorized-user')
      .send({
        fromTerritoryId: '8e5b9ede-6203-43a8-9002-ca85f6d15bc9',
        toTerritoryId: 'a5b4d32e-af53-49c0-9c4a-2677145be441',
        isBidirectional: true,
      })

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'You do not have permission to edit this map' })
  })

  it('returns 403 when deleting a map without ownership', async () => {
    const mapId = '2668aae8-6f89-466d-b135-9e24b875be91'

    queryMock
      .mockResolvedValueOnce({ rows: [{ creator_id: 'actual-owner' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })

    const response = await request(createApp())
      .delete(`/api/maps/${mapId}`)
      .set('x-test-user-id', 'unauthorized-user')

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'You do not have permission to edit this map' })
  })
})
