import { beforeEach, describe, expect, it, jest } from '@jest/globals'

let mockQuery: jest.Mock
const mockCreateMap = jest.fn()
const mockDeleteStagingImage = jest.fn()
const mockCreateInAppNotification = jest.fn()
const mockLogAdminAction = jest.fn()
const mockNotificationDispatch = jest.fn()

jest.mock('../config/database', () => {
  mockQuery = jest.fn()
  return {
    query: (...args: unknown[]) => mockQuery(...args),
  }
})

const mockValidateMapPlayable = jest.fn().mockResolvedValue({ isValid: true, errors: [] })

jest.mock('../services/mapService', () => ({
  mapService: {
    createMap: (...args: unknown[]) => mockCreateMap(...args),
    validateMapPlayable: (...args: unknown[]) => mockValidateMapPlayable(...args),
  },
}))

jest.mock('../services/mapStagingService', () => ({
  mapStagingService: {
    deleteStagingImage: (...args: unknown[]) => mockDeleteStagingImage(...args),
  },
}))

jest.mock('../services/notificationService', () => ({
  __esModule: true,
  default: {
    createInAppNotification: (...args: unknown[]) => mockCreateInAppNotification(...args),
  },
}))

jest.mock('../services/adminService', () => ({
  adminService: {
    logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
  },
}))

jest.mock('../services/NotificationDispatcher', () => ({
  notificationDispatcher: {
    dispatch: (...args: unknown[]) => mockNotificationDispatch(...args),
  },
}))

describe('mapWorkflowService.approveMap', () => {
  let mapWorkflowService: typeof import('../services/mapWorkflowService.js').default

  beforeEach(() => {
    jest.resetModules()
    mockQuery = jest.fn()
    mockCreateMap.mockReset()
    mockDeleteStagingImage.mockReset()
    mockCreateInAppNotification.mockReset()
    mockCreateInAppNotification.mockResolvedValue(undefined)
    mockLogAdminAction.mockReset()
    mockLogAdminAction.mockResolvedValue(undefined)
    mockNotificationDispatch.mockReset()
    mockNotificationDispatch.mockResolvedValue(undefined)

    ;({ default: mapWorkflowService } = require('../services/mapWorkflowService'))
  })

  it('marks approved maps as public and notifies the creator', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ status: 'pending_review', is_public: false }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: 'approved', is_public: true }] })
      .mockResolvedValueOnce({ rows: [{ creator_id: 'creator-1', name: 'Galactic Fronts' }] })

    await mapWorkflowService.approveMap('map-1', 'admin-1', { notes: 'looks good' })

    expect(mockQuery).toHaveBeenCalledTimes(6)
    const updateSql = mockQuery.mock.calls[1]?.[0] as string
    expect(updateSql).toContain("SET status = 'approved'")
    expect(updateSql).toContain('is_public = TRUE')

    expect(mockLogAdminAction).toHaveBeenCalledWith(
      'admin-1',
      'map_approved',
      expect.objectContaining({
        mapId: 'map-1',
        before: expect.objectContaining({ is_public: false }),
        after: expect.objectContaining({ is_public: true }),
      }),
      'map',
      'map-1',
      undefined,
      undefined,
    )

    expect(mockCreateInAppNotification).toHaveBeenCalledWith(
      'creator-1',
      expect.objectContaining({
        type: 'map_approved',
        data: { mapId: 'map-1' },
      }),
    )

    expect(mockNotificationDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          status: 'approved',
          mapId: 'map-1',
        }),
      }),
    )
  })
})

