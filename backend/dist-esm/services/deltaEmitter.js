import { DeltaBuilder } from '../types/deltaUpdates.js';
import { logger } from '../utils/logger.js';
export class DeltaEmitter {
    io;
    emitFogFilteredDelta = null;
    constructor(io) {
        this.io = io;
    }
    async getEmitter() {
        if (!this.emitFogFilteredDelta) {
            const { emitFogFilteredDelta } = await import('./fogService.js');
            this.emitFogFilteredDelta = emitFogFilteredDelta;
        }
        return this.emitFogFilteredDelta;
    }
    async emitDeploymentDeltas(gameId, playerId, territoryId, result) {
        try {
            const emitter = await this.getEmitter();
            if (typeof result.playerArmies === 'number') {
                const playerDelta = DeltaBuilder.playerUpdate(gameId, playerId, {
                    armies: result.playerArmies,
                }, result.version);
                await emitter(this.io, gameId, playerDelta);
            }
            if (result.phaseChanged) {
                const phaseDelta = DeltaBuilder.phaseChange(gameId, result.phaseChanged.phase, result.phaseChanged.currentPlayer, result.phaseChanged.turn, result.phaseChanged.reinforcementArmies, result.version);
                await emitter(this.io, gameId, phaseDelta);
            }
            if (typeof result.armies === 'number') {
                const territoryDelta = DeltaBuilder.territoryUpdate(gameId, territoryId, {
                    armies: result.armies,
                }, result.version);
                await emitter(this.io, gameId, territoryDelta);
            }
        }
        catch (error) {
            logger.warn('Failed to emit deployment deltas', {
                gameId,
                playerId,
                territoryId,
                error: error instanceof Error ? error.message : error,
            });
        }
    }
    async emitPhaseChange(gameId, result) {
        try {
            const emitter = await this.getEmitter();
            const phaseDelta = DeltaBuilder.phaseChange(gameId, result.phase, result.currentPlayer, result.turn, result.reinforcementArmies, result.version);
            await emitter(this.io, gameId, phaseDelta);
        }
        catch (error) {
            logger.warn('Failed to emit phase change delta', {
                gameId,
                error: error instanceof Error ? error.message : error,
            });
        }
    }
    async emitFortifyDeltas(gameId, fromTerritoryId, toTerritoryId, result) {
        try {
            const emitter = await this.getEmitter();
            if (typeof result.fromArmies === 'number') {
                const fromDelta = DeltaBuilder.territoryUpdate(gameId, fromTerritoryId, {
                    armies: result.fromArmies,
                }, result.version);
                await emitter(this.io, gameId, fromDelta);
            }
            if (typeof result.toArmies === 'number') {
                const toDelta = DeltaBuilder.territoryUpdate(gameId, toTerritoryId, {
                    armies: result.toArmies,
                }, result.version);
                await emitter(this.io, gameId, toDelta);
            }
            if (result.phaseChanged) {
                const phaseDelta = DeltaBuilder.phaseChange(gameId, result.phaseChanged.phase, result.phaseChanged.currentPlayer, result.phaseChanged.turn, result.phaseChanged.reinforcementArmies, result.version);
                await emitter(this.io, gameId, phaseDelta);
            }
        }
        catch (error) {
            logger.warn('Failed to emit fortify deltas', {
                gameId,
                fromTerritoryId,
                toTerritoryId,
                error: error instanceof Error ? error.message : error,
            });
        }
    }
    async emitRevealTo(gameId, viewerId, state) {
        try {
            const { emitRevealSnapshot } = await import('./fogService.js');
            await emitRevealSnapshot(this.io, gameId, viewerId, state);
        }
        catch (error) {
            logger.warn('Failed to emit targeted reveal snapshot', {
                gameId,
                viewerId,
                error: error instanceof Error ? error.message : error,
            });
        }
    }
}
//# sourceMappingURL=deltaEmitter.js.map