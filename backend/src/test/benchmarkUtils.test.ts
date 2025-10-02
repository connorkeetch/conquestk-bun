import { comparePerformance, type PerformanceSnapshot } from '../utils/benchmarkUtils'

describe('comparePerformance', () => {
  it('handles zero baseline metrics without producing infinite values', () => {
    const baseline: PerformanceSnapshot = {
      avgResponseTime: 120,
      requestsPerSecond: 0,
      errorRate: 0,
    }
    const current: PerformanceSnapshot = {
      avgResponseTime: 150,
      requestsPerSecond: 200,
      errorRate: 1,
    }

    const result = comparePerformance(baseline, current)

    expect(Number.isFinite(result.throughput.change)).toBe(true)
    expect(result.throughput.improvement).toBe(true)

    expect(Number.isFinite(result.errorRate.change)).toBe(true)
    expect(result.errorRate.improvement).toBe(false)
    expect(result.errorRate.change).toBe(1)

    expect(Number.isFinite(result.responseTime.change)).toBe(true)
    expect(result.responseTime.improvement).toBe(false)
  })

  it('returns neutral change when both snapshots are zeroed', () => {
    const baseline: PerformanceSnapshot = {
      avgResponseTime: 0,
      requestsPerSecond: 0,
      errorRate: 0,
    }
    const current: PerformanceSnapshot = {
      avgResponseTime: 0,
      requestsPerSecond: 0,
      errorRate: 0,
    }

    const result = comparePerformance(baseline, current)

    expect(result.responseTime).toEqual({ change: 0, improvement: false })
    expect(result.throughput).toEqual({ change: 0, improvement: false })
    expect(result.errorRate).toEqual({ change: 0, improvement: false })
  })
})
