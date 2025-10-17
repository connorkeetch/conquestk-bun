import type { GameAction, GameState } from '@conquestk/shared/types'
import type { InputFrame } from '@conquestk/shared/types/lockstep.js'

export type ApplyAction = (state: GameState, action: GameAction) => GameState

export interface FramePlaybackDependencies {
  applyAction(state: GameState, action: GameAction): GameState
}

const cloneState = (state: GameState): GameState => {
  return JSON.parse(JSON.stringify(state)) as GameState
}

const buildGameAction = (
  frame: InputFrame,
  command: InputFrame['commands'][number],
): GameAction => {
  return {
    type: command.kind,
    roomId: frame.matchId,
    playerId: frame.playerId,
    payload: command.payload ?? {},
  } as GameAction
}

export const applyFrame = (
  state: GameState,
  frame: InputFrame,
  deps: FramePlaybackDependencies,
): GameState => {
  let current = state
  for (const command of frame.commands) {
    const action = buildGameAction(frame, command)
    const next = deps.applyAction(current, action)
    current = next
  }
  return current
}

export const replayFrames = (
  initial: GameState,
  frames: InputFrame[],
  deps: FramePlaybackDependencies,
): GameState => {
  let current = cloneState(initial)
  for (const frame of frames) {
    current = applyFrame(current, frame, deps)
  }
  return current
}
