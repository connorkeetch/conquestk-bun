process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://tester:tester@localhost:5432/risk_game_test'

import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import express from 'express'
import request from 'supertest'

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
  authenticateToken: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
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

const logActivityMock = jest.fn()

jest.mock('../middleware/adminAuth', () => ({
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
}))

jest.mock('../services/mapPermissionService', () => {
  const actual = jest.requireActual('../services/mapPermissionService')
  return {
    ...actual,
    mapPermissionService: {
      ...actual.mapPermissionService,
      assertCanEditMap: jest.fn(),
      getMapEditorContext: jest.fn(),
    },
  }
})

jest.mock('../services/adminService', () => ({
  adminService: {
    logAdminAction: jest.fn().mockResolvedValue(undefined),
    getActiveAdminUserIds: jest.fn().mockResolvedValue([]),
  },
}))

jest.mock('../services/notificationService', () => ({
  __esModule: true,
  default: {
    createInAppNotification: jest.fn().mockResolvedValue(undefined),
  },
}))

jest.mock('../services/NotificationDispatcher', () => ({
  notificationDispatcher: {
    dispatch: jest.fn().mockResolvedValue([]),
  },
}))

// Ensure map validation does not fail tests that don't set up territories
jest.mock('../services/mapService', () => ({
  mapService: {
    validateMapPlayable: jest.fn().mockResolvedValue({ isValid: true, errors: [] }),
  },
}))

const databaseModule = require('../config/database') as { query: jest.Mock }
const queryMock = databaseModule.query

const permissionsModule = require('../services/mapPermissionService') as {
  mapPermissionService: { assertCanEditMap: jest.Mock; getMapEditorContext: jest.Mock }
  MapPermissionError: new (message?: string) => Error
}

const adminServiceModule = require('../services/adminService') as {
  adminService: {
    logAdminAction: jest.Mock
    getActiveAdminUserIds: jest.Mock
  }
}

const notificationServiceModule = require('../services/notificationService').default as {
  createInAppNotification: jest.Mock
}

const notificationDispatcherModule = require('../services/NotificationDispatcher') as {
  notificationDispatcher: { dispatch: jest.Mock }
}

type MapWorkflowServiceInstance = typeof import('../services/mapWorkflowService.js').default

const mapWorkflowServiceInstance = require('../services/mapWorkflowService')
  .default as MapWorkflowServiceInstance

const createApp = () => {
  const app = express()
  app.use(express.json())

  const router = require('../routes/mapWorkflow').default as express.Router
  app.use('/api/workflow', router)
  return app
}

