import { GameEngine } from './gameEngine';
import { GameAction } from '../types/game';

describe('GameEngine', () => {
  let gameEngine: GameEngine;

  beforeEach(() => {
    gameEngine = new GameEngine();
  });

  describe('initializeGame', () => {
    it('should create a valid initial game state', () => {
      const playerIds = ['player1', 'player2', 'player3'];
      const gameState = gameEngine.initializeGame('room123', playerIds);

      expect(gameState.roomId).toBe('room123');
      expect(gameState.players).toHaveLength(3);
      expect(gameState.currentPlayer).toBe('player1');
      expect(gameState.phase).toBe('reinforcement');
      expect(gameState.turn).toBe(1);
      expect(gameState.board).toBeDefined();
      expect(gameState.board.length).toBeGreaterThan(0);
    });

    it('should distribute territories among players', () => {
      const playerIds = ['player1', 'player2'];
      const gameState = gameEngine.initializeGame('room123', playerIds);

      // Check that all territories have owners
      const unownedTerritories = gameState.board.filter(t => !t.ownerId);
      expect(unownedTerritories).toHaveLength(0);

      // Check that both players have territories
      const player1Territories = gameState.board.filter(t => t.ownerId === 'player1');
      const player2Territories = gameState.board.filter(t => t.ownerId === 'player2');
      
      expect(player1Territories.length).toBeGreaterThan(0);
      expect(player2Territories.length).toBeGreaterThan(0);
    });

    it('should give each territory at least 1 army', () => {
      const playerIds = ['player1', 'player2'];
      const gameState = gameEngine.initializeGame('room123', playerIds);

      const weakTerritories = gameState.board.filter(t => t.armies < 1);
      expect(weakTerritories).toHaveLength(0);
    });
  });

  describe('calculateReinforcementArmies', () => {
    it('should return minimum 3 armies', () => {
      const gameState = gameEngine.initializeGame('room123', ['player1', 'player2']);
      const armies = gameEngine.calculateReinforcementArmies(gameState, 'player1');
      expect(armies).toBeGreaterThanOrEqual(3);
    });

    it('should calculate armies based on territory count', () => {
      const gameState = gameEngine.initializeGame('room123', ['player1']);
      const player1Territories = gameState.board.filter(t => t.ownerId === 'player1').length;
      const expectedArmies = Math.max(3, Math.floor(player1Territories / 3));
      
      const armies = gameEngine.calculateReinforcementArmies(gameState, 'player1');
      expect(armies).toBe(expectedArmies);
    });
  });

  describe('advancePhase', () => {
    it('should advance from reinforcement to attack', () => {
      const gameState = gameEngine.initializeGame('room123', ['player1', 'player2']);
      gameState.phase = 'reinforcement';
      
      const newState = gameEngine.advancePhase(gameState);
      expect(newState.phase).toBe('attack');
      expect(newState.currentPlayer).toBe('player1'); // Same player
    });

    it('should advance from attack to fortify', () => {
      const gameState = gameEngine.initializeGame('room123', ['player1', 'player2']);
      gameState.phase = 'attack';
      
      const newState = gameEngine.advancePhase(gameState);
      expect(newState.phase).toBe('fortify');
      expect(newState.currentPlayer).toBe('player1'); // Same player
    });

    it('should advance from fortify to next player reinforcement', () => {
      const gameState = gameEngine.initializeGame('room123', ['player1', 'player2']);
      gameState.phase = 'fortify';
      gameState.currentPlayer = 'player1';
      
      const newState = gameEngine.advancePhase(gameState);
      expect(newState.phase).toBe('reinforcement');
      expect(newState.currentPlayer).toBe('player2'); // Next player
    });

    it('should increment turn when cycling back to first player', () => {
      const gameState = gameEngine.initializeGame('room123', ['player1', 'player2']);
      gameState.phase = 'fortify';
      gameState.currentPlayer = 'player2';
      gameState.turn = 1;
      
      const newState = gameEngine.advancePhase(gameState);
      expect(newState.phase).toBe('reinforcement');
      expect(newState.currentPlayer).toBe('player1');
      expect(newState.turn).toBe(2);
    });
  });

  describe('validateAction', () => {
    let gameState: any;

    beforeEach(() => {
      gameState = gameEngine.initializeGame('room123', ['player1', 'player2']);
    });

    it('should validate deploy action', () => {
      gameState.phase = 'reinforcement';
      // Find a territory owned by player1
      const territory = gameState.board.find((t: any) => t.ownerId === 'player1');
      
      const action: GameAction = {
        type: 'deploy',
        roomId: 'room123',
        playerId: 'player1',
        payload: { territoryId: territory.id, armies: 1 }
      };

      const isValid = gameEngine.validateAction(gameState, action);
      expect(isValid).toBe(true);
    });

    it('should reject deploy to enemy territory', () => {
      gameState.phase = 'reinforcement';
      // Find a territory owned by player2
      const territory = gameState.board.find((t: any) => t.ownerId === 'player2');
      
      const action: GameAction = {
        type: 'deploy',
        roomId: 'room123',
        playerId: 'player1',
        payload: { territoryId: territory.id, armies: 1 }
      };

      const isValid = gameEngine.validateAction(gameState, action);
      expect(isValid).toBe(false);
    });
  });
});