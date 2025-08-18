import { GameEngine } from '../game/gameEngine';
import { GameState, GameAction } from '../types/game';

export class GameService {
  private gameEngine = new GameEngine();
  private activeGames = new Map<string, GameState>();

  async processGameAction(action: GameAction, userId: string): Promise<GameState> {
    const gameState = this.activeGames.get(action.roomId);
    
    if (!gameState) {
      throw new Error('Game not found');
    }

    if (!this.isValidAction(action, userId, gameState)) {
      throw new Error('Invalid action');
    }

    const updatedState = this.gameEngine.processAction(gameState, action);
    this.activeGames.set(action.roomId, updatedState);

    return updatedState;
  }

  async initializeGame(roomId: string, players: string[], gameConfig?: any): Promise<GameState> {
    // Default game configuration
    const defaultGameConfig = {
      movementType: 'classic_adjacent' as const,
      allowTeamPlay: false,
      maxPlayers: 6,
      mapId: 'classic',
      gameMode: 'standard'
    };
    
    const config = gameConfig || defaultGameConfig;
    const gameState = this.gameEngine.initializeGame(roomId, players, config);
    this.activeGames.set(roomId, gameState);
    return gameState;
  }

  async getGameState(roomId: string): Promise<GameState | null> {
    return this.activeGames.get(roomId) || null;
  }

  async deployArmies(roomId: string, userId: string, territoryId: string, armies: number) {
    const gameState = this.activeGames.get(roomId);
    if (!gameState) throw new Error('Game not found');
    if (gameState.currentPlayer !== userId) throw new Error('Not your turn');
    if (gameState.phase !== 'reinforcement') throw new Error('Not reinforcement phase');

    const action: GameAction = {
      type: 'deploy',
      roomId,
      playerId: userId,
      payload: { territoryId, armies }
    };

    if (!this.gameEngine.validateAction(gameState, action)) {
      throw new Error('Invalid deployment');
    }

    const updatedState = this.gameEngine.processAction(gameState, action);
    this.activeGames.set(roomId, updatedState);

    return {
      gameState: updatedState,
      territoryId,
      armies: updatedState.board.find((t: any) => t.id === territoryId)?.armies || 0
    };
  }

  async attack(roomId: string, userId: string, fromTerritoryId: string, toTerritoryId: string) {
    const gameState = this.activeGames.get(roomId);
    if (!gameState) throw new Error('Game not found');
    if (gameState.currentPlayer !== userId) throw new Error('Not your turn');
    if (gameState.phase !== 'attack') throw new Error('Not attack phase');

    const action: GameAction = {
      type: 'attack',
      roomId,
      playerId: userId,
      payload: { fromTerritoryId, toTerritoryId }
    };

    if (!this.gameEngine.validateAction(gameState, action)) {
      throw new Error('Invalid attack');
    }

    const battleResult = this.gameEngine.processAction(gameState, action);
    this.activeGames.set(roomId, gameState);

    return {
      ...battleResult,
      gameState
    };
  }

  async fortify(roomId: string, userId: string, fromTerritoryId: string, toTerritoryId: string, armies: number) {
    const gameState = this.activeGames.get(roomId);
    if (!gameState) throw new Error('Game not found');
    if (gameState.currentPlayer !== userId) throw new Error('Not your turn');
    if (gameState.phase !== 'fortify') throw new Error('Not fortify phase');

    const action: GameAction = {
      type: 'fortify',
      roomId,
      playerId: userId,
      payload: { fromTerritoryId, toTerritoryId, armies }
    };

    if (!this.gameEngine.validateAction(gameState, action)) {
      throw new Error('Invalid fortification');
    }

    const updatedState = this.gameEngine.processAction(gameState, action);
    this.activeGames.set(roomId, updatedState);

    return {
      gameState: updatedState,
      fromTerritoryId,
      toTerritoryId,
      fromArmies: updatedState.board.find((t: any) => t.id === fromTerritoryId)?.armies || 0,
      toArmies: updatedState.board.find((t: any) => t.id === toTerritoryId)?.armies || 0
    };
  }

  async endTurn(roomId: string, userId: string) {
    const gameState = this.activeGames.get(roomId);
    if (!gameState) throw new Error('Game not found');
    if (gameState.currentPlayer !== userId) throw new Error('Not your turn');

    const updatedState = this.gameEngine.advancePhase(gameState);
    this.activeGames.set(roomId, updatedState);

    // Calculate reinforcement armies if moving to reinforcement phase
    let reinforcementArmies = 0;
    if (updatedState.phase === 'reinforcement') {
      reinforcementArmies = this.gameEngine.calculateBaseReinforcementArmies(updatedState, updatedState.currentPlayer);
    }

    return {
      gameState: updatedState,
      reinforcementArmies
    };
  }

  private isValidAction(action: GameAction, userId: string, gameState: GameState): boolean {
    if (gameState.currentPlayer !== userId) {
      return false;
    }

    return this.gameEngine.validateAction(gameState, action);
  }
}