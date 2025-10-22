/**
 * Lockstep Configuration
 *
 * LOCKSTEP_ONLY mode disables redundant snapshot emission after actions.
 * Snapshots are still used for initialization, resync, and fog-of-war updates.
 *
 * Phase 1 of lockstep architecture refactor (see docs/planning/lockstep-architecture-refactor.md)
 */

export const LOCKSTEP_CONFIG = {
  /**
   * When true, only emit snapshots for initialization/resync/fog.
   * When false, emit snapshots after every action (legacy behavior).
   * Default: false (preserves current behavior)
   */
  LOCKSTEP_ONLY: process.env.LOCKSTEP_ONLY === 'true',

  /**
   * Maximum frames to retain in database before pruning.
   * Default: 2000 frames
   */
  MAX_FRAMES: parseInt(process.env.LOCKSTEP_MAX_FRAMES || '2000', 10),

  /**
   * Enable checksum validation for desync detection.
   * Default: true
   */
  ENABLE_CHECKSUMS: process.env.LOCKSTEP_CHECKSUMS !== 'false',
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
