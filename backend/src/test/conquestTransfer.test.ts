import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { GameEngine } from '../game/gameEngine.js'
import type { AttackAction, GameState } from '../types/game.js'

function createConquestState(): GameState {
  return {
    roomId: 'room-1',
    players: [
      {
        id: 'attacker',
        username: 'Attacker',
        color: '#DC2626',
        armies: 0,
        territories: ['alpha'],
        cards: [],
        isEliminated: false,
      },
      {
        id: 'defender',
        username: 'Defender',
        color: '#2563EB',
        armies: 0,
        territories: ['beta'],
        cards: [],
        isEliminated: false,
      },
    ],
    currentPlayer: 'attacker',
    phase: 'attack',
    turn: 1,
    board: [
      {
        id: 'alpha',
        name: 'Alpha',
        sector: 'test',
        ownerId: 'attacker',
        armies: 5,
        adjacentTerritories: ['beta'],
      },
      {
        id: 'beta',
        name: 'Beta',
        sector: 'test',
        ownerId: 'defender',
        armies: 1,
        adjacentTerritories: ['alpha'],
      },
    ],
    cards: [],
    gameConfig: {
      movementType: 'classic_adjacent',
      maxPlayers: 2,
    },
    movementTracking: {},
    treasureState: undefined,
    mustCashInTreasures: false,
  }
}

describe('GameEngine conquest transfers', () => {
  let engine: GameEngine

  beforeEach(() => {
    engine = new GameEngine()
  })

  function mockVictory() {
    const spy = jest
      .spyOn(
        engine as unknown as { simulateBattle: GameEngine['simulateBattle'] },
        'simulateBattle',
      )
      .mockReturnValue({
        attackerDice: [6],
        defenderDice: [1],
        attackerLosses: 0,
        defenderLosses: 1,
      })
    return spy
  }

  async function executeConquest() {
    const state = createConquestState()
    const spy = mockVictory()
    const action: AttackAction = {
      type: 'attack',
      roomId: state.roomId,
      playerId: 'attacker',
      payload: { fromTerritoryId: 'alpha', toTerritoryId: 'beta' },
    }

    const { gameState, battleResult } = await engine.processAction(state, action)
    spy.mockRestore()
    return { state: gameState, battleResult }
  }

  it('marks the conquering player as pending transfer', async () => {
    const { state, battleResult } = await executeConquest()

    expect(battleResult?.conquered).toBe(true)
    expect(battleResult?.pendingConquestFor).toBe('attacker')
    expect(state.lastBattleResult?.pendingConquestFor).toBe('attacker')
  })

  it('allows the conquering player to transfer armies and stay in attack phase', async () => {
    const { state } = await executeConquest()

    state.phase = 'attack'
    const updated = engine.transferConquestArmies(state, 'attacker', 'alpha', 'beta', 2)

    const from = updated.board.find((territory) => territory.id === 'alpha')
    const to = updated.board.find((territory) => territory.id === 'beta')

    expect(from?.armies).toBe(2)
    expect(to?.armies).toBe(3)
    expect(updated.phase).toBe('attack')
    expect(updated.lastBattleResult?.pendingConquestFor).toBeNull()
  })

  it('rejects transfer attempts from non-conquering players', async () => {
    const { state } = await executeConquest()

    state.phase = 'attack'
    expect(() => engine.transferConquestArmies(state, 'defender', 'alpha', 'beta', 1)).toThrow(
      'Only the conquering player can transfer armies',
    )
  })
})
