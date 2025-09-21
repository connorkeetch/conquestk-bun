const mockDbQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })
const mockTransaction = jest.fn()

jest.mock('../config/database', () => ({
  query: mockDbQuery,
  transaction: mockTransaction,
  getPool: jest.fn(() => ({
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  })),
  getClient: jest.fn(async () => ({
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: jest.fn(),
  })),
}))

import { gameStateCache } from './cacheService'
import { GameService } from './gameService'

describe('GameService', () => {
  let gameService: GameService

  beforeEach(() => {
    jest.clearAllMocks()
    mockDbQuery.mockResolvedValue({ rows: [], rowCount: 0 })
    mockTransaction.mockReset()
    mockTransaction.mockImplementation(async (callback: (client: unknown) => Promise<unknown>) => {
      const client = {
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      }
      return callback(client as any)
    })
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

  describe('applyBattleResult', () => {
    const gameId = 'battle-room'

    afterEach(async () => {
      await gameStateCache.invalidateGame(gameId)
    })

    const buildBaseState = () => ({
      roomId: gameId,
      players: [
        {
          id: 'attacker',
          username: 'Attacker',
          color: 'red',
          armies: 5,
          territories: ['attacking'],
          cards: [],
          isEliminated: false,
        },
        {
          id: 'defender',
          username: 'Defender',
          color: 'blue',
          armies: 3,
          territories: ['defending'],
          cards: [],
          isEliminated: false,
        },
        {
          id: 'support',
          username: 'Support',
          color: 'green',
          armies: 4,
          territories: ['support'],
          cards: [],
          isEliminated: false,
        },
      ],
      currentPlayer: 'attacker',
      phase: 'attack' as const,
      turn: 1,
      board: [
        {
          id: 'attacking',
          name: 'Attacking',
          continent: 'earth',
          ownerId: 'attacker',
          armies: 5,
          adjacentTerritories: ['defending'],
        },
        {
          id: 'defending',
          name: 'Defending',
          continent: 'earth',
          ownerId: 'defender',
          armies: 3,
          adjacentTerritories: ['attacking'],
        },
        {
          id: 'support',
          name: 'Support',
          continent: 'earth',
          ownerId: 'support',
          armies: 4,
          adjacentTerritories: [],
        },
      ],
      cards: [],
      gameConfig: {
        movementType: 'classic_adjacent' as const,
        maxPlayers: 3,
      },
    })

    const payload = {
      jobId: 'job-1',
      attackerLosses: 1,
      defenderLosses: 3,
      territoryConquered: true,
      attackingArmiesRemaining: 4,
      defendingArmiesRemaining: 0,
      dice: {
        attacker: [6, 5, 4],
        defender: [4, 2],
      },
      attackingTerritoryId: 'attacking',
      defendingTerritoryId: 'defending',
      attackingPlayerId: 'attacker',
      defendingPlayerId: 'defender',
      attackingArmiesCommitted: 3,
    }

    it('persists conquest results and updates cache', async () => {
      await gameStateCache.setGameState(gameId, buildBaseState())

      let persistedBoardSnapshot: unknown[] = []
      let persistedLogSnapshot: unknown[] = []

      const client = {
        query: jest
          .fn()
          .mockImplementationOnce(async () => ({ rows: [], rowCount: 0 }))
          .mockImplementationOnce(async (_sql: string, params: unknown[]) => {
            persistedBoardSnapshot = JSON.parse(params[5] as string)
            persistedLogSnapshot = JSON.parse(params[7] as string)
            return { rows: [], rowCount: 1 }
          }),
      }

      mockTransaction.mockImplementationOnce(async (callback: (dbClient: unknown) => Promise<unknown>) =>
        callback(client as any),
      )

      const result = await gameService.applyBattleResult(gameId, payload)
      expect(result.applied).toBe(true)
      expect(client.query).toHaveBeenCalledTimes(2)
      expect((client.query.mock.calls[1] ?? [])[0]).toContain('INSERT INTO game_states')

      const persistedDefending = (persistedBoardSnapshot as Array<{ id: string; ownerId: string; armies: number }>).find(
        (territory) => territory.id === 'defending',
      )
      expect(persistedDefending?.ownerId).toBe('attacker')
      expect(persistedDefending?.armies).toBe(3)
      expect(persistedLogSnapshot).toEqual(
        expect.arrayContaining([expect.objectContaining({ jobId: payload.jobId })]),
      )

      const cachedState = await gameService.getGameState(gameId)
      expect(cachedState?.board.find((territory) => territory.id === 'defending')?.ownerId).toBe(
        'attacker',
      )
      expect(cachedState?.board.find((territory) => territory.id === 'attacking')?.armies).toBe(1)
    })

    it('is idempotent when the same battle is re-applied', async () => {
      await gameStateCache.setGameState(gameId, buildBaseState())

      let persistedBoardSnapshot: unknown[] = []

      const firstClient = {
        query: jest
          .fn()
          .mockImplementationOnce(async () => ({ rows: [], rowCount: 0 }))
          .mockImplementationOnce(async (_sql: string, params: unknown[]) => {
            persistedBoardSnapshot = JSON.parse(params[5] as string)
            return { rows: [], rowCount: 1 }
          }),
      }

      const duplicateClient = {
        query: jest.fn(async (sql: string) => {
          if (sql.includes('SELECT')) {
            return {
              rows: [
                {
                  territories: persistedBoardSnapshot,
                  game_log: [{ jobId: payload.jobId }],
                  winner_id: null,
                },
              ],
              rowCount: 1,
            }
          }
          throw new Error('Duplicate apply should not issue write queries')
        }),
      }

      mockTransaction
        .mockImplementationOnce(async (callback: (dbClient: unknown) => Promise<unknown>) =>
          callback(firstClient as any),
        )
        .mockImplementationOnce(async (callback: (dbClient: unknown) => Promise<unknown>) =>
          callback(duplicateClient as any),
        )

      await gameService.applyBattleResult(gameId, payload)
      const secondResult = await gameService.applyBattleResult(gameId, payload)

      expect(secondResult.applied).toBe(false)
      expect(duplicateClient.query).toHaveBeenCalledTimes(1)
      expect((duplicateClient.query.mock.calls[0] ?? [])[0]).toContain('SELECT')
    })
  })
})
