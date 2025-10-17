import type { GameState as SharedGameState } from '@conquestk/shared'
import { computeChecksum, simulateFrame } from '@conquestk/shared/lockstep'
import type { InputFrame } from '@conquestk/shared/types/lockstep'

type ApplyFrameResult =
  | { ok: true }
  | { ok: false; reason: 'missing_state' | 'unsupported_commands'; unsupported?: string[] }

const cloneState = (state: SharedGameState): SharedGameState => {
  return structuredClone(state) as SharedGameState
}

export class LockstepSimulationManager {
  private stateByMatch = new Map<string, SharedGameState>()

  reset(): void {
    this.stateByMatch.clear()
  }

  setBaseline(matchId: string, state: SharedGameState): void {
    this.stateByMatch.set(matchId, cloneState(state))
  }

  clear(matchId: string): void {
    this.stateByMatch.delete(matchId)
  }

  applyFrame(matchId: string, frame: InputFrame): ApplyFrameResult {
    const current = this.stateByMatch.get(matchId)
    if (!current) {
      return { ok: false, reason: 'missing_state' }
    }

    const { state, unsupported } = simulateFrame(current, frame)
    this.stateByMatch.set(matchId, state)

    if (unsupported.length > 0) {
      return { ok: false, reason: 'unsupported_commands', unsupported }
    }

    return { ok: true }
  }

  applyFrames(matchId: string, frames: InputFrame[]): ApplyFrameResult {
    let result: ApplyFrameResult = { ok: true }
    for (const frame of frames) {
      result = this.applyFrame(matchId, frame)
      if (!result.ok) {
        return result
      }
    }
    return result
  }

  checksum(matchId: string): number | null {
    const state = this.stateByMatch.get(matchId)
    if (!state) return null
    return computeChecksum(state)
  }

  getState(matchId: string): SharedGameState | null {
    return this.stateByMatch.get(matchId) ?? null
  }
}
