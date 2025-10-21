import { describe, expect, it, jest } from '@jest/globals'

jest.mock('../config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}))

import { GameEngine } from '../game/gameEngine.js'
import { ensureTreasureState } from '../game/hiddenTreasures.js'
import { gameStateCache } from '../services/cacheService.js'
import { GameService } from '../services/gameService.js'
import type {
  AttackAction,
  DeployAction,
  EndTurnAction,
  GameAction,
  GamePlayer,
  GameState,
  GameTerritoryModifier,
  SerializedGameState,
  Territory,
  TradeCardsAction,
  TreasureConfig,
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
      sector: 'america',
      ownerId: 'player-1',
      armies: 3,
      adjacentTerritories: ['territory-b'],
    },
    {
      id: 'territory-b',
      name: 'Territory B',
      sector: 'america',
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

  it('includes sector metadata when calculating reinforcement armies', () => {
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
          sector: 'sector-alpha',
          ownerId: 'player-alpha',
          armies: 5,
          adjacentTerritories: ['territory-b'],
        },
        {
          id: 'territory-b',
          name: 'Territory B',
          sector: 'sector-alpha',
          ownerId: 'player-alpha',
          armies: 2,
          adjacentTerritories: ['territory-a', 'territory-c'],
        },
        {
          id: 'territory-c',
          name: 'Territory C',
          sector: 'sector-beta',
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
        sectorBonuses: [
          {
            id: 'sector-alpha',
            name: 'Sector Alpha',
            bonusArmies: 4,
            territories: ['territory-a', 'territory-b'],
          },
          {
            id: 'sector-beta',
            name: 'Sector Beta',
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

    // Owns two territories -> base 3 armies + 4 sector bonus
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
          sector: 'sector-alpha',
          ownerId: 'player-1',
          armies: 5,
          adjacentTerritories: ['territory-b'],
        },
        {
          id: 'territory-b',
          name: 'Territory B',
          sector: 'sector-alpha',
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

  it('adds treasure payouts to available reinforcements when cashing a valid set', async () => {
    const treasureConfig: TreasureConfig = {
      enabled: true,
      payoutMode: 'fixed',
      fixedValue: 5,
      handCap: 5,
      diamondsPercent: 0,
      diamondSetBonus: 0,
    }

    const gameState = createBaseGameState({
      phase: 'reinforcement',
      gameConfig: {
        ...createBaseGameState().gameConfig,
        treasureConfig,
      },
    })
    const current = gameState.players[0]
    current.armies = 3
    current.treasures = ['bronze', 'bronze', 'bronze']
    gameState.treasureState = ensureTreasureState()

    const action: TradeCardsAction = {
      type: 'trade_cards',
      roomId: gameState.roomId,
      playerId: current.id,
      payload: { treasureSet: [0, 1, 2] },
    }

    const result = await engine.processAction(gameState, action)
    const updatedPlayer = result.gameState.players[0]

    expect(updatedPlayer.armies).toBe(8)
    expect(updatedPlayer.treasures).toHaveLength(0)
    expect(result.gameState.mustCashInTreasures).toBe(false)
  })

  it('prevents ending reinforcement while armies remain to deploy', () => {
    const gameState = createBaseGameState({ phase: 'reinforcement' })
    const current = gameState.players[0]
    current.armies = 4
    gameState.mustCashInTreasures = false

    const endTurn: EndTurnAction = {
      type: 'end_turn',
      roomId: gameState.roomId,
      playerId: current.id,
    }

    expect(engine.validateAction(gameState, endTurn)).toBe(false)

    current.armies = 0
    expect(engine.validateAction(gameState, endTurn)).toBe(true)
  })

  it('only forces a treasure cash-in when a valid set is present', () => {
    const treasureConfig: TreasureConfig = {
      enabled: true,
      payoutMode: 'fixed',
      fixedValue: 4,
      handCap: 3,
      diamondsPercent: 0,
      diamondSetBonus: 0,
    }

    const gameState = createBaseGameState({
      phase: 'reinforcement',
      gameConfig: {
        ...createBaseGameState().gameConfig,
        treasureConfig,
      },
    })
    const current = gameState.players[0]
    current.treasures = ['bronze', 'bronze', 'silver']

    const updateRequirement = (
      engine as unknown as {
        updateCurrentPlayerCashRequirement: (state: GameState, config: TreasureConfig) => void
      }
    ).updateCurrentPlayerCashRequirement

    updateRequirement.call(engine, gameState, treasureConfig)
    expect(current.mustCashInTreasures).toBe(false)
    expect(gameState.mustCashInTreasures).toBe(false)

    current.treasures = ['bronze', 'bronze', 'bronze']
    updateRequirement.call(engine, gameState, treasureConfig)
    expect(current.mustCashInTreasures).toBe(true)
    expect(gameState.mustCashInTreasures).toBe(true)
  })

  it('returns to attack after placing treasure armies when cashing in mid-attack', async () => {
    const treasureConfig: TreasureConfig = {
      enabled: true,
      payoutMode: 'fixed',
      fixedValue: 4,
      handCap: 5,
      diamondsPercent: 0,
      diamondSetBonus: 0,
    }

    const gameState = createBaseGameState({
      phase: 'attack',
      hasAttackedThisTurn: true,
      gameConfig: {
        ...createBaseGameState().gameConfig,
        treasureConfig,
      },
    })
    const current = gameState.players[0]
    current.armies = 0
    current.treasures = ['bronze', 'bronze', 'bronze']
    gameState.treasureState = ensureTreasureState()

    const trade: TradeCardsAction = {
      type: 'trade_cards',
      roomId: gameState.roomId,
      playerId: current.id,
      payload: { treasureSet: [0, 1, 2] },
    }

    const traded = await engine.processAction(gameState, trade)
    const afterTrade = traded.gameState
    const updatedPlayer = afterTrade.players[0]

    expect(afterTrade.phase).toBe('reinforcement')
    expect(updatedPlayer.armies).toBe(4)

    const deploy: DeployAction = {
      type: 'deploy',
      roomId: afterTrade.roomId,
      playerId: updatedPlayer.id,
      payload: { territoryId: 'territory-a', armies: 4 },
    }

    const deployed = await engine.processAction(afterTrade, deploy)
    expect(deployed.gameState.phase).toBe('attack')
    expect(deployed.gameState.hasAttackedThisTurn).toBe(true)
  })

  it('does not advance phase to attack after deploying all armies, allowing undo', async () => {
    const gameState = createBaseGameState({
      phase: 'reinforcement',
      board: [
        {
          id: 'territory-a',
          name: 'Territory A',
          sector: 'america',
          ownerId: 'player-1',
          armies: 3,
          adjacentTerritories: ['territory-b'],
        },
        {
          id: 'territory-b',
          name: 'Territory B',
          sector: 'america',
          ownerId: 'player-2',
          armies: 2,
          adjacentTerritories: ['territory-a'],
        },
      ],
      reinforcementBaseline: { 'territory-a': 3 },
    })
    const player = gameState.players.find((p) => p.id === 'player-1')
    if (!player) throw new Error('Test setup failed: player not found')
    player.armies = 2

    // Deploy all armies
    const deployAction: DeployAction = {
      type: 'deploy',
      roomId: gameState.roomId,
      playerId: 'player-1',
      payload: {
        territoryId: 'territory-a',
        armies: 2,
      },
    }

    let result = await engine.processAction(gameState, deployAction)
    const territoryA = result.gameState.board.find((t) => t.id === 'territory-a')
    expect(territoryA?.armies).toBe(5)
    const updatedPlayer = result.gameState.players.find((p) => p.id === 'player-1')
    expect(updatedPlayer?.armies).toBe(0)

    // Undo the deployment
    const undoAction: DeployAction = {
      type: 'deploy',
      roomId: gameState.roomId,
      playerId: 'player-1',
      payload: {
        territoryId: 'territory-a',
        armies: -2,
      },
    }

    result = await engine.processAction(result.gameState, undoAction)

    // Check that the phase is still reinforcement and armies are returned
    expect(result.gameState.phase).toBe('reinforcement')
    const finalTerritoryA = result.gameState.board.find((t) => t.id === 'territory-a')
    expect(finalTerritoryA?.armies).toBe(3)
    const finalPlayer = result.gameState.players.find((p) => p.id === 'player-1')
    expect(finalPlayer?.armies).toBe(2)
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
          sector: 'sector-alpha',
          ownerId: 'player-1',
          armies: 6,
          adjacentTerritories: ['territory-regular'],
          isCapital: true,
          capitalOwnerId: 'player-1',
        },
        {
          id: 'territory-regular',
          name: 'Regular Territory',
          sector: 'sector-beta',
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

describe('GameEngine resignation', () => {
  const engine = new GameEngine()

  it('resets army count on resigned territories to a neutral default', async () => {
    const gameState = createBaseGameState()
    const resigningPlayer = gameState.players[0]
    const resignedTerritory = gameState.board.find((t) => t.ownerId === resigningPlayer.id)
    if (!resignedTerritory) {
      throw new Error('Test setup failed: territory not found for resigning player')
    }
    resignedTerritory.armies = 10

    const resignAction: GameAction = {
      type: 'resign',
      roomId: gameState.roomId,
      playerId: resigningPlayer.id,
    }

    const { gameState: nextState } = await engine.processAction(gameState, resignAction)
    const updatedTerritory = nextState.board.find((t) => t.id === resignedTerritory.id)

    expect(updatedTerritory?.ownerId).toBe('neutral')
    expect(updatedTerritory?.armies).toBe(3)
  })
})
