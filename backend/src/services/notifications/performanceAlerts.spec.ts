import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals'
import type { PerformanceAlert } from '../performanceMonitorService.js'
import { buildPerformanceAlertNotification } from './performanceAlerts.js'

describe('buildPerformanceAlertNotification', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date('2026-05-12T09:15:00Z') })
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  it('maps alert data into a dispatcher event with admin recipients', () => {
    const alert: PerformanceAlert = {
      id: 'alert-1',
      severity: 'critical',
      component: 'database',
      message: 'Database response time exceeded threshold',
      timestamp: Date.now(),
      resolved: false,
      metrics: { responseTime: 1500 },
    }

    const event = buildPerformanceAlertNotification(alert, ['admin-1', 'admin-2'])

    expect(event.type).toBe('ops.incident.threshold_exceeded')
    expect(event.severity).toBe('critical')
    expect(event.recipients).toEqual({ userIds: ['admin-1', 'admin-2'], roles: ['admin'] })
    expect(event.context).toMatchObject({
      alertId: 'alert-1',
      component: 'database',
      severity: 'critical',
    })
    expect(event.createdAt).toBe('2026-05-12T09:15:00.000Z')
    expect(event.cta?.[0]).toEqual({ label: 'View Ops Dashboard', url: '/admin/ops/alerts' })
  })

  it('falls back to role recipients when admin list is empty', () => {
    const alert: PerformanceAlert = {
      id: 'alert-2',
      severity: 'medium',
      component: 'queues',
      message: 'Queue backlog is elevated',
      timestamp: Date.now(),
      resolved: false,
    }

    const event = buildPerformanceAlertNotification(alert, [])

    expect(event.severity).toBe('warning')
    expect(event.recipients).toEqual({ roles: ['admin'] })
  })
})
