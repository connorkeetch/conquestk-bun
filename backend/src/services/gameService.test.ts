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

import { GameService } from './gameService'

describe('GameService', () => {
  let gameService: GameService

  beforeEach(() => {
    gameService = new GameService()
  })

  describe('initializeGame', () => {
    it('should create and store a new game', async () => {
      const roomId = 'test-room'
      const players = ['player1', 'player2', 'player3']

      const gameState = await gameService.initializeGame(roomId, players)

      expect(gameState.roomId).toBe(roomId)
      expect(gameState.players).toHaveLength(3)
      const returnedIds = gameState.players.map((p) => p.id).sort()
      expect(returnedIds).toEqual([...players].sort())
      expect(players).toContain(gameState.currentPlayer)
      expect(gameState.phase).toBe('setup')

      // Verify game is stored
      const retrievedGame = await gameService.getGameState(roomId)
      expect(retrievedGame).toEqual(gameState)
    })

    it('should handle different player counts', async () => {
      const roomId2 = 'test-room-2'
      const players2 = ['player1', 'player2']

      const gameState2 = await gameService.initializeGame(roomId2, players2)
      expect(gameState2.players).toHaveLength(2)

      const roomId6 = 'test-room-6'
      const players6 = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']

      const gameState6 = await gameService.initializeGame(roomId6, players6)
      expect(gameState6.players).toHaveLength(6)
    })
  })

  describe('getGameState', () => {
    it('should return null for non-existent game', async () => {
      const gameState = await gameService.getGameState('non-existent')
      expect(gameState).toBeNull()
    })

    it('should return game state for existing game', async () => {
      const roomId = 'existing-room'
      const players = ['player1', 'player2']

      await gameService.initializeGame(roomId, players)
      const retrievedGame = await gameService.getGameState(roomId)

      expect(retrievedGame).not.toBeNull()
      expect(retrievedGame?.roomId).toBe(roomId)
    })
  })

  describe('endTurn', () => {
    it('should advance game phase', async () => {
      const roomId = 'turn-test'
      const players = ['player1', 'player2']

      const initialState = await gameService.initializeGame(roomId, players)
      const currentPlayer = initialState.currentPlayer

      const firstAdvance = await gameService.endTurn(roomId, currentPlayer)
      expect(firstAdvance.gameState.phase).toBe('reinforcement')
      expect(firstAdvance.gameState.currentPlayer).toBe(currentPlayer)

      const secondAdvance = await gameService.endTurn(roomId, currentPlayer)
      expect(secondAdvance.gameState.phase).toBe('attack')
      expect(secondAdvance.gameState.currentPlayer).toBe(currentPlayer)
    })

    it('should reject turn end from wrong player', async () => {
      const roomId = 'wrong-player-test'
      const players = ['player1', 'player2']

      const initialState = await gameService.initializeGame(roomId, players)
      const currentPlayer = initialState.currentPlayer
      const otherPlayer = initialState.players.find((p) => p.id !== currentPlayer)!.id

      await expect(gameService.endTurn(roomId, otherPlayer)).rejects.toThrow('Not your turn')
    })

    it('should reject turn end for non-existent game', async () => {
      await expect(gameService.endTurn('non-existent', 'player1')).rejects.toThrow('Game not found')
    })
  })

  describe('deployArmies', () => {
    it('should allow deployment during reinforcement phase', async () => {
      const roomId = 'deploy-test'
      const players = ['player1', 'player2']

      const initialState = await gameService.initializeGame(roomId, players)
      const currentPlayer = initialState.currentPlayer
      await gameService.endTurn(roomId, currentPlayer)

      const updatedState = await gameService.getGameState(roomId)
      if (!updatedState) {
        throw new Error('Game state not found')
      }

      const territory = updatedState.board.find((t) => t.ownerId === currentPlayer)
      if (!territory) {
        throw new Error(`No territory found for ${currentPlayer}`)
      }

      const result = await gameService.deployArmies(roomId, currentPlayer, territory.id, 3)
      expect(result.gameState.phase).toBe('reinforcement')
      expect(result.territoryId).toBe(territory.id)
    })

    it('should reject deployment in wrong phase', async () => {
      const roomId = 'wrong-phase-test'
      const players = ['player1', 'player2']

      const initialState = await gameService.initializeGame(roomId, players)
      const currentPlayer = initialState.currentPlayer
      const territory = initialState.board.find((t) => t.ownerId === currentPlayer)

      if (!territory) {
        throw new Error(`No territory found for ${currentPlayer}`)
      }

      await expect(
        gameService.deployArmies(roomId, currentPlayer, territory.id, 1),
      ).rejects.toThrow('Not reinforcement phase')
    })
  })
})
