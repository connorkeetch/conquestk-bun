process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://tester:tester@localhost:5432/risk_game_test'

import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import express from 'express'
import request from 'supertest'

const queryMock = jest.fn()

jest.mock(
  '../config/database.js',
  () => ({
    __esModule: true,
    query: queryMock,
    getPool: jest.fn().mockResolvedValue({ query: queryMock }),
    getClient: jest.fn().mockResolvedValue({ query: queryMock, release: jest.fn() }),
    transaction: jest.fn(),
  }),
  { virtual: true },
)

jest.mock(
  '../middleware/auth.js',
  () => ({
    authenticateToken: (
      req: express.Request,
      _res: express.Response,
      next: express.NextFunction,
    ) => {
      const headerUser = req.headers['x-test-user-id']
      req.userId = typeof headerUser === 'string' ? headerUser : 'test-user'
      const isAdminHeader = req.headers['x-test-admin']
      req.user = {
        id: req.userId,
        isAdmin: isAdminHeader === 'true',
      }
      next()
    },
  }),
  { virtual: true },
)

const logActivityMock = jest.fn()

jest.mock(
  '../middleware/adminAuth.js',
  () => ({
    requireAdmin: (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (req.headers['x-test-admin'] !== 'true') {
        res.status(403).json({ error: 'Admin access required' })
        return
      }

      const permissionsHeader = req.headers['x-test-permissions']
      const permissions = typeof permissionsHeader === 'string' ? permissionsHeader.split(',') : []

      req.adminUser = {
        userId: req.userId,
        roles: ['test-admin'],
        permissions,
        isSuperAdmin: permissions.includes('*'),
      }

      next()
    },
    requirePermission:
      (permission: string) =>
      (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const permissionsHeader = req.headers['x-test-permissions']
        const permissions = typeof permissionsHeader === 'string' ? permissionsHeader.split(',') : []

        if (permissions.includes(permission) || permissions.includes('*')) {
          next()
          return
        }

        res.status(403).json({ error: 'Insufficient permissions', required: permission })
      },
    logAdminActivity:
      () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => {
        logActivityMock()
        next()
      },
  }),
  { virtual: true },
)

jest.mock('../services/mapPermissionService', () => {
  class MapPermissionError extends Error {}
  return {
    mapPermissionService: {
      assertCanEditMap: jest.fn(),
      getMapEditorContext: jest.fn(),
    },
    MapPermissionError,
  }
})

jest.mock(
  '../services/mapApprovalService.js',
  () => ({
    __esModule: true,
    default: {
      getVersionHistory: jest.fn().mockResolvedValue([]),
      getVersionById: jest.fn().mockResolvedValue({
        id: 'version-1',
        mapId: 'map-1',
      }),
      submitForApproval: jest.fn(),
      getPendingApprovalRequests: jest.fn().mockResolvedValue([]),
      assignReviewer: jest.fn(),
      getReviewCriteria: jest.fn().mockResolvedValue([]),
      submitReviewResults: jest.fn(),
      publishVersion: jest.fn(),
      archiveMap: jest.fn(),
      getMapModerationHistory: jest.fn().mockResolvedValue([]),
      getApprovalStats: jest
        .fn()
        .mockResolvedValue({ total_requests: 0, approved: 0, rejected: 0, pending: 0 }),
    },
  }),
  { virtual: true },
)

const mapApprovalService = require('../services/mapApprovalService.js').default as {
  getVersionHistory: jest.Mock
  getPendingApprovalRequests: jest.Mock
}

const { mapPermissionService } = require('../services/mapPermissionService') as {
  mapPermissionService: {
    assertCanEditMap: jest.Mock
    getMapEditorContext: jest.Mock
  }
  MapPermissionError: new (message?: string) => Error
}

jest.mock(
  '../utils/errorHelpers.js',
  () => ({
    __esModule: true,
    getErrorMessage: jest.fn((error: unknown) =>
      error instanceof Error ? error.message : String(error),
    ),
  }),
  { virtual: true },
)

const createApp = () => {
  const app = express()
  app.use(express.json())

  const router = require('../routes/mapApproval').default as express.Router
  app.use('/api/map-approval', router)
  return app
}

describe('Map approval permissions', () => {
  beforeEach(() => {
    mapApprovalService.getVersionHistory.mockReset().mockResolvedValue([])
    mapApprovalService.getPendingApprovalRequests.mockReset().mockResolvedValue([])
    mapPermissionService.assertCanEditMap.mockReset().mockResolvedValue({})
    mapPermissionService.getMapEditorContext.mockReset()
    queryMock.mockReset()
    logActivityMock.mockReset()
  })

  it('requires admin access for approval queue', async () => {
    const response = await request(createApp()).get('/api/map-approval/approval-requests')

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'Admin access required' })
  })

  it('requires map_approval permission for approval queue', async () => {
    const response = await request(createApp())
      .get('/api/map-approval/approval-requests')
      .set('x-test-admin', 'true')

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'Insufficient permissions', required: 'map_approval' })
    expect(mapApprovalService.getPendingApprovalRequests).not.toHaveBeenCalled()
  })

  it('allows approval queue access with map_approval permission', async () => {
    mapApprovalService.getPendingApprovalRequests.mockResolvedValueOnce([{ id: 'req-1' }])

    const response = await request(createApp())
      .get('/api/map-approval/approval-requests')
      .set('x-test-admin', 'true')
      .set('x-test-permissions', 'map_approval')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ requests: [{ id: 'req-1' }] })
  })

  it('denies version history when user lacks map access', async () => {
    mapPermissionService.getMapEditorContext.mockResolvedValueOnce({
      exists: true,
      canEdit: false,
      isAdmin: false,
    })

    const response = await request(createApp())
      .get('/api/map-approval/maps/123/versions')
      .set('x-test-user-id', 'intruder')

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ message: 'Forbidden' })
    expect(mapApprovalService.getVersionHistory).not.toHaveBeenCalled()
  })

  it('returns version history for authorized editors', async () => {
    mapPermissionService.getMapEditorContext.mockResolvedValueOnce({
      exists: true,
      canEdit: true,
      isAdmin: false,
    })
    mapApprovalService.getVersionHistory.mockResolvedValueOnce([{ id: 'version-1' }])

    const response = await request(createApp())
      .get('/api/map-approval/maps/123/versions')
      .set('x-test-user-id', 'owner-user')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ versions: [{ id: 'version-1' }] })
    expect(mapApprovalService.getVersionHistory).toHaveBeenCalledWith('123')
  })
})
