jest.mock('../config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  getPool: jest.fn(() => ({
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  })),
  getClient: jest.fn(async () => ({
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: jest.fn(),
  })),
}))

import type { ContinentBonus, GameAction, GameConfiguration, Territory } from '../types/game'
import { GameEngine } from './gameEngine'

describe('GameEngine', () => {
  let gameEngine: GameEngine

  const createConfig = (
    playerCount: number,
    overrides: Partial<GameConfiguration> = {},
  ): GameConfiguration => ({
    movementType: 'classic_adjacent',
    allowTeamPlay: false,
    teamMode: 'none',
    numberOfTeams: null,
    maxPlayers: playerCount,
    mapId: 'classic',
    gameMode: 'standard',
    ...overrides,
  })

  const createPlayers = (...ids: string[]) => ids.map((id) => ({ userId: id, username: id }))

  const sampleTerritories: Territory[] = [
    {
      id: 'territory-1',
      name: 'Territory 1',
      continent: 'continent-1',
      ownerId: null,
      armies: 0,
      adjacentTerritories: ['territory-2', 'territory-3'],
      isCapital: false,
    },
    {
      id: 'territory-2',
      name: 'Territory 2',
      continent: 'continent-1',
      ownerId: null,
      armies: 0,
      adjacentTerritories: ['territory-1', 'territory-3'],
      isCapital: false,
    },
    {
      id: 'territory-3',
      name: 'Territory 3',
      continent: 'continent-1',
      ownerId: null,
      armies: 0,
      adjacentTerritories: ['territory-1', 'territory-2', 'territory-4'],
      isCapital: false,
    },
    {
      id: 'territory-4',
      name: 'Territory 4',
      continent: 'continent-2',
      ownerId: null,
      armies: 0,
      adjacentTerritories: ['territory-3', 'territory-5'],
      isCapital: false,
    },
    {
      id: 'territory-5',
      name: 'Territory 5',
      continent: 'continent-2',
      ownerId: null,
      armies: 0,
      adjacentTerritories: ['territory-4', 'territory-6'],
      isCapital: false,
    },
    {
      id: 'territory-6',
      name: 'Territory 6',
      continent: 'continent-2',
      ownerId: null,
      armies: 0,
      adjacentTerritories: ['territory-5', 'territory-4'],
      isCapital: false,
    },
  ]

  const continentBonuses: ContinentBonus[] = [
    {
      id: 'continent-1',
      name: 'North',
      bonusArmies: 5,
      territories: ['territory-1', 'territory-2', 'territory-3'],
    },
    {
      id: 'continent-2',
      name: 'South',
      bonusArmies: 3,
      territories: ['territory-4', 'territory-5', 'territory-6'],
    },
  ]

  const mapOverrides = {
    territories: sampleTerritories,
    continentBonuses,
  }

  beforeEach(() => {
    gameEngine = new GameEngine()
  })

  describe('initializeGame', () => {
    it('should create a valid initial game state', () => {
      const players = createPlayers('player1', 'player2', 'player3')
      const gameState = gameEngine.initializeGame(
        'room123',
        players,
        createConfig(players.length),
        mapOverrides,
      )

      expect(gameState.roomId).toBe('room123')
      expect(gameState.players).toHaveLength(3)
      expect(players.map((p) => p.userId)).toContain(gameState.currentPlayer)
      expect(gameState.phase).toBe('setup')
      expect(gameState.turn).toBe(1)
      expect(gameState.board).toBeDefined()
      expect(gameState.board.length).toBeGreaterThan(0)
    })

    it('should distribute territories among players', () => {
      const players = createPlayers('player1', 'player2')
      const gameState = gameEngine.initializeGame(
        'room123',
        players,
        createConfig(players.length),
        mapOverrides,
      )

      const unownedTerritories = gameState.board.filter((t) => !t.ownerId)
      expect(unownedTerritories).toHaveLength(0)

      const player1Territories = gameState.board.filter((t) => t.ownerId === 'player1')
      const player2Territories = gameState.board.filter((t) => t.ownerId === 'player2')

      expect(player1Territories.length).toBeGreaterThan(0)
      expect(player2Territories.length).toBeGreaterThan(0)
    })

    it('should give each territory at least 1 army', () => {
      const players = createPlayers('player1', 'player2')
      const gameState = gameEngine.initializeGame(
        'room123',
        players,
        createConfig(players.length),
        mapOverrides,
      )

      const weakTerritories = gameState.board.filter((t) => t.armies < 1)
      expect(weakTerritories).toHaveLength(0)
    })
  })

  describe('calculateReinforcementArmies', () => {
    it('should return minimum 3 armies', () => {
      const gameState = gameEngine.initializeGame(
        'room123',
        createPlayers('player1', 'player2'),
        createConfig(2),
        mapOverrides,
      )
      const player = gameState.players.find((p) => p.id === 'player1')
      const armies = gameEngine.calculateReinforcementArmies(
        player?.territories ?? [],
        gameState.board,
        gameState.gameConfig,
      )
      expect(armies).toBeGreaterThanOrEqual(3)
    })

    it('should calculate armies based on territory count', () => {
      const gameState = gameEngine.initializeGame(
        'room123',
        createPlayers('player1'),
        createConfig(1, { sectorBonuses: [] }),
        mapOverrides,
      )
      const player = gameState.players.find((p) => p.id === 'player1')
      const player1Territories = player?.territories.length ?? 0
      const expectedArmies = Math.max(3, Math.floor(player1Territories / 3))

      const neutralBoard = gameState.board.map((territory) => ({
        ...territory,
        continent: 'neutral-continent',
      }))
      const configWithoutBonuses = { ...gameState.gameConfig, sectorBonuses: [] }

      const armies = gameEngine.calculateReinforcementArmies(
        player?.territories ?? [],
        neutralBoard,
        configWithoutBonuses,
      )
      expect(armies).toBe(expectedArmies)
    })

    it('should include configured continent bonuses', () => {
      const playerTerritories = Array.from({ length: 6 }, (_, index) => `territory-${index + 1}`)
      const testContinentTerritories = playerTerritories.slice(0, 2)

      const allTerritories: Territory[] = playerTerritories.map((territoryId, index) => ({
        id: territoryId,
        name: territoryId,
        continent: index < testContinentTerritories.length ? 'test-continent' : 'other-continent',
        ownerId: 'player1',
        armies: 1,
        adjacentTerritories: [],
      }))

      const bonusValue = 4
      const config = createConfig(1, {
        sectorBonuses: [
          {
            id: 'test-continent',
            name: 'Test Continent',
            territories: testContinentTerritories,
            bonusArmies: bonusValue,
          },
        ],
      })

      const baseArmies = Math.max(3, Math.floor(playerTerritories.length / 3))
      const armies = gameEngine.calculateReinforcementArmies(
        playerTerritories,
        allTerritories,
        config,
      )

      expect(armies).toBe(baseArmies + bonusValue)
    })
  })

  describe('advancePhase', () => {
    it('should advance from reinforcement to attack', () => {
      const gameState = gameEngine.initializeGame(
        'room123',
        createPlayers('player1', 'player2'),
        createConfig(2),
        mapOverrides,
      )
      gameState.phase = 'reinforcement'
      const currentPlayer = gameState.currentPlayer

      const newState = gameEngine.advancePhase(gameState)
      expect(newState.phase).toBe('attack')
      expect(newState.currentPlayer).toBe(currentPlayer)
    })

    it('should advance from attack to fortify', () => {
      const gameState = gameEngine.initializeGame(
        'room123',
        createPlayers('player1', 'player2'),
        createConfig(2),
        mapOverrides,
      )
      gameState.phase = 'attack'
      const currentPlayer = gameState.currentPlayer

      const newState = gameEngine.advancePhase(gameState)
      expect(newState.phase).toBe('fortify')
      expect(newState.currentPlayer).toBe(currentPlayer)
    })

    it('should advance from fortify to next player reinforcement', () => {
      const gameState = gameEngine.initializeGame(
        'room123',
        createPlayers('player1', 'player2'),
        createConfig(2),
        mapOverrides,
      )
      gameState.phase = 'fortify'
      const currentPlayer = gameState.currentPlayer
      const currentIndex = gameState.players.findIndex((p) => p.id === currentPlayer)
      const expectedNextPlayer = gameState.players[(currentIndex + 1) % gameState.players.length].id

      const newState = gameEngine.advancePhase(gameState)
      expect(newState.phase).toBe('reinforcement')
      expect(newState.currentPlayer).toBe(expectedNextPlayer)
    })

    it('should increment turn when cycling back to first player', () => {
      const gameState = gameEngine.initializeGame(
        'room123',
        createPlayers('player1', 'player2'),
        createConfig(2),
        mapOverrides,
      )
      gameState.phase = 'fortify'
      gameState.currentPlayer = gameState.players[gameState.players.length - 1].id
      gameState.turn = 1

      const newState = gameEngine.advancePhase(gameState)
      expect(newState.phase).toBe('reinforcement')
      expect(newState.currentPlayer).toBe(gameState.players[0].id)
      expect(newState.turn).toBe(2)
    })
  })

  describe('validateAction', () => {
    let gameState: ReturnType<GameEngine['initializeGame']>

    beforeEach(() => {
      gameState = gameEngine.initializeGame(
        'room123',
        createPlayers('player1', 'player2'),
        createConfig(2),
        mapOverrides,
      )
    })

    it('should validate deploy action', () => {
      gameState.phase = 'reinforcement'
      const currentPlayerId = gameState.currentPlayer
      const territory = gameState.board.find((t) => t.ownerId === currentPlayerId)
      if (!territory) {
        throw new Error(`No territory found for ${currentPlayerId}`)
      }

      const action: GameAction = {
        type: 'deploy',
        roomId: 'room123',
        playerId: currentPlayerId,
        payload: { territoryId: territory.id, armies: 1 },
      }

      const isValid = gameEngine.validateAction(gameState, action)
      expect(isValid).toBe(true)
    })

    it('should reject deploy to enemy territory', () => {
      gameState.phase = 'reinforcement'
      const currentPlayerId = gameState.currentPlayer
      const opponent = gameState.players.find((p) => p.id !== currentPlayerId)
      if (!opponent) {
        throw new Error('No opponent player found')
      }
      const territory = gameState.board.find((t) => t.ownerId === opponent.id)
      if (!territory) {
        throw new Error(`No territory found for ${opponent.id}`)
      }

      const action: GameAction = {
        type: 'deploy',
        roomId: 'room123',
        playerId: currentPlayerId,
        payload: { territoryId: territory.id, armies: 1 },
      }

      const isValid = gameEngine.validateAction(gameState, action)
      expect(isValid).toBe(false)
    })
  })
})
