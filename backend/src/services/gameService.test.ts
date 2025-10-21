const mockDbQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })
const mockTransaction = jest.fn()
const mockGetActiveMembershipsForUsers = jest.fn()
const mockAwardContribution = jest.fn()
const mockEvaluateFlagByName = jest.fn()
const mockApplyRatingChanges = jest.fn()
const mockUpdateLeaderboardCache = jest.fn()
const mockTryGetSocketServer = jest.fn()

class MockClanProgressionServiceError extends Error {
  code: string

  constructor(code: string, message?: string) {
    super(message)
    this.code = code
  }
}

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

const mockValidateMapPlayable = jest.fn()

jest.mock('../services/mapService', () => ({
  mapService: {
    validateMapPlayable: mockValidateMapPlayable,
  },
}))

jest.mock('../services/clanService', () => ({
  clanService: {
    getActiveMembershipsForUsers: mockGetActiveMembershipsForUsers,
  },
}))

jest.mock('../services/clanProgressionService', () => ({
  clanProgressionService: {
    awardContribution: mockAwardContribution,
  },
  ClanProgressionServiceError: MockClanProgressionServiceError,
}))

jest.mock('../services/featureFlagService', () => ({
  featureFlagService: {
    evaluateFlagByName: mockEvaluateFlagByName,
  },
}))

jest.mock('../services/eloService', () => ({
  eloService: {
    calculateRatingChanges: jest.fn(() => []),
    applyRatingChanges: mockApplyRatingChanges,
    updateLeaderboardCache: mockUpdateLeaderboardCache,
  },
}))

jest.mock('../services/socketRegistry', () => ({
  tryGetSocketServer: mockTryGetSocketServer,
}))

const mockLoadMapForEngine = jest.fn()

jest.mock('../game/mapLoader', () => ({
  loadMapForEngine: mockLoadMapForEngine,
}))

import type { GameAction, GameState, SectorBonus, Territory } from '../types/game.js'
import { aiDecisionService } from './aiDecisionService.js'
import { gameStateCache } from './cacheService.js'
import { GameService } from './gameService.js'
import { aiTurnMetrics, assassinationMetrics } from './metricsService.js'

