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

import type { GameAction, GameConfiguration } from '../types/game'
import { GameEngine } from './gameEngine'

describe('GameEngine', () => {
  let gameEngine: GameEngine

  beforeEach(() => {
    gameEngine = new GameEngine()
  })

  const createConfig = (playerCount: number): GameConfiguration => ({
    movementType: 'classic_adjacent',
    allowTeamPlay: false,
    maxPlayers: playerCount,
    mapId: 'classic',
    gameMode: 'standard',
  })

  describe('initializeGame', () => {
    it('should create a valid initial game state', () => {
      const playerIds = ['player1', 'player2', 'player3']
      const gameState = gameEngine.initializeGame('room123', playerIds, createConfig(playerIds.length))

      expect(gameState.roomId).toBe('room123')
      expect(gameState.players).toHaveLength(3)
      expect(playerIds).toContain(gameState.currentPlayer)
      expect(gameState.phase).toBe('setup')
      expect(gameState.turn).toBe(1)
      expect(gameState.board).toBeDefined()
      expect(gameState.board.length).toBeGreaterThan(0)
    })

    it('should distribute territories among players', () => {
      const playerIds = ['player1', 'player2']
      const gameState = gameEngine.initializeGame('room123', playerIds, createConfig(playerIds.length))

      // Check that all territories have owners
      const unownedTerritories = gameState.board.filter((t) => !t.ownerId)
      expect(unownedTerritories).toHaveLength(0)

      // Check that both players have territories
      const player1Territories = gameState.board.filter((t) => t.ownerId === 'player1')
      const player2Territories = gameState.board.filter((t) => t.ownerId === 'player2')

      expect(player1Territories.length).toBeGreaterThan(0)
      expect(player2Territories.length).toBeGreaterThan(0)
    })

    it('should give each territory at least 1 army', () => {
      const playerIds = ['player1', 'player2']
      const gameState = gameEngine.initializeGame('room123', playerIds, createConfig(playerIds.length))

      const weakTerritories = gameState.board.filter((t) => t.armies < 1)
      expect(weakTerritories).toHaveLength(0)
    })
  })

  describe('calculateReinforcementArmies', () => {
    it('should return minimum 3 armies', () => {
      const gameState = gameEngine.initializeGame(
        'room123',
        ['player1', 'player2'],
        createConfig(2),
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
        ['player1'],
        createConfig(1),
      )
      const player = gameState.players.find((p) => p.id === 'player1')
      const player1Territories = player?.territories.length ?? 0
      const expectedArmies = Math.max(3, Math.floor(player1Territories / 3))

      const armies = gameEngine.calculateReinforcementArmies(
        player?.territories ?? [],
        gameState.board,
        gameState.gameConfig,
      )
      expect(armies).toBe(expectedArmies)
    })
  })

  describe('advancePhase', () => {
    it('should advance from reinforcement to attack', () => {
      const gameState = gameEngine.initializeGame(
        'room123',
        ['player1', 'player2'],
        createConfig(2),
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
        ['player1', 'player2'],
        createConfig(2),
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
        ['player1', 'player2'],
        createConfig(2),
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
        ['player1', 'player2'],
        createConfig(2),
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
    let gameState: any

    beforeEach(() => {
      gameState = gameEngine.initializeGame(
        'room123',
        ['player1', 'player2'],
        createConfig(2),
      )
    })

    it('should validate deploy action', () => {
      gameState.phase = 'reinforcement'
      const currentPlayerId = gameState.currentPlayer
      const territory = gameState.board.find((t: any) => t.ownerId === currentPlayerId)
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
      const opponent = gameState.players.find((p: any) => p.id !== currentPlayerId)
      if (!opponent) {
        throw new Error('No opponent player found')
      }
      const territory = gameState.board.find((t: any) => t.ownerId === opponent.id)
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
