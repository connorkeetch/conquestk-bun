import { query } from '../../config/database.js'
import MapApprovalService from '../mapApprovalService.js'

type QueryMock = jest.MockedFunction<typeof query>

jest.mock('../../config/database.js', () => ({
  query: jest.fn(),
}))

describe('MapApprovalService schema alignment', () => {
  let queryMock: QueryMock

  beforeEach(() => {
    queryMock = query as QueryMock
    queryMock.mockReset()
  })

  it('creates versions using version_number and JSON columns only', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ version_number: 2 }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'version-3' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'version-3',
            map_id: 'map-123',
            version_number: 3,
            data: { name: 'Autumn Plains', changelog: 'Tweaked adjacency rules' },
            territories: [],
            sectors: [],
            adjacencies: [],
            change_summary: null,
            changed_by: 'user-456',
            created_at: '2025-01-03T12:00:00.000Z',
          },
        ],
        rowCount: 1,
      })

    const version = await MapApprovalService.createVersion('map-123', 'user-456', {
      name: 'Autumn Plains',
      changelog: 'Tweaked adjacency rules',
    })

    expect(version.versionNumber).toBe(3)
    expect(version.metadata.name).toBe('Autumn Plains')
    expect(version.metadata.changelog).toBe('Tweaked adjacency rules')

    const insertCall = queryMock.mock.calls[1]
    expect(insertCall?.[0]).toContain('INSERT INTO map_versions')
    expect(insertCall?.[0]).toContain('version_number')
    expect(insertCall?.[0]).toContain('data')
    expect(insertCall?.[0]).toContain('change_summary')
    expect(insertCall?.[0]).not.toContain('version_major')
    expect(insertCall?.[0]).not.toContain('status_id')
    expect(insertCall?.[0]).not.toContain('published_at')
    expect(insertCall?.[1]?.[1]).toBe(3)
  })

  it('submits versions for approval using maps.status and the approval request table', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'version-3',
            map_id: 'map-123',
            version_number: 3,
            data: { name: 'Autumn Plains' },
            territories: [],
            sectors: [],
            adjacencies: [],
            change_summary: null,
            changed_by: 'user-456',
            created_at: '2025-01-03T12:00:00.000Z',
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'approval-789' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'approval-789',
            version_id: 'version-3',
            requester_id: 'user-456',
            assigned_moderator_id: null,
            submission_notes: null,
            priority_level: 'normal',
            estimated_review_time: null,
            review_started_at: null,
            review_completed_at: null,
            decision: null,
            moderator_feedback: null,
            created_at: '2025-01-04T12:00:00.000Z',
            updated_at: '2025-01-04T12:00:00.000Z',
            map_id: 'map-123',
            version_number: 3,
            version_name: 'Autumn Plains',
            requester_username: 'connor',
          },
        ],
        rowCount: 1,
      })

    const approval = await MapApprovalService.submitForApproval(
      'version-3',
      'user-456',
      'Please review',
    )

    expect(approval.versionNumber).toBe(3)
    expect(approval.mapId).toBe('map-123')
    expect(approval.priorityLevel).toBe('normal')

    const updateCall = queryMock.mock.calls[2]
    expect(updateCall?.[0]).toContain('UPDATE maps')
    expect(updateCall?.[0]).toContain("SET status = 'pending_review'")
    expect(updateCall?.[0]).not.toContain('status_id')

    const insertCall = queryMock.mock.calls[3]
    expect(insertCall?.[0]).toContain('INSERT INTO map_approval_requests')
    expect(insertCall?.[0]).toContain('version_id')
    expect(insertCall?.[0]).not.toContain('status_id')
  })
})
