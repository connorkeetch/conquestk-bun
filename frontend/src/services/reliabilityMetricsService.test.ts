import { beforeEach, describe, expect, it } from 'vitest'
import { reliabilityMetrics } from './reliabilityMetricsService'

describe('reliabilityMetrics lockstep resync tracking', () => {
  beforeEach(() => {
    reliabilityMetrics.resetForTest()
  })

  it('records and resolves resync lifecycle', () => {
    const traceId = 'room-1:trace-123'
    reliabilityMetrics.recordLockstepResync({
      traceId,
      roomId: 'room-1',
      reason: 'frame_gap',
      seq: 10,
      expectedSeq: 11,
    })

    let snapshot = reliabilityMetrics.getSnapshot()
    expect(snapshot.lockstepResyncs.total).toBe(1)
    expect(snapshot.lockstepResyncs.pending).toBe(1)
    expect(snapshot.lockstepResyncs.byReason.frame_gap).toBe(1)

    reliabilityMetrics.resolveLockstepResync(traceId, {
      success: true,
      roomId: 'room-1',
      reason: 'frame_gap',
    })

    snapshot = reliabilityMetrics.getSnapshot()
    expect(snapshot.lockstepResyncs.pending).toBe(0)
    expect(snapshot.lockstepResyncs.successes).toBe(1)
    expect(snapshot.lockstepResyncs.failures).toBe(0)
    expect(snapshot.lockstepResyncs.byReason.frame_gap).toBe(1)
  })

  it('tracks failed resync attempts', () => {
    const traceId = 'room-2:trace'
    reliabilityMetrics.recordLockstepResync({
      traceId,
      roomId: 'room-2',
      reason: 'checksum_mismatch',
    })

    reliabilityMetrics.resolveLockstepResync(traceId, {
      success: false,
      roomId: 'room-2',
      reason: 'checksum_mismatch',
      meta: { error: 'timeout' },
    })

    const snapshot = reliabilityMetrics.getSnapshot()
    expect(snapshot.lockstepResyncs.failures).toBe(1)
    expect(snapshot.lockstepResyncs.byReason.checksum_mismatch).toBe(1)
  })
})