describe('mapWorkflowService.publishDraft', () => {
  const nowIso = new Date().toISOString()
  let mapWorkflowService: typeof import('../services/mapWorkflowService.js').default

  beforeEach(() => {
    jest.resetModules()
    mockQuery = jest.fn()
    mockCreateMap.mockReset()
    mockDeleteStagingImage.mockReset()
    mockCreateInAppNotification.mockReset()
    mockCreateInAppNotification.mockResolvedValue(undefined)
    mockLogAdminAction.mockReset()
    mockLogAdminAction.mockResolvedValue(undefined)
    mockNotificationDispatch.mockReset()
    mockNotificationDispatch.mockResolvedValue(undefined)

    ;({ default: mapWorkflowService } = require('../services/mapWorkflowService'))
  })

  it('marks staging image for purge when publishing a draft', async () => {
    const draftRow = {
      id: 'draft-1',
      user_id: 'user-1',
      staging_image_id: 'staging-1',
      parent_map_id: null,
      name: 'Draft Map',
      description: null,
      map_data: '{}',
      territories: '[]',
      continents: '[]',
      adjacencies: '[]',
      capital_assignments: '{}',
      thumbnail_url: null,
      image_url: '/uploads/maps/staging/original.png',
      image_width: 1200,
      image_height: 800,
      validation_errors: '[]',
      tags: '[]',
      draft_status: 'editing',
      validation_status: null,
      is_public: false,
      auto_saved_at: null,
      last_edited_at: null,
      created_at: nowIso,
      updated_at: nowIso,
    }

    mockQuery.mockResolvedValueOnce({ rows: [draftRow] }).mockResolvedValueOnce({ rows: [] })

    mockCreateMap.mockResolvedValue({
      id: 'map-123',
      name: 'Published Map',
    })

    const submitSpy = jest.spyOn(mapWorkflowService, 'submitForReview').mockResolvedValue(undefined)

    await mapWorkflowService.publishDraft('draft-1', 'user-1')

    expect(mockDeleteStagingImage).toHaveBeenCalledWith('user-1', 'staging-1', true)

    expect(mockQuery).toHaveBeenCalledTimes(2)
    const updateSql = mockQuery.mock.calls[1]?.[0]
    expect(typeof updateSql).toBe('string')
    expect(updateSql).toContain('staging_image_id = NULL')

    expect(mockQuery.mock.calls[1]?.[1]).toEqual([
      'map-123',
      '/uploads/maps/staging/original.png',
      1200,
      800,
      'draft-1',
    ])

    expect(submitSpy).toHaveBeenCalledWith('map-123', 'user-1')

    submitSpy.mockRestore()
  })

  it('skips staging purge when no staging image is linked', async () => {
    const draftRow = {
      id: 'draft-2',
      user_id: 'user-1',
      staging_image_id: null,
      parent_map_id: null,
      name: 'Draft Map',
      description: null,
      map_data: '{}',
      territories: '[]',
      continents: '[]',
      adjacencies: '[]',
      capital_assignments: '{}',
      thumbnail_url: null,
      image_url: '/uploads/maps/staging/original.png',
      image_width: 1024,
      image_height: 768,
      validation_errors: '[]',
      tags: '[]',
      draft_status: 'editing',
      validation_status: null,
      is_public: false,
      auto_saved_at: null,
      last_edited_at: null,
      created_at: nowIso,
      updated_at: nowIso,
    }

    mockQuery.mockResolvedValueOnce({ rows: [draftRow] }).mockResolvedValueOnce({ rows: [] })

    mockCreateMap.mockResolvedValue({
      id: 'map-456',
      name: 'Published Map',
    })

    const submitSpy = jest.spyOn(mapWorkflowService, 'submitForReview').mockResolvedValue(undefined)

    await mapWorkflowService.publishDraft('draft-2', 'user-1')

    expect(mockDeleteStagingImage).not.toHaveBeenCalled()

    expect(mockQuery).toHaveBeenCalledTimes(2)
    expect(mockQuery.mock.calls[1]?.[1]).toEqual([
      'map-456',
      '/uploads/maps/staging/original.png',
      1024,
      768,
      'draft-2',
    ])

    expect(submitSpy).toHaveBeenCalledWith('map-456', 'user-1')

    submitSpy.mockRestore()
  })
})
