import { GameEngine } from '../game/gameEngine';
import { GameState, GameAction } from '../types/game';
import { mapService } from './mapService';
import territoryModifierService from './territoryModifierService';

export class GameService {
  private gameEngine = new GameEngine();
  private activeGames = new Map<string, GameState>();
  
  // Helper to serialize game state for transmission
  private serializeGameState(gameState: GameState): any {
    const serialized = { ...gameState };
    
    // Convert Map to object for JSON serialization
    if ((gameState as any).territoryModifiers instanceof Map) {
      const modifiersObj: any = {};
      (gameState as any).territoryModifiers.forEach((value: any, key: string) => {
        modifiersObj[key] = value;
      });
      (serialized as any).territoryModifiers = modifiersObj;
    }
    
    return serialized;
  }
  
  async isCapitalTerritory(roomId: string, territoryId: string): Promise<boolean> {
    // This is a placeholder - in a real implementation, you'd check the game state
    // or database to see if this territory is marked as a capital
    const gameState = this.activeGames.get(roomId);
    if (!gameState) return false;
    
    // Check if the game has capitals enabled and if this territory is a capital
    // This would need proper implementation based on your game state structure
    return false;
  }

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
    
    const config = { ...defaultGameConfig, ...gameConfig };
    
    // Load continent bonuses for custom maps
    if (config.mapId && config.mapId !== 'classic') {
      try {
        const continentBonuses = await mapService.getMapContinentBonuses(config.mapId);
        config.continentBonuses = continentBonuses;
      } catch (error) {
        console.warn(`Failed to load continent bonuses for map ${config.mapId}:`, error);
        // Continue with classic behavior if loading fails
      }
    }
    
    const gameState = this.gameEngine.initializeGame(roomId, players, config);
    
    // Initialize territory modifiers if enabled
    if (config.useTerritoryModifiers) {
      const territoryIds = gameState.board.map(t => t.id);
      await territoryModifierService.initializeGameModifiers(
        roomId,
        config.mapId || 'classic',
        config.modifierDistribution || 'balanced',
        territoryIds
      );
      
      // Load modifiers into game state
      const modifiers = await territoryModifierService.getGameModifiers(roomId);
      (gameState as any).territoryModifiers = modifiers;
    }
    
    this.activeGames.set(roomId, gameState);
    return gameState;
  }

  async getGameState(roomId: string): Promise<GameState | null> {
    const gameState = this.activeGames.get(roomId);
    if (!gameState) return null;
    
    // Attach territory modifiers if they exist
    if (gameState.gameConfig?.useTerritoryModifiers && !(gameState as any).territoryModifiers) {
      const modifiers = await territoryModifierService.getGameModifiers(roomId);
      if (modifiers.size > 0) {
        (gameState as any).territoryModifiers = modifiers;
      }
    }
    
    return gameState;
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
      gameState: this.serializeGameState(updatedState),
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
      gameState: this.serializeGameState(gameState)
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
      gameState: this.serializeGameState(updatedState),
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
      gameState: this.serializeGameState(updatedState),
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