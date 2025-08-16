import { configureStore } from '@reduxjs/toolkit';
import gameReducer, {
  selectTerritory,
  selectTargetTerritory,
  setPendingAction,
  setGameState,
  updateTerritory,
  setValidTargets
} from './gameSlice';

describe('gameSlice', () => {
  let store: any;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        game: gameReducer,
      },
    });
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = store.getState().game;
      
      expect(state.currentGame).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.selectedTerritory).toBeNull();
      expect(state.selectedTargetTerritory).toBeNull();
      expect(state.validTargets).toEqual([]);
      expect(state.pendingAction).toBeNull();
      expect(state.territoryActionHistory).toEqual([]);
    });
  });

  describe('territory selection', () => {
    it('should select a territory', () => {
      store.dispatch(selectTerritory('alaska'));
      
      const state = store.getState().game;
      expect(state.selectedTerritory).toBe('alaska');
    });

    it('should clear territory selection', () => {
      store.dispatch(selectTerritory('alaska'));
      store.dispatch(selectTerritory(null));
      
      const state = store.getState().game;
      expect(state.selectedTerritory).toBeNull();
    });

    it('should select target territory', () => {
      store.dispatch(selectTargetTerritory('siberia'));
      
      const state = store.getState().game;
      expect(state.selectedTargetTerritory).toBe('siberia');
    });
  });

  describe('pending actions', () => {
    it('should set pending action', () => {
      store.dispatch(setPendingAction('attack'));
      
      const state = store.getState().game;
      expect(state.pendingAction).toBe('attack');
    });

    it('should clear selections when clearing pending action', () => {
      // Set up some selections
      store.dispatch(selectTerritory('alaska'));
      store.dispatch(selectTargetTerritory('siberia'));
      store.dispatch(setPendingAction('attack'));
      
      // Clear pending action
      store.dispatch(setPendingAction(null));
      
      const state = store.getState().game;
      expect(state.pendingAction).toBeNull();
      expect(state.selectedTerritory).toBeNull();
      expect(state.selectedTargetTerritory).toBeNull();
      expect(state.validTargets).toEqual([]);
    });
  });

  describe('game state management', () => {
    const mockGameState = {
      roomId: 'test-room',
      players: [
        { id: 'player1', username: 'Player 1', color: 'red', armies: 0, territories: [], cards: [], isEliminated: false }
      ],
      currentPlayer: 'player1',
      phase: 'reinforcement' as const,
      turn: 1,
      board: [
        { id: 'alaska', name: 'Alaska', continent: 'north_america', ownerId: 'player1', armies: 3, adjacentTerritories: ['kamchatka'] }
      ],
      cards: []
    };

    it('should set game state', () => {
      store.dispatch(setGameState(mockGameState));
      
      const state = store.getState().game;
      expect(state.currentGame).toEqual(mockGameState);
    });

    it('should update territory', () => {
      store.dispatch(setGameState(mockGameState));
      store.dispatch(updateTerritory({
        territoryId: 'alaska',
        armies: 5,
        ownerId: 'player2'
      }));
      
      const state = store.getState().game;
      const alaskaTerritory = state.currentGame?.board.find(t => t.id === 'alaska');
      
      expect(alaskaTerritory?.armies).toBe(5);
      expect(alaskaTerritory?.ownerId).toBe('player2');
    });
  });

  describe('valid targets', () => {
    it('should set valid targets', () => {
      const targets = ['siberia', 'china', 'mongolia'];
      store.dispatch(setValidTargets(targets));
      
      const state = store.getState().game;
      expect(state.validTargets).toEqual(targets);
    });

    it('should clear valid targets', () => {
      store.dispatch(setValidTargets(['siberia', 'china']));
      store.dispatch(setValidTargets([]));
      
      const state = store.getState().game;
      expect(state.validTargets).toEqual([]);
    });
  });
});