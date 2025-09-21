import { describe, expect, it, jest } from '@jest/globals'

jest.mock('../config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}))

import { GameEngine } from '../game/gameEngine'
import { gameStateCache } from '../services/cacheService'
import { GameService } from '../services/gameService'
import type {
  AttackAction,
  GameAction,
  GamePlayer,
  GameState,
  GameTerritoryModifier,
  SerializedGameState,
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

  it('includes continent metadata when calculating reinforcement armies', () => {
    const reinforcementState: GameState = {
      roomId: 'room-reinforcement',
      players: [
        {
          id: 'player-alpha',
          username: 'Alpha',
          color: 'red',
          armies: 0,
          territories: ['territory-a', 'territory-b'],
          cards: [],
          isEliminated: false,
        },
        {
          id: 'player-beta',
          username: 'Beta',
          color: 'blue',
          armies: 0,
          territories: ['territory-c'],
          cards: [],
          isEliminated: false,
        },
      ],
      currentPlayer: 'player-alpha',
      phase: 'reinforcement',
      turn: 3,
      board: [
        {
          id: 'territory-a',
          name: 'Territory A',
          continent: 'continent-alpha',
          ownerId: 'player-alpha',
          armies: 5,
          adjacentTerritories: ['territory-b'],
        },
        {
          id: 'territory-b',
          name: 'Territory B',
          continent: 'continent-alpha',
          ownerId: 'player-alpha',
          armies: 2,
          adjacentTerritories: ['territory-a', 'territory-c'],
        },
        {
          id: 'territory-c',
          name: 'Territory C',
          continent: 'continent-beta',
          ownerId: 'player-beta',
          armies: 3,
          adjacentTerritories: ['territory-b'],
        },
      ],
      cards: [],
      gameConfig: {
        movementType: 'classic_adjacent',
        allowTeamPlay: false,
        maxPlayers: 4,
        mapId: 'classic',
        gameMode: 'standard',
        continentBonuses: [
          {
            id: 'continent-alpha',
            name: 'Continent Alpha',
            bonusArmies: 4,
            territories: ['territory-a', 'territory-b'],
          },
          {
            id: 'continent-beta',
            name: 'Continent Beta',
            bonusArmies: 2,
            territories: ['territory-c'],
          },
        ],
      },
    }

    const reinforcementArmies = engine.calculateBaseReinforcementArmies(
      reinforcementState,
      'player-alpha',
    )

    // Owns two territories -> base 3 armies + 4 continent bonus
    expect(reinforcementArmies).toBe(7)
  })

  it('allows reinforcement onto teammate territories when team play is enabled', async () => {
    const gameState: GameState = {
      roomId: 'team-reinforcement',
      players: [
        {
          id: 'player-1',
          username: 'Player One',
          color: 'red',
          armies: 6,
          territories: ['territory-a'],
          cards: [],
          isEliminated: false,
          teamId: 1,
        },
        {
          id: 'player-2',
          username: 'Player Two',
          color: 'blue',
          armies: 3,
          territories: ['territory-b'],
          cards: [],
          isEliminated: false,
          teamId: 1,
        },
      ],
      currentPlayer: 'player-1',
      phase: 'reinforcement',
      turn: 2,
      board: [
        {
          id: 'territory-a',
          name: 'Territory A',
          continent: 'continent-alpha',
          ownerId: 'player-1',
          armies: 5,
          adjacentTerritories: ['territory-b'],
        },
        {
          id: 'territory-b',
          name: 'Territory B',
          continent: 'continent-alpha',
          ownerId: 'player-2',
          armies: 2,
          adjacentTerritories: ['territory-a'],
        },
      ],
      cards: [],
      gameConfig: {
        movementType: 'classic_adjacent',
        allowTeamPlay: true,
        maxPlayers: 4,
        mapId: 'classic',
        gameMode: 'standard',
      },
    }

    const action: GameAction = {
      type: 'deploy',
      roomId: 'team-reinforcement',
      playerId: 'player-1',
      payload: {
        territoryId: 'territory-b',
        armies: 3,
      },
    }

    expect(engine.validateAction(gameState, action)).toBe(true)

    const result = await engine.processAction(gameState, action)
    const updatedBoard = result.gameState.board
    const teammateTerritory = updatedBoard.find((t) => t.id === 'territory-b')
    const currentPlayer = result.gameState.players.find((p) => p.id === 'player-1')

    expect(teammateTerritory?.armies).toBe(5)
    expect(currentPlayer?.armies).toBe(3)
  })

  it('blocks reinforcement onto teammate territories when team play is disabled', () => {
    const gameState = createBaseGameState({
      phase: 'reinforcement',
      gameConfig: {
        movementType: 'classic_adjacent',
        allowTeamPlay: false,
        maxPlayers: 6,
        mapId: 'classic',
        gameMode: 'standard',
      },
    })

    const action: GameAction = {
      type: 'deploy',
      roomId: 'room-1',
      playerId: 'player-1',
      payload: {
        territoryId: 'territory-b',
        armies: 2,
      },
    }

    expect(engine.validateAction(gameState, action)).toBe(false)
  })
})

describe('GameService serialization', () => {
  const service = new GameService() as unknown as {
    serializeGameState: (state: GameState) => SerializedGameState
    hydrateGameState: (state: SerializedGameState | GameState) => GameState
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

describe('GameService capital helpers', () => {
  const service = new GameService()
  const roomId = 'capital-room-1'

  afterEach(async () => {
    await gameStateCache.deleteGameState(roomId)
  })

  it('identifies capital territories from cached state', async () => {
    const cachedState: SerializedGameState = {
      roomId,
      players: [
        {
          id: 'player-1',
          username: 'Player One',
          color: 'red',
          armies: 5,
          territories: ['territory-capital'],
          cards: [],
          isEliminated: false,
          capitalTerritory: 'territory-capital',
        },
        {
          id: 'player-2',
          username: 'Player Two',
          color: 'blue',
          armies: 3,
          territories: ['territory-regular'],
          cards: [],
          isEliminated: false,
        },
      ],
      currentPlayer: 'player-1',
      phase: 'reinforcement',
      turn: 1,
      board: [
        {
          id: 'territory-capital',
          name: 'Capital Territory',
          continent: 'continent-alpha',
          ownerId: 'player-1',
          armies: 6,
          adjacentTerritories: ['territory-regular'],
          isCapital: true,
          capitalOwnerId: 'player-1',
        },
        {
          id: 'territory-regular',
          name: 'Regular Territory',
          continent: 'continent-beta',
          ownerId: 'player-2',
          armies: 4,
          adjacentTerritories: ['territory-capital'],
          isCapital: false,
        },
      ],
      cards: [],
      gameConfig: {
        movementType: 'classic_adjacent',
        allowTeamPlay: false,
        maxPlayers: 6,
        mapId: 'classic',
        gameMode: 'standard',
      },
      capitalAssignments: {
        'player-1': 'territory-capital',
      },
    }

    await gameStateCache.setGameState(roomId, cachedState)

    await expect(service.isCapitalTerritory(roomId, 'territory-capital')).resolves.toBe(true)
    await expect(service.isCapitalTerritory(roomId, 'territory-regular')).resolves.toBe(false)
  })
})
