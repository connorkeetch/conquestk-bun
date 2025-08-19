import { GameState, GameAction, Territory, GamePlayer, BattleResult, GameConfiguration, MovementType, ContinentBonus } from '../types/game';
import { WorldMap } from './worldMap';

export class GameEngine {
  private worldMap = new WorldMap();

  initializeGame(roomId: string, playerIds: string[], gameConfig: GameConfiguration): GameState {
    const territories = this.worldMap.getTerritories();
    const players = this.createPlayers(playerIds);
    
    // Randomize player order
    this.randomizePlayerOrder(players);
    
    // Distribute territories fairly with neutrals
    this.distributeTerritoriesWithNeutrals(territories, players);
    
    // Each player starts with 3 armies per territory
    this.deployInitialArmies(territories, players, gameConfig);

    return {
      roomId,
      players,
      currentPlayer: players[0].id,
      phase: 'setup', // Start in setup phase for initial deployment
      turn: 1,
      board: territories,
      cards: [],
      gameConfig,
      movementTracking: {}
    };
  }

  processAction(gameState: GameState, action: GameAction): any {
    const newState = { ...gameState };

    switch (action.type) {
      case 'begin_turn':
        return this.beginTurn(newState);
      case 'deploy':
        return this.handleDeploy(newState, action);
      case 'attack':
        return this.handleAttack(newState, action);
      case 'fortify':
        return this.handleFortify(newState, action);
      case 'end_turn':
        return this.handleEndTurn(newState);
      case 'go_back_to_reinforcement':
        return this.handleGoBackToReinforcement(newState);
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  validateAction(gameState: GameState, action: GameAction): boolean {
    // Check if it's the correct player's turn
    if (action.playerId !== gameState.currentPlayer) {
      return false;
    }

    switch (action.type) {
      case 'begin_turn':
        return gameState.phase === 'setup';
      case 'deploy':
        return this.validateDeploy(gameState, action);
      case 'attack':
        return this.validateAttack(gameState, action);
      case 'fortify':
        return this.validateFortify(gameState, action);
      case 'end_turn':
        return true; // Can always end turn
      case 'go_back_to_reinforcement':
        return gameState.phase === 'attack' && !gameState.hasAttackedThisTurn;
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

  private randomizePlayerOrder(players: GamePlayer[]): void {
    // Fisher-Yates shuffle
    for (let i = players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [players[i], players[j]] = [players[j], players[i]];
    }
  }

  private distributeTerritoriesWithNeutrals(territories: Territory[], players: GamePlayer[]): void {
    // Calculate territories per player (equivalent distribution)
    const territoriesPerPlayer = Math.floor(territories.length / (players.length + 1)); // +1 for neutral
    
    // Shuffle territories for random distribution
    const shuffledTerritories = [...territories];
    for (let i = shuffledTerritories.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledTerritories[i], shuffledTerritories[j]] = [shuffledTerritories[j], shuffledTerritories[i]];
    }
    
    let territoryIndex = 0;
    
    // Distribute to players
    for (const player of players) {
      for (let i = 0; i < territoriesPerPlayer; i++) {
        if (territoryIndex < shuffledTerritories.length) {
          const territory = shuffledTerritories[territoryIndex];
          territory.ownerId = player.id;
          territory.armies = 3; // Each territory starts with 3 armies
          player.territories.push(territory.id);
          territoryIndex++;
        }
      }
    }
    
    // Remaining territories become neutral (grey)
    while (territoryIndex < shuffledTerritories.length) {
      const territory = shuffledTerritories[territoryIndex];
      territory.ownerId = 'neutral';
      territory.armies = 3; // Neutral territories have 3 armies
      territoryIndex++;
    }
  }

  private deployInitialArmies(territories: Territory[], players: GamePlayer[], gameConfig: GameConfiguration): void {
    // Initial armies already deployed (3 per territory)
    // Calculate reinforcement armies for each player
    for (const player of players) {
      player.armies = this.calculateReinforcementArmies(player.territories, territories, gameConfig);
    }
  }
  
  calculateReinforcementArmies(playerTerritories: string[], allTerritories: Territory[], gameConfig?: GameConfiguration): number {
    const territoryCount = playerTerritories.length;
    
    // Base armies: 3 minimum, or territories/3 (rounded down)
    let armies = Math.max(3, Math.floor(territoryCount / 3));
    
    // Bonus for territories above 12: +1 army for each additional 3 territories
    if (territoryCount > 12) {
      const extraTerritories = territoryCount - 12;
      armies += Math.floor(extraTerritories / 3);
    }
    
    // Add continent bonuses
    armies += this.calculateContinentBonuses(playerTerritories, allTerritories, gameConfig);
    
    return armies;
  }
  
  private calculateContinentBonuses(playerTerritories: string[], allTerritories: Territory[], gameConfig?: GameConfiguration): number {
    let bonusArmies = 0;
    
    // Use continent bonuses from game config if available
    if (gameConfig?.continentBonuses) {
      // Dynamic continent bonuses from database (custom maps)
      for (const continent of gameConfig.continentBonuses) {
        const playerOwnsAll = continent.territories.every(territoryId => 
          playerTerritories.includes(territoryId)
        );
        
        if (playerOwnsAll) {
          bonusArmies += continent.bonusArmies;
        }
      }
    } else {
      // Fallback to classic Risk continent bonuses
      const classicContinentBonuses: { [continent: string]: number } = {
        'north-america': 5,
        'south-america': 2,
        'europe': 5,
        'asia': 7,
        'africa': 3,
        'australia': 2
      };
      
      const continents: { [continent: string]: string[] } = {};
      
      // Group territories by continent
      for (const territory of allTerritories) {
        if (!continents[territory.continent]) {
          continents[territory.continent] = [];
        }
        continents[territory.continent].push(territory.id);
      }
      
      // Check each continent for complete control
      for (const [continent, territories] of Object.entries(continents)) {
        const playerOwnsAll = territories.every(territoryId => 
          playerTerritories.includes(territoryId)
        );
        
        if (playerOwnsAll && classicContinentBonuses[continent]) {
          bonusArmies += classicContinentBonuses[continent];
        }
      }
    }
    
    return bonusArmies;
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

  private handleAttack(gameState: GameState, action: GameAction): BattleResult {
    const { fromTerritoryId, toTerritoryId } = action.payload;
    
    const fromTerritory = gameState.board.find(t => t.id === fromTerritoryId);
    const toTerritory = gameState.board.find(t => t.id === toTerritoryId);
    
    if (!fromTerritory || !toTerritory) {
      throw new Error('Invalid territories for attack');
    }
    
    // Mark that player has attacked this turn
    gameState.hasAttackedThisTurn = true;
    
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
      // Update territory ownership and player territory lists
      const attacker = gameState.players.find(p => p.id === action.playerId);
      const defender = gameState.players.find(p => p.id === toTerritory.ownerId);
      
      if (attacker && defender) {
        // Remove territory from defender
        defender.territories = defender.territories.filter(t => t !== toTerritoryId);
        // Add territory to attacker
        attacker.territories.push(toTerritoryId);
      }
      
      toTerritory.ownerId = action.playerId;
      toTerritory.armies = 1; // Attacker must move at least 1 army
      fromTerritory.armies -= 1;
    }
    
    const result: BattleResult = {
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
        ownerId: toTerritory.ownerId!
      }
    };
    
    // Store the battle result in game state
    gameState.lastBattleResult = result;
    
    // Check if conquest resulted in game end
    if (conquered) {
      const gameEndCheck = this.checkGameEnd(gameState);
      result.gameEnded = gameEndCheck.gameEnded;
      result.winner = gameEndCheck.winner;
      result.eliminatedPlayers = gameEndCheck.eliminatedPlayers;
    }
    
    return result;
  }

  private handleFortify(gameState: GameState, action: GameAction): GameState {
    const { fromTerritoryId, toTerritoryId, armies } = action.payload;
    
    // Validate the fortify action first
    if (!this.validateFortify(gameState, action)) {
      throw new Error('Invalid fortify action');
    }
    
    const fromTerritory = gameState.board.find(t => t.id === fromTerritoryId)!;
    const toTerritory = gameState.board.find(t => t.id === toTerritoryId)!;
    
    // Perform the fortification
    fromTerritory.armies -= armies;
    toTerritory.armies += armies;
    
    // Mark territory as having moved (for multi-move types)
    this.markTerritoryAsMoved(gameState, fromTerritoryId);
    
    return gameState;
  }

  private handleEndTurn(gameState: GameState): GameState {
    const currentPlayerIndex = gameState.players.findIndex(p => p.id === gameState.currentPlayer);
    
    // Advance phase or move to next player
    switch (gameState.phase) {
      case 'setup':
        // After setup, first player begins their turn
        gameState.phase = 'reinforcement';
        break;
      case 'reinforcement':
        // After reinforcement, move to attack phase
        gameState.phase = 'attack';
        gameState.hasAttackedThisTurn = false; // Reset attack flag
        break;
      case 'attack':
        // After attack, move to fortify phase
        gameState.phase = 'fortify';
        this.resetMovementTracking(gameState); // Reset movement tracking for fortify phase
        break;
      case 'fortify':
        // After fortify, move to next player
        this.endPlayerTurn(gameState);
        break;
    }
    
    return gameState;
  }
  
  private endPlayerTurn(gameState: GameState): void {
    // Check for eliminated players first
    this.updateEliminatedPlayers(gameState);
    
    // Check if game is over (only one player left)
    const activePlayers = gameState.players.filter(p => !p.isEliminated);
    if (activePlayers.length <= 1) {
      this.endGame(gameState, activePlayers[0] || null);
      return;
    }
    
    const currentPlayerIndex = gameState.players.findIndex(p => p.id === gameState.currentPlayer);
    let nextPlayerIndex = (currentPlayerIndex + 1) % gameState.players.length;
    
    // Skip eliminated players
    while (gameState.players[nextPlayerIndex].isEliminated) {
      nextPlayerIndex = (nextPlayerIndex + 1) % gameState.players.length;
    }
    
    // Move to next player
    gameState.currentPlayer = gameState.players[nextPlayerIndex].id;
    gameState.phase = 'reinforcement';
    gameState.hasAttackedThisTurn = false; // Reset attack flag for new player
    gameState.lastBattleResult = undefined; // Clear last battle result
    
    // Calculate reinforcement armies for new player
    const nextPlayer = gameState.players[nextPlayerIndex];
    nextPlayer.armies = this.calculateReinforcementArmies(nextPlayer.territories, gameState.board, gameState.gameConfig);
    
    // Increment turn counter when we complete a full round (back to first active player)
    const firstActivePlayerIndex = gameState.players.findIndex(p => !p.isEliminated);
    if (nextPlayerIndex === firstActivePlayerIndex) {
      gameState.turn += 1;
    }
  }
  
  beginTurn(gameState: GameState): GameState {
    // Player hits "Begin Turn" button
    if (gameState.phase === 'setup') {
      // Transition from setup to reinforcement phase
      gameState.phase = 'reinforcement';
      
      // Calculate starting reinforcement armies for current player
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
      if (currentPlayer) {
        currentPlayer.armies = this.calculateReinforcementArmies(currentPlayer.territories, gameState.board, gameState.gameConfig);
      }
    }
    
    return gameState;
  }

  // Get valid fortify targets for a given source territory
  getValidFortifyTargets(gameState: GameState, fromTerritoryId: string, playerId: string): string[] {
    const fromTerritory = gameState.board.find(t => t.id === fromTerritoryId);
    if (!fromTerritory || fromTerritory.ownerId !== playerId || fromTerritory.armies <= 1) {
      return [];
    }

    const movementType = gameState.gameConfig.movementType;
    const validTargets: string[] = [];

    // Check each territory as a potential target
    for (const territory of gameState.board) {
      if (!this.canMoveTo(territory, playerId, gameState)) continue;
      if (territory.id === fromTerritoryId) continue; // Can't move to self

      if (this.validateMovementByType(gameState, fromTerritoryId, territory.id, playerId)) {
        validTargets.push(territory.id);
      }
    }

    return validTargets;
  }

  calculateBaseReinforcementArmies(gameState: GameState, playerId: string): number {
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

  private handleGoBackToReinforcement(gameState: GameState): GameState {
    // Can only go back if in attack phase and haven't attacked yet
    if (gameState.phase === 'attack' && !gameState.hasAttackedThisTurn) {
      gameState.phase = 'reinforcement';
      
      // Recalculate reinforcement armies for current player
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
      if (currentPlayer) {
        currentPlayer.armies = this.calculateReinforcementArmies(currentPlayer.territories, gameState.board, gameState.gameConfig);
      }
    }
    
    return gameState;
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
    
    if (!fromTerritory || !toTerritory) return false;
    if (fromTerritory.ownerId !== action.playerId) return false;
    if (!this.canMoveTo(toTerritory, action.playerId, gameState)) return false;
    if (fromTerritory.armies <= armies) return false; // Must leave at least 1 army
    if (armies <= 0) return false;
    if (gameState.phase !== 'fortify') return false;
    
    // Check movement type restrictions
    return this.validateMovementByType(gameState, fromTerritoryId, toTerritoryId, action.playerId);
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

  // Path finding algorithm to check if territories are connected through player-owned territories
  private areTerritoriesConnected(fromId: string, toId: string, playerId: string, territories: Territory[]): boolean {
    if (fromId === toId) return true;
    
    const playerTerritories = territories.filter(t => t.ownerId === playerId);
    const visited = new Set<string>();
    const queue = [fromId];
    
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      
      if (currentId === toId) {
        return true;
      }
      
      if (visited.has(currentId)) {
        continue;
      }
      
      visited.add(currentId);
      
      const currentTerritory = playerTerritories.find(t => t.id === currentId);
      if (!currentTerritory) continue;
      
      // Add adjacent player-owned territories to queue
      for (const adjacentId of currentTerritory.adjacentTerritories) {
        if (!visited.has(adjacentId)) {
          const adjacentTerritory = playerTerritories.find(t => t.id === adjacentId);
          if (adjacentTerritory) {
            queue.push(adjacentId);
          }
        }
      }
    }
    
    return false;
  }

  // Check if a territory can be moved to (owned by player or teammate)
  private canMoveTo(territory: Territory, playerId: string, gameState: GameState): boolean {
    if (territory.ownerId === playerId) return true;
    
    // If team play is enabled, check if territory belongs to a teammate
    if (gameState.gameConfig.allowTeamPlay) {
      // TODO: Implement team logic when team system is added
      // For now, only allow movement to own territories
    }
    
    return false;
  }

  // Validate movement based on the configured movement type
  private validateMovementByType(gameState: GameState, fromId: string, toId: string, playerId: string): boolean {
    const movementType = gameState.gameConfig.movementType;
    
    switch (movementType) {
      case 'classic_adjacent':
        return this.validateClassicAdjacent(gameState, fromId, toId, playerId);
      
      case 'adjacent_multi':
        return this.validateAdjacentMulti(gameState, fromId, toId, playerId);
      
      case 'path_single':
        return this.validatePathSingle(gameState, fromId, toId, playerId);
      
      case 'path_multi':
        return this.validatePathMulti(gameState, fromId, toId, playerId);
      
      default:
        return false;
    }
  }

  // Classic Adjacent: One territory can move armies to one adjacent territory only
  private validateClassicAdjacent(gameState: GameState, fromId: string, toId: string, playerId: string): boolean {
    const fromTerritory = gameState.board.find(t => t.id === fromId);
    if (!fromTerritory) return false;
    
    // Check if territories are adjacent
    const isAdjacent = fromTerritory.adjacentTerritories.includes(toId);
    if (!isAdjacent) return false;
    
    // In classic mode, only one move per fortify phase is allowed
    // Check if any territory has already moved this phase
    const hasAnyMovement = Object.keys(gameState.movementTracking || {}).length > 0;
    
    return !hasAnyMovement;
  }

  // Adjacent Multi: Multiple territories can move, but only to adjacent territories
  private validateAdjacentMulti(gameState: GameState, fromId: string, toId: string, playerId: string): boolean {
    const fromTerritory = gameState.board.find(t => t.id === fromId);
    if (!fromTerritory) return false;
    
    // Check if territories are adjacent
    const isAdjacent = fromTerritory.adjacentTerritories.includes(toId);
    if (!isAdjacent) return false;
    
    // Check if this territory has already moved this phase
    const hasAlreadyMoved = gameState.movementTracking?.[fromId] || false;
    
    return !hasAlreadyMoved;
  }

  // Path Single: One territory can move to any connected territory, only one move per phase
  private validatePathSingle(gameState: GameState, fromId: string, toId: string, playerId: string): boolean {
    // Check if any territory has already moved this phase
    const hasAnyMovement = Object.keys(gameState.movementTracking || {}).length > 0;
    if (hasAnyMovement) return false;
    
    // Check if territories are connected through owned territories
    return this.areTerritoriesConnectedWithTeammates(fromId, toId, playerId, gameState);
  }

  // Path Multi: Multiple territories can move to any connected territories
  private validatePathMulti(gameState: GameState, fromId: string, toId: string, playerId: string): boolean {
    // Check if this territory has already moved this phase
    const hasAlreadyMoved = gameState.movementTracking?.[fromId] || false;
    if (hasAlreadyMoved) return false;
    
    // Check if territories are connected through owned territories
    return this.areTerritoriesConnectedWithTeammates(fromId, toId, playerId, gameState);
  }

  // Enhanced path finding that includes teammate territories
  private areTerritoriesConnectedWithTeammates(fromId: string, toId: string, playerId: string, gameState: GameState): boolean {
    if (fromId === toId) return true;
    
    // Get all territories that can be used for pathfinding (owned + teammates)
    const allowedTerritories = gameState.board.filter(t => this.canUseForPathfinding(t, playerId, gameState));
    const visited = new Set<string>();
    const queue = [fromId];
    
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      
      if (currentId === toId) {
        return true;
      }
      
      if (visited.has(currentId)) {
        continue;
      }
      
      visited.add(currentId);
      
      const currentTerritory = allowedTerritories.find(t => t.id === currentId);
      if (!currentTerritory) continue;
      
      // Add adjacent territories that can be used for pathfinding
      for (const adjacentId of currentTerritory.adjacentTerritories) {
        if (!visited.has(adjacentId)) {
          const adjacentTerritory = allowedTerritories.find(t => t.id === adjacentId);
          if (adjacentTerritory) {
            queue.push(adjacentId);
          }
        }
      }
    }
    
    return false;
  }

  // Check if a territory can be used for pathfinding (owned by player or teammate)
  private canUseForPathfinding(territory: Territory, playerId: string, gameState: GameState): boolean {
    if (territory.ownerId === playerId) return true;
    
    // If team play is enabled, include teammate territories in pathfinding
    if (gameState.gameConfig.allowTeamPlay) {
      // TODO: Implement team logic when team system is added
      // For now, only use own territories
    }
    
    return false;
  }

  // Reset movement tracking at the start of fortify phase
  private resetMovementTracking(gameState: GameState): void {
    gameState.movementTracking = {};
  }

  // Mark a territory as having moved this phase
  private markTerritoryAsMoved(gameState: GameState, territoryId: string): void {
    if (!gameState.movementTracking) {
      gameState.movementTracking = {};
    }
    gameState.movementTracking[territoryId] = true;
  }

  // Check and update eliminated players
  private updateEliminatedPlayers(gameState: GameState): string[] {
    const newlyEliminated: string[] = [];
    
    for (const player of gameState.players) {
      if (!player.isEliminated) {
        const playerTerritories = gameState.board.filter(t => t.ownerId === player.id);
        
        if (playerTerritories.length === 0) {
          player.isEliminated = true;
          newlyEliminated.push(player.id);
          console.log(`Player ${player.username} has been eliminated`);
        }
      }
    }
    
    return newlyEliminated;
  }

  // End the game and declare winner
  private endGame(gameState: GameState, winner: GamePlayer | null): void {
    gameState.phase = 'finished';
    
    if (winner) {
      console.log(`Game Over! Winner: ${winner.username}`);
    } else {
      console.log('Game Over! No winner (all players eliminated)');
    }
  }

  // Check if game should end after territory conquest
  checkGameEnd(gameState: GameState): { gameEnded: boolean; winner: GamePlayer | null; eliminatedPlayers: string[] } {
    const eliminatedPlayers = this.updateEliminatedPlayers(gameState);
    const activePlayers = gameState.players.filter(p => !p.isEliminated);
    
    if (activePlayers.length <= 1) {
      this.endGame(gameState, activePlayers[0] || null);
      return {
        gameEnded: true,
        winner: activePlayers[0] || null,
        eliminatedPlayers
      };
    }
    
    return {
      gameEnded: false,
      winner: null,
      eliminatedPlayers
    };
  }
}