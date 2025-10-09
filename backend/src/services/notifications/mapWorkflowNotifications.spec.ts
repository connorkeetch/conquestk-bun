import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals'
import { buildMapWorkflowNotification } from './mapWorkflowNotifications.js'

describe('buildMapWorkflowNotification', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date('2026-05-12T08:00:00Z') })
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  it('builds an approval notification with creator recipients', () => {
    const event = buildMapWorkflowNotification({
      status: 'approved',
      mapId: 'map-123',
      mapName: 'Aurora Isles',
      adminUserId: 'admin-1',
      creatorUserId: 'creator-9',
      notes: 'Looks great',
    })

    expect(event.type).toBe('map.workflow.approved')
    expect(event.title).toBe('Map approved: Aurora Isles')
    expect(event.severity).toBe('info')
    expect(event.createdAt).toBe('2026-05-12T08:00:00.000Z')
    expect(event.recipients).toEqual({ userIds: ['creator-9'], roles: ['admin'] })
    expect(event.context).toMatchObject({
      mapId: 'map-123',
      status: 'approved',
      adminUserId: 'admin-1',
      notes: 'Looks great',
    })
    expect(event.cta?.[0]).toEqual({ label: 'View map', url: '/maps/map-123' })
  })

  it('builds a rejection notification without creator user id', () => {
    const event = buildMapWorkflowNotification({
      status: 'rejected',
      mapId: 'map-321',
      mapName: 'Frosthold',
      adminUserId: 'admin-2',
      rejectionReason: 'Missing continent definitions',
    })

    expect(event.type).toBe('map.workflow.rejected')
    expect(event.severity).toBe('warning')
    expect(event.recipients).toEqual({ roles: ['admin'] })
    expect(event.body).toContain('Missing continent definitions')
    expect(event.cta?.[0]).toEqual({ label: 'Review feedback', url: '/maps/map-321/edit' })
  })
})
