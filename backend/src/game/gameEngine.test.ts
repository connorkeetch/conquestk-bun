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

import type {
  ContinentBonus,
  GameAction,
  GameConfiguration,
  GamePlayer,
  GameState,
  Territory,
} from '../types/game'
import { GameEngine } from './gameEngine.js'

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
      expect(gameState.phase).toBe('reinforcement')
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

    it('should distribute only the remainder of territories to neutral', () => {
      const players = createPlayers('player1', 'player2')
      const territoryCount = 42
      const territories = Array.from({ length: territoryCount }, (_, i) => ({
        id: `t-${i}`,
        name: `Territory ${i}`,
        sector: 's1',
        ownerId: null,
        armies: 0,
        adjacentTerritories: [],
        isCapital: false,
      }))

      const customMapOverrides = {
        territories,
        sectorBonuses: [],
      }

      const gameState = gameEngine.initializeGame(
        'room-distro-test',
        players,
        createConfig(players.length),
        customMapOverrides,
      )

      const neutralTerritories = gameState.board.filter((t) => t.ownerId === 'neutral')
      // With the buggy logic, this will be 14 (42 / 3).
      // The correct logic should assign the remainder, which is 0 (42 % 2).
      expect(neutralTerritories.length).toBe(0)
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

    it('uses provided player colors when supplied', () => {
      const players = [
        { userId: 'player1', username: 'Alpha', color: '#abc123' },
        { userId: 'player2', username: 'Beta', color: '#123abc' },
      ]

      const gameState = gameEngine.initializeGame(
        'room123',
        players,
        createConfig(players.length),
        mapOverrides,
      )

      const colorMap = new Map(gameState.players.map((player) => [player.id, player.color]))
      expect(colorMap.get('player1')).toBe('#ABC123')
      expect(colorMap.get('player2')).toBe('#123ABC')
    })

    it('assigns unique fallback colors when duplicate selections occur', () => {
      const players = [
        { userId: 'player1', username: 'Alpha', color: '#DC2626' },
        { userId: 'player2', username: 'Beta', color: '#DC2626' },
        { userId: 'player3', username: 'Gamma' },
      ]

      const gameState = gameEngine.initializeGame(
        'room123',
        players,
        createConfig(players.length),
        mapOverrides,
      )

      const colorMap = new Map(gameState.players.map((player) => [player.id, player.color]))
      const assignedColors = Array.from(colorMap.values())

      expect(colorMap.get('player1')).toBe('#DC2626')
      expect(colorMap.get('player2')).toBeDefined()
      expect(colorMap.get('player3')).toBeDefined()
      expect(colorMap.get('player2')).not.toBe('#DC2626')
      expect(new Set(assignedColors).size).toBe(players.length)
    })

    it('assigns assassination targets and disables team play when mode is assassination', () => {
      const players = createPlayers('player1', 'player2', 'player3')
      const gameState = gameEngine.initializeGame(
        'room123',
        players,
        createConfig(players.length, { gameMode: 'assassination', allowTeamPlay: true }),
        mapOverrides,
      )

      expect(gameState.gameConfig.allowTeamPlay).toBe(false)
      expect(gameState.assassinationTargets).toBeDefined()
      const assignments = gameState.assassinationTargets ?? {}
      expect(Object.keys(assignments)).toHaveLength(gameState.players.length)
      const uniqueTargets = new Set<string>(Object.values(assignments))
      expect(uniqueTargets.size).toBe(gameState.players.length)
      for (const player of gameState.players) {
        expect(assignments[player.id]).toBeDefined()
        expect(assignments[player.id]).not.toBe(player.id)
      }
    })
  })

  describe('assassination mode victory resolution', () => {
    const baseConfig: GameConfiguration = {
      movementType: 'classic_adjacent',
      allowTeamPlay: false,
      teamMode: 'none',
      numberOfTeams: null,
      maxPlayers: 3,
      mapId: 'classic',
      gameMode: 'assassination',
    }

    const createPlayerState = (overrides: Partial<GamePlayer>): GamePlayer => ({
      id: overrides.id ?? 'player',
      username: overrides.username ?? 'Player',
      color: overrides.color ?? 'red',
      armies: overrides.armies ?? 0,
      territories: overrides.territories ?? [],
      cards: overrides.cards ?? [],
      isEliminated: overrides.isEliminated ?? false,
      teamId: overrides.teamId ?? null,
      isAi: overrides.isAi ?? false,
      aiDifficulty: overrides.aiDifficulty ?? null,
      aiPersonalitySeed: overrides.aiPersonalitySeed ?? null,
      treasures: overrides.treasures ?? [],
      mustCashInTreasures: overrides.mustCashInTreasures ?? false,
    })

    it('declares the hunter as winner when their target is eliminated', () => {
      const gameState: GameState = {
        roomId: 'room123',
        players: [
          createPlayerState({ id: 'hunter', username: 'Hunter', territories: ['t1'] }),
          createPlayerState({ id: 'target', username: 'Target' }),
          createPlayerState({ id: 'bystander', username: 'Bystander', territories: ['t2'] }),
        ],
        currentPlayer: 'hunter',
        phase: 'attack',
        turn: 5,
        board: [
          {
            id: 't1',
            name: 'Territory 1',
            sector: 'north',
            ownerId: 'hunter',
            armies: 3,
            adjacentTerritories: [],
          },
          {
            id: 't2',
            name: 'Territory 2',
            sector: 'south',
            ownerId: 'bystander',
            armies: 2,
            adjacentTerritories: [],
          },
        ],
        cards: [],
        gameConfig: baseConfig,
        movementTracking: {},
        treasureState: undefined,
        mustCashInTreasures: false,
        conqueredDuringTurn: false,
        assassinationTargets: {
          hunter: 'target',
          target: 'bystander',
          bystander: 'hunter',
        },
      }

      const result = gameEngine.checkGameEnd(gameState)

      expect(result.gameEnded).toBe(true)
      expect(result.winner?.id).toBe('hunter')
      expect(result.eliminatedPlayers).toContain('target')
      expect(gameState.phase).toBe('finished')
      expect(gameState.currentPlayer).toBe('hunter')
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

  describe('king of the hill mode', () => {
    const hillConfig: GameConfiguration = {
      movementType: 'classic_adjacent',
      allowTeamPlay: false,
      teamMode: 'none',
      numberOfTeams: null,
      maxPlayers: 3,
      mapId: 'classic',
      gameMode: 'king_of_the_hill',
      kingOfTheHill: {
        targetPoints: 3,
        neutralArmies: 7,
        rotationOrder: ['territory-2', 'territory-3', 'territory-4'],
        rotationInterval: 1,
        previewTurns: 1,
      },
    }

    it('initializes hill state with neutral defenders', () => {
      const players = createPlayers('player1', 'player2', 'player3')
      const config = {
        ...hillConfig,
        kingOfTheHill: {
          ...(hillConfig.kingOfTheHill ?? {}),
          neutralArmies: 9,
          rotationOrder: ['territory-3', 'territory-4'],
        },
      }

      const gameState = gameEngine.initializeGame('room-hill', players, config, mapOverrides)
      expect(gameState.kingOfTheHillState).toBeDefined()
      const hillState = gameState.kingOfTheHillState!
      expect(hillState.currentHillTerritoryId).toBe('territory-3')

      const hill = gameState.board.find(
        (territory) => territory.id === hillState.currentHillTerritoryId,
      )
      expect(hill?.ownerId).toBe('neutral')
      expect(hill?.armies).toBe(9)
    })

    it('awards a single point per completed round to the hill controller', async () => {
      const players = createPlayers('holder', 'challenger')
      const staticHillConfig: GameConfiguration = {
        ...hillConfig,
        kingOfTheHill: {
          ...(hillConfig.kingOfTheHill ?? {}),
          rotationInterval: null,
        },
      }
      let gameState = gameEngine.initializeGame(
        'room-hold',
        players,
        staticHillConfig,
        mapOverrides,
      )

      const hillId = gameState.kingOfTheHillState?.currentHillTerritoryId
      expect(hillId).toBeDefined()
      const owner = gameState.players.find((player) => player.id === 'holder')
      expect(owner).toBeDefined()
      const hillTerritory = gameState.board.find((territory) => territory.id === hillId)
      expect(hillTerritory).toBeDefined()

      if (!hillId || !owner || !hillTerritory) {
        throw new Error('Hill state failed to initialize')
      }

      hillTerritory.ownerId = owner.id
      if (!owner.territories.includes(hillId)) {
        owner.territories.push(hillId)
      }

      const completeRound = async () => {
        for (let i = 0; i < gameState.players.length; i++) {
          if (gameState.players[i].isEliminated) {
            continue
          }

          gameState.phase = 'fortify'
          const action: GameAction = {
            type: 'end_turn',
            roomId: 'room-hold',
            playerId: gameState.currentPlayer,
          }
          const result = await gameEngine.processAction(gameState, action)
          gameState = result.gameState
        }
      }

      await completeRound()
      await completeRound()

      expect(gameState.kingOfTheHillState?.points[owner.id]).toBe(2)
      expect(gameState.phase).not.toBe('finished')
    })

    it('rotates the hill when the interval elapses', async () => {
      const players = createPlayers('holder', 'opponent', 'ally')
      let gameState = gameEngine.initializeGame('room-rotate', players, hillConfig, mapOverrides)

      const hillId = gameState.kingOfTheHillState?.currentHillTerritoryId
      expect(hillId).toBe('territory-2')
      const owner = gameState.players.find((player) => player.id === 'holder')
      const hillTerritory = gameState.board.find((territory) => territory.id === hillId)
      if (!hillId || !owner || !hillTerritory) {
        throw new Error('Hill state failed to initialize for rotation test')
      }

      hillTerritory.ownerId = owner.id
      if (!owner.territories.includes(hillId)) {
        owner.territories.push(hillId)
      }

      for (let i = 0; i < gameState.players.length; i++) {
        if (gameState.players[i].isEliminated) {
          continue
        }
        gameState.phase = 'fortify'
        const action: GameAction = {
          type: 'end_turn',
          roomId: 'room-rotate',
          playerId: gameState.currentPlayer,
        }
        const result = await gameEngine.processAction(gameState, action)
        gameState = result.gameState
      }

      expect(gameState.kingOfTheHillState?.currentHillTerritoryId).toBe('territory-3')
      expect(gameState.kingOfTheHillState?.upcomingHillTerritoryId).toBe('territory-4')
      expect(gameState.kingOfTheHillState?.turnsUntilRotation).toBe(1)
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

  describe('handleResign', () => {
    it('should immediately end the game when a player resigns in a two-player game', async () => {
      const players = createPlayers('player1', 'player2');
      let gameState = gameEngine.initializeGame(
        'room-resign',
        players,
        createConfig(players.length),
        mapOverrides,
      );

      const resigningPlayerId = 'player2'
      const winnerId = 'player1'
      gameState.currentPlayer = winnerId

      const action: GameAction = {
        type: 'resign',
        roomId: gameState.roomId,
        playerId: resigningPlayerId,
      };

      const { gameState: updatedState } = await gameEngine.processAction(gameState, action);

      expect(updatedState.phase).toBe('finished');
      const winner = updatedState.players.find(p => !p.isEliminated);
      expect(winner).toBeDefined();
      expect(winner?.id).toBe(winnerId);
      const resigningPlayer = updatedState.players.find(p => p.id === resigningPlayerId);
      expect(resigningPlayer?.isEliminated).toBe(true);
    });
  });
})
