import { beforeEach, describe, expect, it, jest } from '@jest/globals'

let mockQuery: jest.Mock
const mockCreateMap = jest.fn()
const mockDeleteStagingImage = jest.fn()

jest.mock('../config/database', () => {
  mockQuery = jest.fn()
  return {
    query: (...args: unknown[]) => mockQuery(...args),
  }
})

jest.mock('../services/mapService', () => ({
  mapService: {
    createMap: (...args: unknown[]) => mockCreateMap(...args),
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
    createInAppNotification: jest.fn(),
  },
}))

describe('mapWorkflowService.publishDraft', () => {
  const nowIso = new Date().toISOString()
  let mapWorkflowService: typeof import('../services/mapWorkflowService').default

  beforeEach(() => {
    jest.resetModules()
    mockQuery = jest.fn()
    mockCreateMap.mockReset()
    mockDeleteStagingImage.mockReset()

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