describe('Map workflow authorization', () => {
  beforeEach(() => {
    queryMock.mockReset()
    permissionsModule.mapPermissionService.assertCanEditMap.mockReset()
    permissionsModule.mapPermissionService.getMapEditorContext.mockReset()
    adminServiceModule.adminService.logAdminAction.mockClear()
    adminServiceModule.adminService.getActiveAdminUserIds.mockResolvedValue([])
    notificationServiceModule.createInAppNotification.mockClear()
    notificationDispatcherModule.notificationDispatcher.dispatch.mockClear()
    logActivityMock.mockClear()
  })

  it('returns 403 when submit for review is attempted without permissions', async () => {
    const { MapPermissionError } = permissionsModule
    permissionsModule.mapPermissionService.assertCanEditMap.mockRejectedValueOnce(
      new MapPermissionError('You do not have permission to edit this map'),
    )

    const response = await request(createApp())
      .post('/api/workflow/maps/11111111-1111-1111-1111-111111111111/submit')
      .set('x-test-user-id', 'intruder')

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'You do not have permission to edit this map' })
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('allows submit for review when editor has permissions', async () => {
    permissionsModule.mapPermissionService.assertCanEditMap.mockResolvedValueOnce({
      mapId: '22222222-2222-2222-2222-222222222222',
      exists: true,
      canEdit: true,
      isAdmin: false,
      isCreator: false,
      collaboratorRole: 'editor',
    })

    queryMock
      .mockResolvedValueOnce({ rowCount: 1 }) // update maps
      .mockResolvedValueOnce({ rows: [{ id: 'version-1' }] }) // latest version lookup
      .mockResolvedValueOnce({ rowCount: 1 }) // insert approval request
      .mockResolvedValueOnce({ rows: [{ name: 'Test Map' }] }) // select map name
      .mockResolvedValueOnce({
        rows: [{ id: 'notif-1', admin_id: null, created_at: new Date().toISOString() }],
      }) // insert admin notification
      .mockResolvedValue({ rowCount: 1 }) // fallback for logMapAction

    const response = await request(createApp())
      .post('/api/workflow/maps/22222222-2222-2222-2222-222222222222/submit')
      .set('x-test-user-id', 'editor-user')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      message: 'Map submitted for review successfully',
    })
    expect(queryMock).toHaveBeenCalled()
  })

  it('denies admin routes when user lacks admin header', async () => {
    const response = await request(createApp())
      .post('/api/workflow/admin/maps/33333333-3333-3333-3333-333333333333/approve')
      .set('x-test-user-id', 'not-admin')

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'Admin access required' })
    expect(logActivityMock).not.toHaveBeenCalled()
  })

  it('logs admin activity with before/after snapshot on approval', async () => {
    const mapId = '44444444-4444-4444-4444-444444444444'

    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            status: 'pending_review',
            is_public: false,
            reviewed_at: null,
            reviewed_by: null,
            review_notes: null,
            rejection_reason: null,
            is_featured: false,
          },
        ],
      }) // before snapshot
      .mockResolvedValueOnce({ rowCount: 1 }) // update maps
      .mockResolvedValueOnce({ rowCount: 1 }) // update queue
      .mockResolvedValueOnce({ rowCount: 1 }) // log map action
      .mockResolvedValueOnce({
        rows: [
          {
            status: 'approved',
            is_public: false,
            reviewed_at: new Date().toISOString(),
            reviewed_by: 'admin-user',
            review_notes: 'Looks good',
            rejection_reason: null,
            is_featured: false,
          },
        ],
      }) // after snapshot
      .mockResolvedValueOnce({ rows: [{ creator_id: 'owner-id', name: 'Approved Map' }] }) // map info

    const response = await request(createApp())
      .post(`/api/workflow/admin/maps/${mapId}/approve`)
      .set('x-test-user-id', 'admin-user')
      .set('x-test-admin', 'true')
      .set('x-test-permissions', 'map_approval')
      .send({ notes: 'Looks good' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      message: 'Map approved successfully',
    })

    const logCall = adminServiceModule.adminService.logAdminAction.mock.calls[0]
    expect(logCall[0]).toBe('admin-user')
    expect(logCall[1]).toBe('map_approved')
    expect(logCall[2]).toEqual(
      expect.objectContaining({
        mapId,
        notes: 'Looks good',
        before: expect.any(Object),
        after: expect.any(Object),
      }),
    )
    expect(logCall[3]).toBe('map')
    expect(logCall[4]).toBe(mapId)
    expect(typeof logCall[5]).toBe('string')
    const userAgent = logCall[6]
    expect(userAgent === undefined || typeof userAgent === 'string').toBe(true)
    expect(logActivityMock).toHaveBeenCalled()
  })

  it('denies map history access to users without edit permissions', async () => {
    permissionsModule.mapPermissionService.getMapEditorContext.mockResolvedValueOnce({
      mapId: '55555555-5555-5555-5555-555555555555',
      exists: true,
      canEdit: false,
      isAdmin: false,
      isCreator: false,
    })

    const response = await request(createApp())
      .get('/api/workflow/maps/55555555-5555-5555-5555-555555555555/history')
      .set('x-test-user-id', 'intruder')

    expect(response.status).toBe(403)
    expect(response.body).toEqual({
      error: 'You do not have permission to view this map history',
    })
  })

  it('returns map history for editors', async () => {
    permissionsModule.mapPermissionService.getMapEditorContext.mockResolvedValueOnce({
      mapId: '66666666-6666-6666-6666-666666666666',
      exists: true,
      canEdit: true,
      isAdmin: false,
      isCreator: true,
    })

    const historySpy = jest
      .spyOn(mapWorkflowServiceInstance, 'getMapHistory')
      .mockResolvedValueOnce([{ action: 'submitted' }])

    const response = await request(createApp())
      .get('/api/workflow/maps/66666666-6666-6666-6666-666666666666/history')
      .set('x-test-user-id', 'owner-user')

    expect(historySpy).toHaveBeenCalledWith('66666666-6666-6666-6666-666666666666')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ success: true, history: [{ action: 'submitted' }] })

    historySpy.mockRestore()
  })
})