describe('GameService', () => {
  let gameService: GameService
  const createPlayers = (ids: string[]) => ids.map((id) => ({ userId: id, username: id }))

  const territories: Territory[] = [
    {
      id: 't1',
      name: 'Territory 1',
      sector: 'c1',
      ownerId: null,
      armies: 0,
      adjacentTerritories: ['t2', 't3'],
      isCapital: false,
    },
    {
      id: 't2',
      name: 'Territory 2',
      sector: 'c1',
      ownerId: null,
      armies: 0,
      adjacentTerritories: ['t1', 't3'],
      isCapital: false,
    },
    {
      id: 't3',
      name: 'Territory 3',
      sector: 'c2',
      ownerId: null,
      armies: 0,
      adjacentTerritories: ['t1', 't2', 't4'],
      isCapital: false,
    },
    {
      id: 't4',
      name: 'Territory 4',
      sector: 'c2',
      ownerId: null,
      armies: 0,
      adjacentTerritories: ['t3', 't5'],
      isCapital: false,
    },
    {
      id: 't5',
      name: 'Territory 5',
      sector: 'c2',
      ownerId: null,
      armies: 0,
      adjacentTerritories: ['t4', 't6'],
      isCapital: false,
    },
    {
      id: 't6',
      name: 'Territory 6',
      sector: 'c2',
      ownerId: null,
      armies: 0,
      adjacentTerritories: ['t5', 't4'],
      isCapital: false,
    },
  ]

  const sectorBonuses: SectorBonus[] = [
    { id: 'c1', name: 'North', territories: ['t1', 't2', 't3'], bonusArmies: 5 },
    { id: 'c2', name: 'South', territories: ['t4', 't5', 't6'], bonusArmies: 3 },
  ]

  const defaultConfig = { mapId: 'test-map' }

  const buildConfig = (overrides: Record<string, unknown> = {}) => ({
    ...defaultConfig,
    ...overrides,
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockDbQuery.mockReset()
    mockDbQuery.mockResolvedValue({ rows: [], rowCount: 0 })
    mockTransaction.mockReset()
    mockTransaction.mockImplementation(async (callback: (client: unknown) => Promise<unknown>) => {
      const client = {
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      }
      return callback(client as any)
    })
    mockValidateMapPlayable.mockReset()
    mockGetActiveMembershipsForUsers.mockReset()
    mockGetActiveMembershipsForUsers.mockResolvedValue(new Map())
    mockAwardContribution.mockReset()
    mockAwardContribution.mockResolvedValue({
      clanId: 'clan-0',
      totalXp: 0,
      level: 1,
      leveledUp: false,
      progression: {
        clanId: 'clan-0',
        totalXp: 0,
        level: 1,
        currentLevelXp: 0,
        nextLevelXp: 1000,
        xpIntoLevel: 0,
        xpToNextLevel: 1000,
        progressPercent: 0,
      },
      objectiveUpdates: [],
    })
    mockEvaluateFlagByName.mockReset()
    mockEvaluateFlagByName.mockResolvedValue(false)
    mockApplyRatingChanges.mockReset()
    mockApplyRatingChanges.mockResolvedValue(undefined)
    mockUpdateLeaderboardCache.mockReset()
    mockUpdateLeaderboardCache.mockResolvedValue(undefined)
    mockTryGetSocketServer.mockReset()
    mockTryGetSocketServer.mockReturnValue(null)
    mockLoadMapForEngine.mockReset()
    mockValidateMapPlayable.mockResolvedValue({ isValid: true, errors: [] })
    mockLoadMapForEngine.mockResolvedValue({ territories, sectorBonuses })
    gameService = new GameService()
    aiTurnMetrics.reset()
    assassinationMetrics.reset()
  })

  describe('initializeGame', () => {
    it('should create and store a new game', async () => {
      const roomId = 'test-room'
      const players = ['player1', 'player2', 'player3']

      const gameState = await gameService.initializeGame(
        roomId,
        createPlayers(players),
        buildConfig(),
      )

      expect(gameState.roomId).toBe(roomId)
      expect(gameState.players).toHaveLength(3)
      const returnedIds = gameState.players.map((p) => p.id).sort()
      expect(returnedIds).toEqual([...players].sort())
      expect(players).toContain(gameState.currentPlayer)
      expect(gameState.phase).toBe('reinforcement')

      const retrievedGame = await gameService.getGameState(roomId)
      expect(retrievedGame).toEqual(gameState)
    })

    it('should handle different player counts', async () => {
      const roomId2 = 'test-room-2'
      const players2 = ['player1', 'player2']

      const gameState2 = await gameService.initializeGame(
        roomId2,
        createPlayers(players2),
        buildConfig(),
      )
      expect(gameState2.players).toHaveLength(2)

      const roomId6 = 'test-room-6'
      const players6 = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']

      const gameState6 = await gameService.initializeGame(
        roomId6,
        createPlayers(players6),
        buildConfig(),
      )
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

      await gameService.initializeGame(roomId, createPlayers(players), buildConfig())
      const retrievedGame = await gameService.getGameState(roomId)

      expect(retrievedGame).not.toBeNull()
      expect(retrievedGame?.roomId).toBe(roomId)
    })
  })

  describe('endTurn', () => {
    it('should advance game phase', async () => {
      const roomId = 'turn-test'
      const players = ['player1', 'player2']

      const initialState = await gameService.initializeGame(
        roomId,
        createPlayers(players),
        buildConfig(),
      )
      const currentPlayer = initialState.currentPlayer

      // Place all available reinforcements before ending phase
      const owned = initialState.board.find((t) => t.ownerId === currentPlayer)
      const current = initialState.players.find((p) => p.id === currentPlayer)
      expect(owned).toBeTruthy()
      expect(current).toBeTruthy()
      if (!owned || !current) throw new Error('Setup failed: no owned territory or player')
      if ((current.armies ?? 0) > 0) {
        await gameService.deployArmies(roomId, currentPlayer, owned.id, current.armies)
      }

      const afterPlacement = await gameService.getGameState(roomId)
      expect(afterPlacement?.phase).toBe('reinforcement')

      // Manually advance past reinforcement
      const toAttack = await gameService.endTurn(roomId, currentPlayer)
      expect(toAttack.gameState.phase).toBe('attack')

      const toFortify = await gameService.endTurn(roomId, currentPlayer)
      expect(toFortify.gameState.phase).toBe('fortify')

      const toNextPlayer = await gameService.endTurn(roomId, currentPlayer)
      expect(toNextPlayer.gameState.phase).toBe('reinforcement')
      expect(toNextPlayer.gameState.currentPlayer).not.toBe(currentPlayer)
    })

    it('should reject turn end from wrong player', async () => {
      const roomId = 'wrong-player-test'
      const players = ['player1', 'player2']

      const initialState = await gameService.initializeGame(
        roomId,
        createPlayers(players),
        buildConfig(),
      )
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

      const initialState = await gameService.initializeGame(
        roomId,
        createPlayers(players),
        buildConfig(),
      )
      const currentPlayer = initialState.currentPlayer
      const updatedState = await gameService.getGameState(roomId)
      if (!updatedState) {
        throw new Error('Game state not found')
      }

      const territory = updatedState.board.find((t) => t.ownerId === currentPlayer)
      if (!territory) {
        throw new Error(`No territory found for ${currentPlayer}`)
      }

      const result = await gameService.deployArmies(roomId, currentPlayer, territory.id, 2)
      expect(result.gameState.phase).toBe('reinforcement')
      expect(result.territoryId).toBe(territory.id)
    })

    it('should reject deployment in wrong phase', async () => {
      const roomId = 'wrong-phase-test'
      const players = ['player1', 'player2']

      const initialState = await gameService.initializeGame(
        roomId,
        createPlayers(players),
        buildConfig(),
      )
      const currentPlayer = initialState.currentPlayer
      const territory = initialState.board.find((t) => t.ownerId === currentPlayer)

      if (!territory) {
        throw new Error(`No territory found for ${currentPlayer}`)
      }

      // Ensure reinforcement phase can be ended
      const current = initialState.players.find((p) => p.id === currentPlayer)
      if (current && (current.armies ?? 0) > 0) {
        await gameService.deployArmies(roomId, currentPlayer, territory.id, current.armies)
      }

      await gameService.endTurn(roomId, currentPlayer)

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
      board: [
        {
          id: 'attacking',
          name: 'Attacking Territory',
          sector: 'c1',
          ownerId: 'attacker',
          armies: 5,
          adjacentTerritories: ['defending'],
        },
        {
          id: 'defending',
          name: 'Defending Territory',
          sector: 'c1',
          ownerId: 'defender',
          armies: 3,
          adjacentTerritories: ['attacking'],
        },
        {
          id: 'support',
          name: 'Support Territory',
          sector: 'c2',
          ownerId: 'support',
          armies: 4,
          adjacentTerritories: ['attacking'],
        },
      ],
      currentPlayer: 'attacker',
      phase: 'attack' as const,
      turn: 1,
      cards: [],
      gameConfig: {
        movementType: 'classic_adjacent',
        allowTeamPlay: false,
        teamMode: 'none',
        numberOfTeams: null,
        maxPlayers: 3,
        mapId: 'test-map',
        gameMode: 'standard',
        sectorBonuses,
      },
      movementTracking: {},
    })

    it('should update state when attacker conquers territory', async () => {
      const baseState = buildBaseState()
      await gameStateCache.setGameState(gameId, baseState)

      const result = await gameService.applyBattleResult(gameId, {
        attackerLosses: 1,
        defenderLosses: 3,
        territoryConquered: true,
        attackingArmiesRemaining: 4,
        defendingArmiesRemaining: 0,
        dice: { attacker: [6, 5, 3], defender: [4, 3, 1] },
        jobId: 'battle-1',
        attackingTerritoryId: 'attacking',
        defendingTerritoryId: 'defending',
        attackingPlayerId: 'attacker',
        defendingPlayerId: 'defender',
        attackingArmiesCommitted: 3,
      })

      expect(result.applied).toBe(true)

      const updatedState = await gameService.getGameState(gameId)
      expect(updatedState?.board.find((t) => t.id === 'defending')?.ownerId).toBe('attacker')
    })

    it('awards clan contributions when the game concludes', async () => {
      const gameIdComplete = 'battle-finish'
      const completionState = {
        roomId: gameIdComplete,
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
        ],
        board: [
          {
            id: 'attacking',
            name: 'Attacking Territory',
            sector: 'c1',
            ownerId: 'attacker',
            armies: 5,
            adjacentTerritories: ['defending'],
          },
          {
            id: 'defending',
            name: 'Defending Territory',
            sector: 'c1',
            ownerId: 'defender',
            armies: 1,
            adjacentTerritories: ['attacking'],
          },
        ],
        currentPlayer: 'attacker',
        phase: 'attack' as const,
        turn: 5,
        cards: [],
        gameConfig: {
          movementType: 'classic_adjacent',
          allowTeamPlay: false,
          teamMode: 'none',
          numberOfTeams: null,
          maxPlayers: 2,
          mapId: 'test-map',
          gameMode: 'standard',
          sectorBonuses,
        },
        movementTracking: {},
      }

      await gameStateCache.setGameState(gameIdComplete, completionState)

      const membershipMap = new Map([
        [
          'attacker',
          {
            clanId: 'clan-1',
            clanSlug: 'clan-one',
            clanName: 'Clan One',
            roleName: 'Member',
            status: 'active',
          },
        ],
      ])

      const now = new Date('2025-10-01T00:00:00.000Z')
      mockEvaluateFlagByName.mockResolvedValue(true)
      mockGetActiveMembershipsForUsers.mockResolvedValue(membershipMap)
      mockAwardContribution.mockResolvedValue({
        clanId: 'clan-1',
        totalXp: 1200,
        level: 2,
        leveledUp: false,
        progression: {
          clanId: 'clan-1',
          totalXp: 1200,
          level: 2,
          currentLevelXp: 1000,
          nextLevelXp: 1500,
          xpIntoLevel: 200,
          xpToNextLevel: 300,
          progressPercent: 200 / 500,
        },
        objectiveUpdates: [],
      })

      const emit = jest.fn()
      const mockTo = jest.fn(() => ({ emit }))
      mockTryGetSocketServer.mockReturnValue({
        to: mockTo,
      })

      mockTransaction.mockImplementation(
        async (callback: (client: unknown) => Promise<unknown>) => {
          const client = {
            query: jest
              .fn()
              .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // existing game_results
              .mockResolvedValueOnce({
                rows: [{ map_id: 'test-map', started_at: now, ended_at: null }],
                rowCount: 1,
              })
              .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // update game_rooms
              .mockResolvedValueOnce({
                rows: [
                  { id: 'attacker', username: 'Attacker', skill_rating: 1200, created_at: now },
                  { id: 'defender', username: 'Defender', skill_rating: 1100, created_at: now },
                ],
                rowCount: 2,
              })
              .mockResolvedValueOnce({
                rows: [
                  { user_id: 'attacker', games_played: 10 },
                  { user_id: 'defender', games_played: 5 },
                ],
                rowCount: 2,
              })
              .mockResolvedValueOnce({ rows: [], rowCount: 1 })
              .mockResolvedValueOnce({ rows: [], rowCount: 2 })
              .mockResolvedValueOnce({ rows: [], rowCount: 2 })
              .mockResolvedValue({ rows: [], rowCount: 1 }),
          }
          return callback(client as any)
        },
      )

      const result = await gameService.applyBattleResult(gameIdComplete, {
        attackerLosses: 0,
        defenderLosses: 1,
        territoryConquered: true,
        attackingArmiesRemaining: 4,
        defendingArmiesRemaining: 0,
        dice: { attacker: [6, 5, 3], defender: [2] },
        jobId: 'battle-final',
        attackingTerritoryId: 'attacking',
        defendingTerritoryId: 'defending',
        attackingPlayerId: 'attacker',
        defendingPlayerId: 'defender',
        attackingArmiesCommitted: 3,
      })

      expect(result.applied).toBe(true)
      expect(mockEvaluateFlagByName).toHaveBeenCalledWith('clans_enabled')
      expect(mockGetActiveMembershipsForUsers).toHaveBeenCalledWith(['attacker', 'defender'])
      expect(mockAwardContribution).toHaveBeenCalledWith(
        expect.objectContaining({
          clanId: 'clan-1',
          userId: 'attacker',
          matchesPlayed: 1,
          matchesWon: 1,
          source: 'game_result',
        }),
      )
      const awardedXp = mockAwardContribution.mock.calls[0]?.[0]?.xp
      expect(awardedXp).toBeGreaterThanOrEqual(400)
      expect(mockAwardContribution).toHaveBeenCalledTimes(1)
      expect(mockTo).toHaveBeenCalledWith('clan:clan-1')
      expect(emit).toHaveBeenCalledWith(
        'clan:progress',
        expect.objectContaining({
          clanId: 'clan-1',
          userId: 'attacker',
          xpAwarded: expect.any(Number),
        }),
      )
    })
  })

  describe('executeAiTurn', () => {
    it('applies the fallback plan for an AI player and advances the turn', async () => {
      const roomId = 'ai-room'
      await gameService.initializeGame(
        roomId,
        [
          { userId: 'human', username: 'Human' },
          { userId: 'ai', username: 'AI Recruit', isAi: true, aiDifficulty: 'recruit' },
        ],
        buildConfig(),
      )

      const stateBefore = await gameService.getGameState(roomId)
      expect(stateBefore).not.toBeNull()
      if (!stateBefore) throw new Error('state expected')

      stateBefore.currentPlayer = 'ai'
      stateBefore.players = stateBefore.players.map((player) =>
        player.id === 'ai'
          ? { ...player, isAi: true, aiDifficulty: 'recruit', aiPersonalitySeed: 42 }
          : { ...player, isAi: false },
      )

      await gameStateCache.setGameState(roomId, stateBefore)

      const chooseSpy = jest.spyOn(aiDecisionService, 'chooseAction')
      chooseSpy.mockResolvedValueOnce({
        actions: [],
        usedFallback: true,
        reason: 'stubbed',
        diagnostics: {
          generatedAt: new Date().toISOString(),
          durationMs: 0,
          requestedDifficulty: 'recruit',
          plannedActionCount: 0,
          budget: {
            maxThinkTimeMs: 1000,
            maxPlannedActions: 4,
          },
        },
      })

      const result = await gameService.executeAiTurn(roomId)

      expect(result.fallbackUsed).toBe(true)
      expect(result.fallbackReason).toBe('stubbed')
      const hasDeploy = result.appliedActions.some(action => action.type === 'deploy')
      const endsWithEndTurn = result.appliedActions.slice(hasDeploy ? 1 : 0).every(action => action.type === 'end_turn')
      expect(endsWithEndTurn).toBe(true)

      const persisted = await gameService.getGameState(roomId)
      expect(persisted?.currentPlayer).not.toBe('ai')

      const metrics = aiTurnMetrics.snapshot()
      expect(metrics.counters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            metric: 'ai_turns_total',
            value: 1,
            labels: { difficulty: 'recruit' },
          }),
          expect.objectContaining({
            metric: 'ai_turn_fallback_total',
            value: 1,
            labels: { difficulty: 'recruit', reason: 'stubbed' },
          }),
        ]),
      )
      expect(metrics.gauges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            metric: 'ai_turn_actions_planned',
            value: 0,
            labels: { difficulty: 'recruit' },
          }),
          expect.objectContaining({
            metric: 'ai_turn_actions_applied',
            value: 4,
            labels: { difficulty: 'recruit' },
          }),
        ]),
      )
    })

    it('falls back when the decision plan is invalid', async () => {
      const roomId = 'ai-invalid-plan'
      await gameService.initializeGame(
        roomId,
        [
          { userId: 'alpha', username: 'Alpha' },
          { userId: 'beta', username: 'Beta', isAi: true, aiDifficulty: 'recruit' },
        ],
        buildConfig(),
      )

      const initialState = await gameService.getGameState(roomId)
      expect(initialState).not.toBeNull()
      if (!initialState) throw new Error('state expected')

      initialState.currentPlayer = 'beta'
      initialState.players = initialState.players.map((player) =>
        player.id === 'beta'
          ? { ...player, isAi: true, aiDifficulty: 'recruit' }
          : { ...player, isAi: false },
      )

      await gameStateCache.setGameState(roomId, initialState)

      const chooseSpy = jest.spyOn(aiDecisionService, 'chooseAction')
      chooseSpy.mockResolvedValueOnce({
        actions: [
          {
            type: 'end_turn',
            roomId,
            playerId: 'alpha',
          },
        ] as GameAction[],
        usedFallback: false,
        diagnostics: {
          generatedAt: new Date().toISOString(),
          durationMs: 1,
          requestedDifficulty: 'recruit',
          plannedActionCount: 1,
          budget: {
            maxThinkTimeMs: 1000,
          },
        },
      })

      const result = await gameService.executeAiTurn(roomId)
      expect(result.fallbackUsed).toBe(true)
      expect(result.fallbackReason).toBe('invalid_plan')
      expect(result.appliedActions.length).toBeGreaterThan(0)
      expect(result.appliedActions.every((action) => action.playerId === 'beta')).toBe(true)

      const metrics = aiTurnMetrics.snapshot()
      expect(metrics.counters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            metric: 'ai_turns_total',
            value: 1,
            labels: { difficulty: 'recruit' },
          }),
          expect.objectContaining({
            metric: 'ai_turn_fallback_total',
            value: 1,
            labels: { difficulty: 'recruit', reason: 'invalid_plan' },
          }),
        ]),
      )
      expect(metrics.gauges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            metric: 'ai_turn_actions_planned',
            value: 1,
            labels: { difficulty: 'recruit' },
          }),
          expect.objectContaining({
            metric: 'ai_turn_actions_applied',
            value: result.appliedActions.length,
            labels: { difficulty: 'recruit' },
          }),
        ]),
      )

      chooseSpy.mockRestore()
    })
  })

  describe('assassination telemetry', () => {
    it('records contract assignments when starting an assassination match', async () => {
      const roomId = 'assassination-telemetry-init'
      const players = ['hunter', 'target', 'bystander']

      await gameService.initializeGame(
        roomId,
        createPlayers(players),
        buildConfig({ gameMode: 'assassination' }),
      )

      const metrics = assassinationMetrics.snapshot()
      const assignmentCounters = metrics.counters.filter(
        (entry) => entry.metric === 'assassination_assignment_total',
      )

      expect(assignmentCounters).toHaveLength(players.length)
      assignmentCounters.forEach((entry) => {
        expect(entry.value).toBe(1)
        expect(entry.labels.gameId).toBe(roomId)
        expect(entry.labels.turn).toBe('0')
        expect(entry.labels.hunterId).toBeTruthy()
        expect(entry.labels.targetId).toBeTruthy()
      })
    })

    it('records eliminations when a hunter defeats their contract target', async () => {
      const roomId = 'assassination-telemetry-elim'

      const manualState: GameState = {
        roomId,
        players: [
          {
            id: 'hunter',
            username: 'Hunter',
            color: 'red',
            armies: 6,
            territories: ['attacking'],
            cards: [],
            isEliminated: false,
          },
          {
            id: 'target',
            username: 'Target',
            color: 'blue',
            armies: 2,
            territories: ['defending'],
            cards: [],
            isEliminated: false,
          },
          {
            id: 'bystander',
            username: 'Bystander',
            color: 'green',
            armies: 3,
            territories: ['support'],
            cards: [],
            isEliminated: false,
          },
        ],
        currentPlayer: 'hunter',
        phase: 'attack',
        turn: 4,
        board: [
          {
            id: 'attacking',
            name: 'Attacking Territory',
            sector: 'c1',
            sector: 'c1',
            ownerId: 'hunter',
            armies: 4,
            adjacentTerritories: ['defending', 'support'],
          },
          {
            id: 'defending',
            name: 'Defending Territory',
            sector: 'c1',
            sector: 'c1',
            ownerId: 'target',
            armies: 1,
            adjacentTerritories: ['attacking'],
          },
          {
            id: 'support',
            name: 'Support Territory',
            sector: 'c2',
            sector: 'c2',
            ownerId: 'bystander',
            armies: 3,
            adjacentTerritories: ['attacking'],
          },
        ],
        cards: [],
        gameConfig: {
          movementType: 'classic_adjacent',
          allowTeamPlay: false,
          teamMode: 'none',
          numberOfTeams: null,
          maxPlayers: 3,
          mapId: 'test-map',
          gameMode: 'assassination',
          sectorBonuses,
          sectorBonuses: sectorBonuses,
        },
        movementTracking: {},
        assassinationTargets: {
          hunter: 'target',
          target: 'bystander',
          bystander: 'hunter',
        },
      }

      await gameStateCache.setGameState(roomId, manualState)

      const simulateSpy = jest
        .spyOn(
          (gameService as unknown as { gameEngine: { simulateBattle: Function } }).gameEngine,
          'simulateBattle',
        )
        .mockReturnValue({
          attackerDice: [6],
          defenderDice: [1],
          attackerLosses: 0,
          defenderLosses: 1,
        })

      const result = await gameService.attack(roomId, 'hunter', 'attacking', 'defending')
      expect(result.gameEnded).toBe(true)
      simulateSpy.mockRestore()

      const metrics = assassinationMetrics.snapshot()
      const eliminationCounters = metrics.counters.filter(
        (entry) => entry.metric === 'assassination_elimination_total',
      )

      expect(eliminationCounters).toHaveLength(1)
      expect(eliminationCounters[0].value).toBe(1)
      expect(eliminationCounters[0].labels).toMatchObject({
        gameId: roomId,
        hunterId: 'hunter',
        targetId: 'target',
        eliminatorId: 'hunter',
        resolution: 'direct',
      })
    })
  })

  describe('neutralizePlayerAndResolve', () => {
    it('declares the hunter the winner if their target is neutralized in assassination mode', async () => {
      const roomId = 'assassination-neutralize'
      const players = ['hunter', 'target', 'bystander']

      const initialState = await gameService.initializeGame(
        roomId,
        createPlayers(players),
        buildConfig({ gameMode: 'assassination' }),
      )

      const assignments = initialState.assassinationTargets ?? {}
      const [hunterId, targetId] = Object.entries(assignments)[0] ?? []

      expect(hunterId).toBeDefined()
      expect(targetId).toBeDefined()

      if (!targetId) {
        throw new Error('No assassination target assigned in test setup')
      }

      const result = await gameService.neutralizePlayerAndResolve(roomId, targetId)

      expect(result).not.toBeNull()
      expect(result?.elimination.gameEnded).toBe(true)
      expect(result?.elimination.winner?.id).toBe(hunterId)
      expect(result?.state.phase).toBe('finished')

      const eliminationCounters = assassinationMetrics
        .snapshot()
        .counters.filter((entry) => entry.metric === 'assassination_elimination_total')

      expect(eliminationCounters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: 1,
            labels: expect.objectContaining({
              gameId: roomId,
              hunterId,
              targetId,
              resolution: 'resignation',
            }),
          }),
        ]),
      )
    })
  })
})
