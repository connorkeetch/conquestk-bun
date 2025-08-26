import { query } from '../config/database';
import { logger } from '../utils/logger';

export interface CapitalGameState {
  gameId: string;
  capitalsEnabled: boolean;
  capitals: Map<string, number>; // playerId -> territoryId
  eliminatedPlayers: Set<string>;
}

export interface CapitalAttackResult {
  territoryId: number;
  attackerId: string;
  defenderId: string;
  isCapital: boolean;
  capitalElimination?: {
    eliminatedPlayer: string;
    territoriesGained: number[];
    troopsGained: number;
  };
}

export class CapitalGameService {
  private gameStates: Map<string, CapitalGameState> = new Map();

  async initializeCapitals(gameId: string, playerCount: number, mapId: string): Promise<void> {
    try {
      // Get map's capital configuration
      const mapResult = await query(`
        SELECT capital_territories 
        FROM maps 
        WHERE id = ?
      `, [mapId]);

      if (!mapResult.rows[0]?.capital_territories) {
        logger.warn(`Map ${mapId} has no capital configuration`);
        return;
      }

      const capitalConfig = JSON.parse(mapResult.rows[0].capital_territories);
      const capitals = capitalConfig[playerCount.toString()];

      if (!capitals || capitals.length !== playerCount) {
        logger.warn(`Invalid capital configuration for ${playerCount} players`);
        return;
      }

      // Get players in the game
      const playersResult = await query(`
        SELECT id, player_position 
        FROM game_players 
        WHERE game_id = ? 
        ORDER BY player_position
      `, [gameId]);

      const players = playersResult.rows;

      // Assign capitals to players based on position
      for (let i = 0; i < players.length && i < capitals.length; i++) {
        const player = players[i];
        const capitalTerritoryId = capitals[i];

        // Update player's capital
        await query(`
          UPDATE game_players 
          SET capital_territory_id = ?
          WHERE id = ?
        `, [capitalTerritoryId, player.id]);

        // Mark territory as capital
        await query(`
          UPDATE game_territories 
          SET is_capital = true, 
              capital_owner_id = ?,
              troop_count = 15
          WHERE game_id = ? AND territory_id = ?
        `, [player.id, gameId, capitalTerritoryId]);

        logger.info(`Assigned capital ${capitalTerritoryId} to player ${player.id}`);
      }

      // Initialize game state
      const gameState: CapitalGameState = {
        gameId,
        capitalsEnabled: true,
        capitals: new Map(),
        eliminatedPlayers: new Set()
      };

      players.forEach((player, i) => {
        if (i < capitals.length) {
          gameState.capitals.set(player.id, capitals[i]);
        }
      });

      this.gameStates.set(gameId, gameState);

      // TODO: Emit capital initialization event from socket service
      // io.to(gameId).emit('capitalsInitialized', {
      //   capitals: Array.from(gameState.capitals.entries()).map(([playerId, territoryId]) => ({
      //     playerId,
      //     territoryId
      //   }))
      // });
    } catch (error) {
      logger.error('Error initializing capitals:', error);
      throw error;
    }
  }

