/**
 * Lockstep Configuration
 *
 * Pure Lockstep Architecture: Real-time state updates use lockstep frames exclusively.
 * Snapshots are reserved for initialization, explicit resync, and fog-of-war updates.
 *
 * This is the recommended configuration for optimal bandwidth usage and state consistency.
 * See: docs/planning/lockstep-architecture-refactor.md
 */

const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) {
    return defaultValue
  }
  return value.toLowerCase() === 'true'
}

export const LOCKSTEP_CONFIG = {
  /**
   * When true, only emit snapshots for initialization/resync/fog (RECOMMENDED).
   * When false, emit snapshots after every action (legacy hybrid mode).
   * Default: false (legacy hybrid mode)
   */
<<<<<<< ours
  LOCKSTEP_ONLY: (() => {
    const rawValue = process.env.LOCKSTEP_ONLY
    if (typeof rawValue !== 'string') {
      return false
    }
    const normalized = rawValue.trim().toLowerCase()
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false
    }
    return false
  })(),
=======
  LOCKSTEP_ONLY: parseBoolean(process.env.LOCKSTEP_ONLY, false),
>>>>>>> theirs

  /**
   * Maximum frames to retain in database before pruning.
   * Default: 2000 frames
   */
  MAX_FRAMES: parseInt(process.env.LOCKSTEP_MAX_FRAMES || '2000', 10),

  /**
   * Enable checksum validation for desync detection.
   * Default: true
   */
  ENABLE_CHECKSUMS: parseBoolean(process.env.LOCKSTEP_CHECKSUMS, true),
} as const

/**
 * In-memory metrics for monitoring lockstep behavior.
 * Used to compare bandwidth savings when LOCKSTEP_ONLY is enabled.
 */
export const lockstepMetrics = {
  snapshotsSaved: 0,
  framesEmitted: 0,

  /**
   * Increment when a snapshot is skipped due to LOCKSTEP_ONLY mode.
   */
  recordSnapshotSkipped(): void {
    this.snapshotsSaved++
  },

  /**
   * Increment when a lockstep frame is emitted.
   */
  recordFrameEmitted(): void {
    this.framesEmitted++
  },

  /**
   * Get current metrics snapshot.
   * @returns Current stats including bandwidth saving percentage
   */
  getStats() {
    return {
      snapshotsSaved: this.snapshotsSaved,
      framesEmitted: this.framesEmitted,
      bandwidthSavingPercent:
        this.snapshotsSaved > 0
          ? ((this.snapshotsSaved / (this.snapshotsSaved + this.framesEmitted)) * 100).toFixed(2)
          : '0.00',
    }
  },

  /**
   * Reset all metrics counters.
   */
  reset(): void {
    this.snapshotsSaved = 0
    this.framesEmitted = 0
  },
}
