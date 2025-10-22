/**
 * Unit tests for lockstep configuration
 *
 * Phase 1 of lockstep architecture refactor
 * See: docs/planning/lockstep-architecture-refactor.md
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { LOCKSTEP_CONFIG, lockstepMetrics } from '../lockstep'

describe('Lockstep Configuration', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv }
    lockstepMetrics.reset()
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
  })

  describe('LOCKSTEP_CONFIG', () => {
    it('should default LOCKSTEP_ONLY to false when not set', () => {
      delete process.env.LOCKSTEP_ONLY
      // Re-import to get fresh config with new env
      jest.resetModules()
      const { LOCKSTEP_CONFIG: freshConfig } = require('../lockstep')
      expect(freshConfig.LOCKSTEP_ONLY).toBe(false)
    })

    it('should set LOCKSTEP_ONLY to true when env is "true"', () => {
      process.env.LOCKSTEP_ONLY = 'true'
      jest.resetModules()
      const { LOCKSTEP_CONFIG: freshConfig } = require('../lockstep')
      expect(freshConfig.LOCKSTEP_ONLY).toBe(true)
    })

    it('should default MAX_FRAMES to 2000 when not set', () => {
      delete process.env.LOCKSTEP_MAX_FRAMES
      jest.resetModules()
      const { LOCKSTEP_CONFIG: freshConfig } = require('../lockstep')
      expect(freshConfig.MAX_FRAMES).toBe(2000)
    })

    it('should parse MAX_FRAMES from environment', () => {
      process.env.LOCKSTEP_MAX_FRAMES = '5000'
      jest.resetModules()
      const { LOCKSTEP_CONFIG: freshConfig } = require('../lockstep')
      expect(freshConfig.MAX_FRAMES).toBe(5000)
    })

    it('should default ENABLE_CHECKSUMS to true when not set', () => {
      delete process.env.LOCKSTEP_CHECKSUMS
      jest.resetModules()
      const { LOCKSTEP_CONFIG: freshConfig } = require('../lockstep')
      expect(freshConfig.ENABLE_CHECKSUMS).toBe(true)
    })

    it('should set ENABLE_CHECKSUMS to false when env is "false"', () => {
      process.env.LOCKSTEP_CHECKSUMS = 'false'
      jest.resetModules()
      const { LOCKSTEP_CONFIG: freshConfig } = require('../lockstep')
      expect(freshConfig.ENABLE_CHECKSUMS).toBe(false)
    })
  })

  describe('lockstepMetrics', () => {
    it('should start with zero counters', () => {
      expect(lockstepMetrics.snapshotsSaved).toBe(0)
      expect(lockstepMetrics.framesEmitted).toBe(0)
    })

    it('should increment snapshotsSaved when recordSnapshotSkipped is called', () => {
      lockstepMetrics.recordSnapshotSkipped()
      expect(lockstepMetrics.snapshotsSaved).toBe(1)

      lockstepMetrics.recordSnapshotSkipped()
      expect(lockstepMetrics.snapshotsSaved).toBe(2)
    })

    it('should increment framesEmitted when recordFrameEmitted is called', () => {
      lockstepMetrics.recordFrameEmitted()
      expect(lockstepMetrics.framesEmitted).toBe(1)

      lockstepMetrics.recordFrameEmitted()
      expect(lockstepMetrics.framesEmitted).toBe(2)
    })

    it('should return correct stats with zero values', () => {
      const stats = lockstepMetrics.getStats()
      expect(stats.snapshotsSaved).toBe(0)
      expect(stats.framesEmitted).toBe(0)
      expect(stats.bandwidthSavingPercent).toBe('0.00')
    })

    it('should calculate bandwidth saving percentage correctly', () => {
      // 50% saving: 5 snapshots saved, 5 frames emitted
      lockstepMetrics.recordSnapshotSkipped()
      lockstepMetrics.recordSnapshotSkipped()
      lockstepMetrics.recordSnapshotSkipped()
      lockstepMetrics.recordSnapshotSkipped()
      lockstepMetrics.recordSnapshotSkipped()
      lockstepMetrics.recordFrameEmitted()
      lockstepMetrics.recordFrameEmitted()
      lockstepMetrics.recordFrameEmitted()
      lockstepMetrics.recordFrameEmitted()
      lockstepMetrics.recordFrameEmitted()

      const stats = lockstepMetrics.getStats()
      expect(stats.snapshotsSaved).toBe(5)
      expect(stats.framesEmitted).toBe(5)
      expect(stats.bandwidthSavingPercent).toBe('50.00')
    })

    it('should calculate 80% bandwidth saving correctly', () => {
      // 80% saving: 8 snapshots saved, 2 frames emitted
      for (let i = 0; i < 8; i++) {
        lockstepMetrics.recordSnapshotSkipped()
      }
      for (let i = 0; i < 2; i++) {
        lockstepMetrics.recordFrameEmitted()
      }

      const stats = lockstepMetrics.getStats()
      expect(stats.snapshotsSaved).toBe(8)
      expect(stats.framesEmitted).toBe(2)
      expect(stats.bandwidthSavingPercent).toBe('80.00')
    })

    it('should reset all counters when reset is called', () => {
      lockstepMetrics.recordSnapshotSkipped()
      lockstepMetrics.recordSnapshotSkipped()
      lockstepMetrics.recordFrameEmitted()

      lockstepMetrics.reset()

      expect(lockstepMetrics.snapshotsSaved).toBe(0)
      expect(lockstepMetrics.framesEmitted).toBe(0)

      const stats = lockstepMetrics.getStats()
      expect(stats.bandwidthSavingPercent).toBe('0.00')
    })
  })
})
