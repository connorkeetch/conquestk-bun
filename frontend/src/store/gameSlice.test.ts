import type { GameDelta } from '@conquestk/shared'
import { configureStore } from '@reduxjs/toolkit'
import type { GameState, PlayerColor } from '../types/game'
import gameReducer, {
  applyDelta,
  selectTargetTerritory,
  selectTerritory,
  setGameState,
  setPendingAction,
  setValidTargets,
  updateTerritory,
} from './gameSlice'

describe('gameSlice', () => {
  const createTestStore = () =>
    configureStore({
      reducer: {
        game: gameReducer,
      },
    })

  let store: ReturnType<typeof createTestStore>

  beforeEach(() => {
    store = createTestStore()
  })

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = store.getState().game

      expect(state.currentGame).toBeNull()
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
      expect(state.selectedTerritory).toBeNull()
      expect(state.selectedTargetTerritory).toBeNull()
      expect(state.validTargets).toEqual([])
      expect(state.pendingAction).toBeNull()
      expect(state.territoryActionHistory).toEqual([])
      expect(state.gameResult).toBeNull()
    })
  })

  describe('territory selection', () => {
    it('should select a territory', () => {
      store.dispatch(selectTerritory('alaska'))

      const state = store.getState().game
      expect(state.selectedTerritory).toBe('alaska')
    })

    it('should clear territory selection', () => {
      store.dispatch(selectTerritory('alaska'))
      store.dispatch(selectTerritory(null))

      const state = store.getState().game
      expect(state.selectedTerritory).toBeNull()
    })

    it('should select target territory', () => {
      store.dispatch(selectTargetTerritory('siberia'))

      const state = store.getState().game
      expect(state.selectedTargetTerritory).toBe('siberia')
    })
  })

  describe('pending actions', () => {
    it('should set pending action', () => {
      store.dispatch(setPendingAction('attack'))

      const state = store.getState().game
      expect(state.pendingAction).toBe('attack')
    })

    it('should clear selections when clearing pending action', () => {
      // Set up some selections
      store.dispatch(selectTerritory('alaska'))
      store.dispatch(selectTargetTerritory('siberia'))
      store.dispatch(setPendingAction('attack'))

      // Clear pending action
      store.dispatch(setPendingAction(null))

      const state = store.getState().game
      expect(state.pendingAction).toBeNull()
      expect(state.selectedTerritory).toBeNull()
      expect(state.selectedTargetTerritory).toBeNull()
      expect(state.validTargets).toEqual([])
    })
  })

  describe('game state management', () => {
    const mockGameState: GameState = {
      roomId: 'test-room',
      version: 1,
      players: [
        {
          id: 'player1',
          userId: 'player1',
          username: 'Player 1',
          color: 'red' as PlayerColor,
          armies: 0,
          territories: [],
          cards: [],
          isEliminated: false,
        },
      ],
      currentPlayer: 'player1',
      phase: 'reinforcement' as const,
      turn: 1,
      board: [
        {
          id: 'alaska',
          name: 'Alaska',
          sector: 'north_america',
          ownerId: 'player1',
          armies: 3,
          adjacentTerritories: ['kamchatka'],
        },
      ],
      cards: [],
      gameConfig: {
        movementType: 'classic_adjacent',
        maxPlayers: 2,
      },
    }

    it('should set game state', () => {
      store.dispatch(setGameState(mockGameState))

      const state = store.getState().game
      expect(state.currentGame).toEqual(mockGameState)
    })

    it('should update territory', () => {
      store.dispatch(setGameState(mockGameState))
      store.dispatch(
        updateTerritory({
          territoryId: 'alaska',
          armies: 5,
          ownerId: 'player2',
        }),
      )

      const state = store.getState().game
      const alaskaTerritory = state.currentGame?.board.find((t) => t.id === 'alaska')

      expect(alaskaTerritory?.armies).toBe(5)
      expect(alaskaTerritory?.ownerId).toBe('player2')
    })

    it('applies nested battle result changes to the game state', () => {
      const battleState: GameState = {
        ...mockGameState,
        players: [
          {
            ...mockGameState.players[0],
            armies: 3,
            territories: ['alaska'],
          },
          {
            id: 'player2',
            userId: 'player2',
            username: 'Player 2',
            color: 'blue',
            armies: 2,
            territories: ['siberia'],
            cards: [],
            isEliminated: false,
          },
        ],
        board: [
          {
            id: 'alaska',
            name: 'Alaska',
            sector: 'north_america',
            ownerId: 'player1',
            armies: 3,
            adjacentTerritories: ['siberia'],
          },
          {
            id: 'siberia',
            name: 'Siberia',
            sector: 'asia',
            ownerId: 'player2',
            armies: 2,
            adjacentTerritories: ['alaska'],
          },
        ],
      }

      store.dispatch(setGameState(battleState))

      const battleDelta = {
        type: 'BATTLE_RESULT',
        roomId: 'test-room',
        timestamp: Date.now(),
        battleResult: {
          attackerId: 'player1',
          defenderId: 'player2',
          attackerDice: [6, 5, 4],
          defenderDice: [3, 2],
          attackerLosses: 0,
          defenderLosses: 2,
          conquered: true,
          fromTerritory: { id: 'alaska', armies: 3 },
          toTerritory: { id: 'siberia', armies: 2, ownerId: 'player1' },
        },
        changes: [
          {
            type: 'TERRITORY_UPDATE',
            roomId: 'test-room',
            territoryId: 'alaska',
            changes: { armies: 3 },
            timestamp: Date.now(),
          },
          {
            type: 'TERRITORY_UPDATE',
            roomId: 'test-room',
            territoryId: 'siberia',
            changes: { armies: 2, ownerId: 'player1' },
            timestamp: Date.now(),
          },
        ],
      } as unknown as GameDelta

      store.dispatch(applyDelta(battleDelta))

      const updated = store.getState().game.currentGame
      expect(updated?.board.find((t) => t.id === 'siberia')?.ownerId).toBe('player1')
      expect(store.getState().game.battleResult?.conquered).toBe(true)
    })

    it('derives game result metadata from a finished game snapshot', () => {
      const finishedState: GameState = {
        ...mockGameState,
        phase: 'finished',
        players: [
          {
            ...mockGameState.players[0],
            territories: ['alaska'],
            armies: 12,
            isEliminated: false,
          },
          {
            id: 'player2',
            userId: 'player2',
            username: 'Player 2',
            color: 'blue' as PlayerColor,
            armies: 0,
            territories: [],
            cards: [],
            isEliminated: true,
          },
        ],
      }

      store.dispatch(setGameState(finishedState))

      const state = store.getState().game
      expect(state.gameResult).toEqual({
        winnerIds: ['player1'],
        eliminatedPlayerIds: ['player2'],
        endedAt: null,
      })
    })

    it('persists winner metadata from GAME_END delta', () => {
      const twoPlayerState: GameState = {
        ...mockGameState,
        phase: 'attack',
        players: [
          {
            ...mockGameState.players[0],
            territories: ['alaska'],
            armies: 5,
            isEliminated: false,
          },
          {
            id: 'player2',
            userId: 'player2',
            username: 'Player 2',
            color: 'blue' as PlayerColor,
            armies: 0,
            territories: [],
            cards: [],
            isEliminated: false,
          },
        ],
      }

      store.dispatch(setGameState(twoPlayerState))

      store.dispatch(
        applyDelta({
          type: 'GAME_END',
          roomId: 'test-room',
          timestamp: Date.now(),
          winner: 'player1',
          eliminatedPlayers: ['player2'],
        } as GameDelta),
      )

      const state = store.getState().game
      expect(state.currentGame?.phase).toBe('finished')
      expect((state.currentGame as GameState & { winner?: string }).winner).toBe('player1')
      expect(state.gameResult).toEqual({
        winnerIds: ['player1'],
        eliminatedPlayerIds: ['player2'],
        endedAt: null,
      })
    })
  })

  describe('delta version tracking', () => {
    const createVersionedGameState = (): GameState => ({
      roomId: 'version-room',
      version: 5,
      players: [
        {
          id: 'player1',
          userId: 'player1',
          username: 'Player 1',
          color: 'red' as PlayerColor,
          armies: 3,
          territories: ['alaska'],
          cards: [],
          isEliminated: false,
        },
      ],
      currentPlayer: 'player1',
      phase: 'reinforcement',
      turn: 4,
      board: [
        {
          id: 'alaska',
          name: 'Alaska',
          sector: 'north_america',
          ownerId: 'player1',
          armies: 3,
          adjacentTerritories: ['kamchatka'],
        },
      ],
      cards: [],
      gameConfig: {
        movementType: 'classic_adjacent',
        maxPlayers: 2,
      },
    })

    it('accepts repeated delta versions without forcing a resync', () => {
      store.dispatch(setGameState(createVersionedGameState()))

      const updateDelta = {
        type: 'PLAYER_UPDATE',
        roomId: 'version-room',
        playerId: 'player1',
        changes: { armies: 7 },
        timestamp: Date.now(),
        version: 6,
      } as unknown as GameDelta

      store.dispatch(applyDelta(updateDelta))

      let state = store.getState().game
      expect(state.currentGame?.version).toBe(6)
      expect(state.needsResync).toBe(false)
      expect(state.currentGame?.players[0].armies).toBe(7)

      // Re-delivery should not flip resync flag or advance version
      store.dispatch(applyDelta(updateDelta))

      state = store.getState().game
      expect(state.currentGame?.version).toBe(6)
      expect(state.needsResync).toBe(false)
      expect(state.currentGame?.players[0].armies).toBe(7)
    })

    it('ignores stale delta versions without mutating state', () => {
      store.dispatch(setGameState(createVersionedGameState()))

      const staleDelta = {
        type: 'PLAYER_UPDATE',
        roomId: 'version-room',
        playerId: 'player1',
        changes: { armies: 1 },
        timestamp: Date.now(),
        version: 4,
      } as unknown as GameDelta

      store.dispatch(applyDelta(staleDelta))

      const state = store.getState().game
      expect(state.currentGame?.version).toBe(5)
      expect(state.currentGame?.players[0].armies).toBe(3)
      expect(state.needsResync).toBe(false)
    })

    it('flags forward gaps larger than one for resync', () => {
      store.dispatch(setGameState(createVersionedGameState()))

      const gapDelta = {
        type: 'PLAYER_UPDATE',
        roomId: 'version-room',
        playerId: 'player1',
        changes: { armies: 10 },
        timestamp: Date.now(),
        version: 8,
      } as unknown as GameDelta

      store.dispatch(applyDelta(gapDelta))

      const state = store.getState().game
      expect(state.currentGame?.version).toBe(5)
      expect(state.currentGame?.players[0].armies).toBe(3)
      expect(state.needsResync).toBe(true)
    })
  })

  describe('valid targets', () => {
    it('should set valid targets', () => {
      const targets = ['siberia', 'china', 'mongolia']
      store.dispatch(setValidTargets(targets))

      const state = store.getState().game
      expect(state.validTargets).toEqual(targets)
    })

    it('should clear valid targets', () => {
      store.dispatch(setValidTargets(['siberia', 'china']))
      store.dispatch(setValidTargets([]))

      const state = store.getState().game
      expect(state.validTargets).toEqual([])
    })

    it('allows reinforcement selection on teammate territory when team play is enabled', () => {
      const teamGameState: GameState = {
        roomId: 'team-room',
        players: [
          {
            id: 'player1',
            userId: 'player1',
            username: 'Player 1',
            color: 'red',
            armies: 0,
            territories: ['alpha'],
            cards: [],
            isEliminated: false,
            teamId: 1,
          },
          {
            id: 'player2',
            userId: 'player2',
            username: 'Player 2',
            color: 'blue',
            armies: 0,
            territories: ['beta'],
            cards: [],
            isEliminated: false,
            teamId: 1,
          },
        ],
        currentPlayer: 'player1',
        phase: 'reinforcement',
        turn: 2,
        board: [
          {
            id: 'alpha',
            name: 'Alpha',
            sector: 'north_america',
            ownerId: 'player1',
            armies: 3,
            adjacentTerritories: ['beta'],
          },
          {
            id: 'beta',
            name: 'Beta',
            sector: 'north_america',
            ownerId: 'player2',
            armies: 2,
            adjacentTerritories: ['alpha'],
          },
        ],
        cards: [],
        gameConfig: {
          mapId: 'classic',
          gameMode: 'standard',
          maxPlayers: 6,
          movementSystem: 'classic',
          fogOfWar: 'off',
          startingArmies: 0,
          isRanked: false,
          isPrivate: false,
          allowTeamPlay: true,
          movementType: 'classic_adjacent',
        },
      }

      store.dispatch(setGameState(teamGameState))
      store.dispatch(selectTerritory('beta'))

      const state = store.getState().game
      expect(state.validTargets).toEqual(['beta'])
    })

    it('rejects teammate territory selection when team play is disabled', () => {
      const noTeamGameState: GameState = {
        roomId: 'team-room',
        players: [
          {
            id: 'player1',
            userId: 'player1',
            username: 'Player 1',
            color: 'red',
            armies: 0,
            territories: ['alpha'],
            cards: [],
            isEliminated: false,
          },
          {
            id: 'player2',
            userId: 'player2',
            username: 'Player 2',
            color: 'blue',
            armies: 0,
            territories: ['beta'],
            cards: [],
            isEliminated: false,
          },
        ],
        currentPlayer: 'player1',
        phase: 'reinforcement',
        turn: 2,
        board: [
          {
            id: 'alpha',
            name: 'Alpha',
            sector: 'north_america',
            ownerId: 'player1',
            armies: 3,
            adjacentTerritories: ['beta'],
          },
          {
            id: 'beta',
            name: 'Beta',
            sector: 'north_america',
            ownerId: 'player2',
            armies: 2,
            adjacentTerritories: ['alpha'],
          },
        ],
        cards: [],
        gameConfig: {
          mapId: 'classic',
          gameMode: 'standard',
          maxPlayers: 6,
          movementSystem: 'classic',
          fogOfWar: 'off',
          startingArmies: 0,
          isRanked: false,
          isPrivate: false,
          allowTeamPlay: false,
          movementType: 'classic_adjacent',
        },
      }

      store.dispatch(setGameState(noTeamGameState))
      store.dispatch(selectTerritory('beta'))

      const state = store.getState().game
      expect(state.validTargets).toEqual([])
    })
  })
})