  async checkCapitalElimination(
    gameId: string, 
    territoryId: number, 
    attackerId: string, 
    defenderId: string
  ): Promise<CapitalAttackResult> {
    const result: CapitalAttackResult = {
      territoryId,
      attackerId,
      defenderId,
      isCapital: false
    };

    const gameState = this.gameStates.get(gameId);
    if (!gameState?.capitalsEnabled) {
      return result;
    }

    // Check if this territory is a capital
    const defenderCapital = gameState.capitals.get(defenderId);
    if (defenderCapital !== territoryId) {
      return result;
    }

    result.isCapital = true;

    try {
      // Get all territories owned by the eliminated player
      const territoriesResult = await query(`
        SELECT territory_id, troop_count 
        FROM game_territories 
        WHERE game_id = ? AND owner_player_id = ?
      `, [gameId, defenderId]);

      const territories = territoriesResult.rows;
      const territoryIds = territories.map(t => t.territory_id);
      const totalTroops = territories.reduce((sum, t) => sum + t.troop_count, 0);

      // Transfer all territories to the attacker
      await query(`
        UPDATE game_territories 
        SET owner_player_id = ? 
        WHERE game_id = ? AND owner_player_id = ?
      `, [attackerId, gameId, defenderId]);

      // Mark player as eliminated
      await query(`
        UPDATE game_players 
        SET is_eliminated = true,
            eliminated_at = CURRENT_TIMESTAMP,
            eliminated_by = ?
        WHERE game_id = ? AND player_id = ?
      `, [attackerId, gameId, defenderId]);

      // Record elimination event
      await query(`
        INSERT INTO capital_eliminations 
        (game_id, eliminated_player_id, conqueror_player_id, capital_territory_id, territories_gained, troops_gained)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [gameId, defenderId, attackerId, territoryId, territoryIds.length, totalTroops]);

      gameState.eliminatedPlayers.add(defenderId);

      result.capitalElimination = {
        eliminatedPlayer: defenderId,
        territoriesGained: territoryIds,
        troopsGained: totalTroops
      };

      // Emit capital elimination event
      this.emitCapitalElimination(gameId, result);

      logger.info(`Capital elimination: ${attackerId} eliminated ${defenderId} by capturing capital ${territoryId}`);
    } catch (error) {
      logger.error('Error processing capital elimination:', error);
      throw error;
    }

    return result;
  }

  private emitCapitalElimination(gameId: string, result: CapitalAttackResult): void {
    if (!result.capitalElimination) return;

    // TODO: Emit capital elimination event from socket service
    // io.to(gameId).emit('capitalElimination', {
    //   eliminatedPlayerId: result.capitalElimination.eliminatedPlayer,
    //   conquerorPlayerId: result.attackerId,
    //   capitalTerritoryId: result.territoryId,
    //   territoriesGained: result.capitalElimination.territoriesGained,
    //   troopsGained: result.capitalElimination.troopsGained,
    //   timestamp: new Date()
    // });

    // TODO: Special notification for eliminated player from socket service
    // io.to(result.capitalElimination.eliminatedPlayer).emit('youWereEliminated', {
    //   conquerorId: result.attackerId,
    //   capitalLost: result.territoryId
    // });
  }

  emitCapitalUnderAttack(gameId: string, defenderId: string, territoryId: number): void {
    const gameState = this.gameStates.get(gameId);
    if (!gameState?.capitalsEnabled) return;

    const defenderCapital = gameState.capitals.get(defenderId);
    if (defenderCapital === territoryId) {
      // TODO: Emit capital under attack warning from socket service
      // io.to(defenderId).emit('capitalUnderAttack', {
      //   territoryId,
      //   warning: '⚠️ YOUR CAPITAL IS UNDER ATTACK!'
      // });

      // TODO: Emit capital battle event from socket service
      // io.to(gameId).emit('capitalBattle', {
      //   territoryId,
      //   defenderId
      // });
    }
  }

  getCapitalDefenseBonus(gameId: string, territoryId: number, defenderId: string): number {
    const gameState = this.gameStates.get(gameId);
    if (!gameState?.capitalsEnabled) return 0;

    const defenderCapital = gameState.capitals.get(defenderId);
    if (defenderCapital === territoryId) {
      return 2; // +2 defense bonus for capitals
    }

    return 0;
  }

  canMoveFromCapital(gameId: string, playerId: string, territoryId: number, troopsToMove: number): boolean {
    const gameState = this.gameStates.get(gameId);
    if (!gameState?.capitalsEnabled) return true;

    const playerCapital = gameState.capitals.get(playerId);
    if (playerCapital !== territoryId) return true;

    // Must leave at least 1 troop in capital
    return troopsToMove < 1; // This ensures at least 1 troop remains
  }

  getGameCapitals(gameId: string): Map<string, number> | null {
    const gameState = this.gameStates.get(gameId);
    return gameState?.capitals || null;
  }

  isPlayerEliminated(gameId: string, playerId: string): boolean {
    const gameState = this.gameStates.get(gameId);
    return gameState?.eliminatedPlayers.has(playerId) || false;
  }

  cleanupGameState(gameId: string): void {
    this.gameStates.delete(gameId);
  }
}

export default new CapitalGameService();