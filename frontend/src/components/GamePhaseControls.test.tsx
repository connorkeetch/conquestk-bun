import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../store/gameSlice';
import authReducer from '../store/authSlice';
import roomReducer from '../store/roomSlice';
import { GamePhaseControls } from './GamePhaseControls';

import { vi } from 'vitest';

// Mock the game actions
vi.mock('../store/gameActions', () => ({
  deployArmies: vi.fn(() => ({ type: 'deployArmies' })),
  executeAttack: vi.fn(() => ({ type: 'executeAttack' })),
  executeFortify: vi.fn(() => ({ type: 'executeFortify' })),
}));

describe('GamePhaseControls', () => {
  let store: any;
  let mockOnEndTurn: any;

  const mockGameState = {
    roomId: 'test-room',
    players: [
      { 
        id: 'player1', 
        username: 'Player 1', 
        color: 'red', 
        armies: 5, 
        territories: ['alaska'], 
        cards: [], 
        isEliminated: false 
      },
      { 
        id: 'player2', 
        username: 'Player 2', 
        color: 'blue', 
        armies: 3, 
        territories: ['siberia'], 
        cards: [], 
        isEliminated: false 
      }
    ],
    currentPlayer: 'player1',
    phase: 'reinforcement' as const,
    turn: 1,
    board: [
      { 
        id: 'alaska', 
        name: 'Alaska', 
        continent: 'north_america', 
        ownerId: 'player1', 
        armies: 3, 
        adjacentTerritories: ['kamchatka'] 
      },
      { 
        id: 'siberia', 
        name: 'Siberia', 
        continent: 'asia', 
        ownerId: 'player2', 
        armies: 2, 
        adjacentTerritories: ['alaska'] 
      }
    ],
    cards: []
  };

  const mockUser = {
    id: 'player1',
    username: 'Player 1',
    email: 'player1@test.com'
  };

  beforeEach(() => {
    store = configureStore({
      reducer: {
        game: gameReducer,
        auth: authReducer,
        room: roomReducer,
      },
      preloadedState: {
        game: {
          currentGame: mockGameState,
          isLoading: false,
          error: null,
          selectedTerritory: null,
          selectedTargetTerritory: null,
          validTargets: [],
          pendingAction: null,
          territoryActionHistory: [],
          battleResult: null,
          reinforcementArmies: 5,
        },
        auth: {
          user: mockUser,
          token: 'mock-token',
          isLoading: false,
          error: null,
          isAuthenticated: true,
        },
        room: {
          currentRoom: null,
          rooms: [],
          isLoading: false,
          error: null,
        },
      },
    });

    mockOnEndTurn = vi.fn();
  });

  const renderWithProvider = (component: React.ReactElement) => {
    return render(
      <Provider store={store}>
        {component}
      </Provider>
    );
  };

  describe('reinforcement phase', () => {
    it('should show reinforcement controls when in reinforcement phase', () => {
      renderWithProvider(<GamePhaseControls onEndTurn={mockOnEndTurn} />);
      
      expect(screen.getByText('Reinforcement Phase')).toBeInTheDocument();
      expect(screen.getByText('Deploy New Armies')).toBeInTheDocument();
      expect(screen.getByText(/You have 5 new armies to deploy/)).toBeInTheDocument();
    });

    it('should show instruction when no territory selected', () => {
      renderWithProvider(<GamePhaseControls onEndTurn={mockOnEndTurn} />);
      
      expect(screen.getByText('Click on one of your territories to deploy armies')).toBeInTheDocument();
    });
  });

  describe('attack phase', () => {
    beforeEach(() => {
      // Set game to attack phase
      store.dispatch({
        type: 'game/updateGameState',
        payload: { phase: 'attack' }
      });
    });

    it('should show attack controls when in attack phase', () => {
      renderWithProvider(<GamePhaseControls onEndTurn={mockOnEndTurn} />);
      
      expect(screen.getByText('Attack Phase')).toBeInTheDocument();
      expect(screen.getByText('Attack Territories')).toBeInTheDocument();
    });
  });

  describe('fortify phase', () => {
    beforeEach(() => {
      // Set game to fortify phase
      store.dispatch({
        type: 'game/updateGameState',
        payload: { phase: 'fortify' }
      });
    });

    it('should show fortify controls when in fortify phase', () => {
      renderWithProvider(<GamePhaseControls onEndTurn={mockOnEndTurn} />);
      
      expect(screen.getByText('Fortify Phase')).toBeInTheDocument();
      expect(screen.getByText('Fortify Territories')).toBeInTheDocument();
    });
  });

  describe('end turn button', () => {
    it('should call onEndTurn when end turn button is clicked', () => {
      renderWithProvider(<GamePhaseControls onEndTurn={mockOnEndTurn} />);
      
      const endTurnButton = screen.getByText('End Turn');
      fireEvent.click(endTurnButton);
      
      expect(mockOnEndTurn).toHaveBeenCalledTimes(1);
    });

    it('should be disabled when not current player turn', () => {
      // Set different current player
      store.dispatch({
        type: 'game/updateGameState',
        payload: { currentPlayer: 'player2' }
      });

      renderWithProvider(<GamePhaseControls onEndTurn={mockOnEndTurn} />);
      
      expect(screen.getByText('Waiting for Turn')).toBeInTheDocument();
      expect(screen.getByText("It's Player 2's turn")).toBeInTheDocument();
    });
  });

  describe('when no game state', () => {
    beforeEach(() => {
      store = configureStore({
        reducer: {
          game: gameReducer,
          auth: authReducer,
          room: roomReducer,
        },
        preloadedState: {
          game: {
            currentGame: null,
            isLoading: false,
            error: null,
            selectedTerritory: null,
            selectedTargetTerritory: null,
            validTargets: [],
            pendingAction: null,
            territoryActionHistory: [],
            battleResult: null,
            reinforcementArmies: 0,
          },
          auth: {
            user: mockUser,
            token: 'mock-token',
            isLoading: false,
            error: null,
            isAuthenticated: true,
          },
          room: {
            currentRoom: null,
            rooms: [],
            isLoading: false,
            error: null,
          },
        },
      });
    });

    it('should render nothing when no game state', () => {
      const { container } = renderWithProvider(<GamePhaseControls onEndTurn={mockOnEndTurn} />);
      expect(container.firstChild).toBeNull();
    });
  });
});