jest.mock('../config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}))

import { describe, expect, it } from '@jest/globals'
import { GameEngine } from '../game/gameEngine'
import { GameService } from '../services/gameService'
import type {
  AttackAction,
  GameAction,
  GamePlayer,
  GameState,
  GameTerritoryModifier,
  Territory,
} from '../types/game'

const createBaseGameState = (override?: Partial<GameState>): GameState => {
  const players: GamePlayer[] = [
    {
      id: 'player-1',
      username: 'Player One',
      color: 'red',
      armies: 5,
      territories: ['territory-a'],
      cards: [],
      isEliminated: false,
    },
    {
      id: 'player-2',
      username: 'Player Two',
      color: 'blue',
      armies: 5,
      territories: ['territory-b'],
      cards: [],
      isEliminated: false,
    },
  ]

  const board: Territory[] = [
    {
      id: 'territory-a',
      name: 'Territory A',
      continent: 'america',
      ownerId: 'player-1',
      armies: 3,
      adjacentTerritories: ['territory-b'],
    },
    {
      id: 'territory-b',
      name: 'Territory B',
      continent: 'america',
      ownerId: 'player-2',
      armies: 2,
      adjacentTerritories: ['territory-a'],
    },
  ]

  const baseState: GameState = {
    roomId: 'room-1',
    players,
    currentPlayer: 'player-1',
    phase: 'attack',
    turn: 1,
    board,
    cards: [],
    gameConfig: {
      movementType: 'classic_adjacent',
      allowTeamPlay: false,
      maxPlayers: 6,
      mapId: 'classic',
      gameMode: 'standard',
    },
  }

  return { ...baseState, ...override }
}

describe('GameEngine', () => {
  const engine = new GameEngine()

  it('validates attack requirements including minimum armies', () => {
    const gameState = createBaseGameState()
    const validAttack: AttackAction = {
      type: 'attack',
      roomId: 'room-1',
      playerId: 'player-1',
      payload: {
        fromTerritoryId: 'territory-a',
        toTerritoryId: 'territory-b',
        armies: 2,
      },
    }

    expect(engine.validateAction(gameState, validAttack)).toBe(true)

    // Not enough armies to attack (armies equals garrison)
    const invalidAttack: AttackAction = {
      ...validAttack,
      payload: {
        ...validAttack.payload,
        armies: 3,
      },
    }

    expect(engine.validateAction(gameState, invalidAttack)).toBe(false)
  })

  it('throws for unknown action types to guard regressions', async () => {
    const gameState = createBaseGameState()
    const bogusAction = {
      type: 'unknown_action',
      roomId: 'room-1',
      playerId: 'player-1',
      payload: {},
    } as GameAction

    await expect(engine.processAction(gameState, bogusAction)).rejects.toThrow(
      'Unknown action type received in game engine',
    )
  })
})

describe('GameService serialization', () => {
  const service = new GameService() as unknown as {
    serializeGameState: (state: GameState) => any
    hydrateGameState: (state: any) => GameState
  }

  const modifiers: Map<string, GameTerritoryModifier> = new Map([
    [
      'territory-a',
      {
        territory_id: 'territory-a',
        attack_bonus: 1,
        defense_bonus: 0,
        troop_generation_bonus: 0,
        movement_restriction: false,
        supply_line_bonus: false,
        icon: 'sword',
        color: '#ff0000',
        name: 'Battle Hardened',
      },
    ],
  ])

  const stateWithModifiers = createBaseGameState({
    territoryModifiers: modifiers,
  })

  it('converts Map-based modifiers to plain objects when serializing', () => {
    const serialized = service.serializeGameState(stateWithModifiers)

    expect(serialized.territoryModifiers).toEqual({
      'territory-a': expect.objectContaining({ name: 'Battle Hardened', attack_bonus: 1 }),
    })
  })

  it('hydrates serialized modifiers back into Map instances', () => {
    const serialized = service.serializeGameState(stateWithModifiers)
    const hydrated = service.hydrateGameState(serialized)

    expect(hydrated.territoryModifiers).toBeInstanceOf(Map)
    expect(hydrated.territoryModifiers?.get('territory-a')?.name).toBe('Battle Hardened')
  })
})
