import { GameState, GameAction, Territory, GamePlayer } from '../types/game';
import { WorldMap } from './worldMap';

export class GameEngine {
  private worldMap = new WorldMap();

  initializeGame(roomId: string, playerIds: string[]): GameState {
    const territories = this.worldMap.getTerritories();
    const players = this.createPlayers(playerIds);
    
    this.distributeInitialTerritories(territories, players);
    this.deployInitialArmies(territories, players);

    return {
      roomId,
      players,
      currentPlayer: players[0].id,
      phase: 'reinforcement',
      turn: 1,
      board: territories,
      cards: []
    };
  }

  processAction(gameState: GameState, action: GameAction): any {
    const newState = { ...gameState };

    switch (action.type) {
      case 'deploy':
        return this.handleDeploy(newState, action);
      case 'attack':
        return this.handleAttack(newState, action);
      case 'fortify':
        return this.handleFortify(newState, action);
      case 'end_turn':
        return this.handleEndTurn(newState);
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  validateAction(gameState: GameState, action: GameAction): boolean {
    switch (action.type) {
      case 'deploy':
        return this.validateDeploy(gameState, action);
      case 'attack':
        return this.validateAttack(gameState, action);
      case 'fortify':
        return this.validateFortify(gameState, action);
      default:
        return false;
    }
  }

  private createPlayers(playerIds: string[]): GamePlayer[] {
    const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
    
    return playerIds.map((id, index) => ({
      id,
      username: `Player ${index + 1}`,
      color: colors[index],
      armies: this.calculateInitialArmies(playerIds.length),
      territories: [],
      cards: [],
      isEliminated: false
    }));
  }

  private calculateInitialArmies(playerCount: number): number {
    const armyMap: { [key: number]: number } = {
      2: 40,
      3: 35,
      4: 30,
      5: 25,
      6: 20
    };
    return armyMap[playerCount] || 20;
  }

  private distributeInitialTerritories(territories: Territory[], players: GamePlayer[]): void {
    let playerIndex = 0;
    
    for (const territory of territories) {
      const player = players[playerIndex];
      territory.ownerId = player.id;
      territory.armies = 1;
      player.territories.push(territory.id);
      player.armies -= 1;
      
      playerIndex = (playerIndex + 1) % players.length;
    }
  }

  private deployInitialArmies(territories: Territory[], players: GamePlayer[]): void {
    for (const player of players) {
      const playerTerritories = territories.filter(t => t.ownerId === player.id);
      let remainingArmies = player.armies;
      
      while (remainingArmies > 0) {
        for (const territory of playerTerritories) {
          if (remainingArmies > 0) {
            territory.armies += 1;
            remainingArmies -= 1;
          }
        }
      }
      
      player.armies = 0;
    }
  }

  private handleDeploy(gameState: GameState, action: GameAction): GameState {
    const { territoryId, armies } = action.payload;
    const territory = gameState.board.find(t => t.id === territoryId);
    
    if (territory && territory.ownerId === action.playerId) {
      territory.armies += armies;
      const player = gameState.players.find(p => p.id === action.playerId);
      if (player) {
        player.armies -= armies;
      }
    }
    
    return gameState;
  }

  private handleAttack(gameState: GameState, action: GameAction): any {
    const { fromTerritoryId, toTerritoryId } = action.payload;
    
    const fromTerritory = gameState.board.find(t => t.id === fromTerritoryId);
    const toTerritory = gameState.board.find(t => t.id === toTerritoryId);
    
    if (!fromTerritory || !toTerritory) {
      throw new Error('Invalid territories for attack');
    }
    
    // Determine number of dice
    const attackerDiceCount = Math.min(3, fromTerritory.armies - 1);
    const defenderDiceCount = Math.min(2, toTerritory.armies);
    
    const battleResult = this.simulateBattle(attackerDiceCount, defenderDiceCount);
    
    // Apply losses
    fromTerritory.armies -= battleResult.attackerLosses;
    toTerritory.armies -= battleResult.defenderLosses;
    
    // Check if territory was conquered
    const conquered = toTerritory.armies === 0;
    if (conquered) {
      toTerritory.ownerId = action.playerId;
      toTerritory.armies = 1; // Attacker must move at least 1 army
      fromTerritory.armies -= 1;
    }
    
    return {
      ...battleResult,
      conquered,
      fromTerritory: {
        id: fromTerritory.id,
        name: fromTerritory.name,
        armies: fromTerritory.armies
      },
      toTerritory: {
        id: toTerritory.id,
        name: toTerritory.name,
        armies: toTerritory.armies,
        ownerId: toTerritory.ownerId
      }
    };
  }

  private handleFortify(gameState: GameState, action: GameAction): GameState {
    const { fromTerritoryId, toTerritoryId, armies } = action.payload;
    
    const fromTerritory = gameState.board.find(t => t.id === fromTerritoryId);
    const toTerritory = gameState.board.find(t => t.id === toTerritoryId);
    
    if (fromTerritory && toTerritory && 
        fromTerritory.ownerId === action.playerId && 
        toTerritory.ownerId === action.playerId) {
      fromTerritory.armies -= armies;
      toTerritory.armies += armies;
    }
    
    return gameState;
  }

  private handleEndTurn(gameState: GameState): GameState {
    const currentPlayerIndex = gameState.players.findIndex(p => p.id === gameState.currentPlayer);
    
    // Advance phase or move to next player
    switch (gameState.phase) {
      case 'reinforcement':
        gameState.phase = 'attack';
        break;
      case 'attack':
        gameState.phase = 'fortify';
        break;
      case 'fortify':
        // Move to next player
        const nextPlayerIndex = (currentPlayerIndex + 1) % gameState.players.length;
        gameState.currentPlayer = gameState.players[nextPlayerIndex].id;
        gameState.phase = 'reinforcement';
        
        if (nextPlayerIndex === 0) {
          gameState.turn += 1;
        }
        break;
    }
    
    return gameState;
  }

  calculateReinforcementArmies(gameState: GameState, playerId: string): number {
    const playerTerritories = gameState.board.filter(t => t.ownerId === playerId);
    const territoryCount = playerTerritories.length;
    const baseArmies = Math.max(3, Math.floor(territoryCount / 3));
    
    // TODO: Add continent bonuses
    // const continentBonuses = this.calculateContinentBonuses(playerId, gameState);
    
    return baseArmies;
  }

  advancePhase(gameState: GameState): GameState {
    return this.handleEndTurn(gameState);
  }

  private validateDeploy(gameState: GameState, action: GameAction): boolean {
    const { territoryId, armies } = action.payload;
    const player = gameState.players.find(p => p.id === action.playerId);
    const territory = gameState.board.find(t => t.id === territoryId);
    
    // Basic validation - player owns territory and valid army count
    return !!(player && territory && 
             territory.ownerId === action.playerId && 
             armies > 0 &&
             gameState.phase === 'reinforcement');
  }

  private validateAttack(gameState: GameState, action: GameAction): boolean {
    const { fromTerritoryId, toTerritoryId, armies } = action.payload;
    const fromTerritory = gameState.board.find(t => t.id === fromTerritoryId);
    const toTerritory = gameState.board.find(t => t.id === toTerritoryId);
    
    return !!(fromTerritory && toTerritory &&
             fromTerritory.ownerId === action.playerId &&
             toTerritory.ownerId !== action.playerId &&
             fromTerritory.armies > armies &&
             fromTerritory.adjacentTerritories.includes(toTerritoryId));
  }

  private validateFortify(gameState: GameState, action: GameAction): boolean {
    const { fromTerritoryId, toTerritoryId, armies } = action.payload;
    const fromTerritory = gameState.board.find(t => t.id === fromTerritoryId);
    const toTerritory = gameState.board.find(t => t.id === toTerritoryId);
    
    return !!(fromTerritory && toTerritory &&
             fromTerritory.ownerId === action.playerId &&
             toTerritory.ownerId === action.playerId &&
             fromTerritory.armies > armies);
  }

  private simulateBattle(attackerDiceCount: number, defenderDiceCount: number): {
    attackerDice: number[];
    defenderDice: number[];
    attackerLosses: number;
    defenderLosses: number;
  } {
    // Roll dice for attacker and defender
    const attackerDice = this.rollDice(attackerDiceCount).sort((a, b) => b - a);
    const defenderDice = this.rollDice(defenderDiceCount).sort((a, b) => b - a);
    
    let attackerLosses = 0;
    let defenderLosses = 0;
    
    // Compare highest dice first
    if (attackerDice[0] > defenderDice[0]) {
      defenderLosses++;
    } else {
      attackerLosses++;
    }
    
    // Compare second highest dice if both sides have multiple dice
    if (attackerDice.length > 1 && defenderDice.length > 1) {
      if (attackerDice[1] > defenderDice[1]) {
        defenderLosses++;
      } else {
        attackerLosses++;
      }
    }
    
    return {
      attackerDice,
      defenderDice,
      attackerLosses,
      defenderLosses
    };
  }

  private rollDice(count: number): number[] {
    const dice: number[] = [];
    for (let i = 0; i < count; i++) {
      dice.push(Math.floor(Math.random() * 6) + 1);
    }
    return dice;
  }
}