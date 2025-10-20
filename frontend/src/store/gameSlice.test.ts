import { configureStore } from '@reduxjs/toolkit'
import type { GameState, PlayerColor } from '../types/game'
import gameReducer, {
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

    it('derives winner metadata from a finished snapshot', () => {
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
      expect(state.currentGame?.phase).toBe('finished')
      expect(state.gameResult).toEqual({
        winnerIds: ['player1'],
        eliminatedPlayerIds: ['player2'],
        endedAt: null,
      })
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
