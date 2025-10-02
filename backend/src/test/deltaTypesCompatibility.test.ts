import { describe, expect, it } from '@jest/globals'
import type { GameDelta } from '@risk-game/shared/types'
import { DeltaBuilder } from '../types/deltaUpdates'

describe('DeltaBuilder compatibility with shared GameDelta', () => {
  it('territory update satisfies shared GameDelta', () => {
    const delta = DeltaBuilder.territoryUpdate('room-1', 't1', { armies: 5 })
    // Type-level assertion via satisfies
    const typedDelta: GameDelta = delta
    expect(typedDelta.type).toBe('TERRITORY_UPDATE')
  })

  it('phase change satisfies shared GameDelta', () => {
    const delta = DeltaBuilder.phaseChange('room-1', 'reinforcement', 'user-1', 3, 5)
    const typedDelta: GameDelta = delta
    expect(typedDelta.type).toBe('PHASE_CHANGE')
  })

  it('battle result shape is compatible with shared GameDelta', () => {
    const delta = DeltaBuilder.battleResult('room-1', {
      fromTerritory: { id: 'a', armies: 3 },
      toTerritory: { id: 'b', armies: 2, ownerId: 'def' },
      conquered: false,
      attackerDice: [6, 5, 4],
      defenderDice: [6, 1],
      attackerLosses: 1,
      defenderLosses: 2,
    })
    const typedDelta: GameDelta = delta
    expect(typedDelta.type).toBe('BATTLE_RESULT')
  })

  it('game end satisfies shared GameDelta', () => {
    const delta = DeltaBuilder.gameEnd('room-1', 'user-1', ['user-2'])
    const typedDelta: GameDelta = delta
    expect(typedDelta.type).toBe('GAME_END')
  })
})
