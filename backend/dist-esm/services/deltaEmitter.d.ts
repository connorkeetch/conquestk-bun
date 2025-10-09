import type { Server } from 'socket.io';
import type { GameState } from '../types/game.js';
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared.js';
export interface ActionResult {
    armies?: number;
    territoryId?: string;
    playerArmies?: number;
    playerId?: string;
    fromArmies?: number;
    toArmies?: number;
    fromTerritoryId?: string;
    toTerritoryId?: string;
    phaseChanged?: {
        phase: string;
        currentPlayer: string;
        turn: number;
        reinforcementArmies?: number;
    };
    version?: number;
}
export declare class DeltaEmitter {
    private io;
    private emitFogFilteredDelta;
    constructor(io: Server<ClientToServerEvents, ServerToClientEvents>);
    private getEmitter;
    emitDeploymentDeltas(gameId: string, playerId: string, territoryId: string, result: ActionResult): Promise<void>;
    emitPhaseChange(gameId: string, result: {
        phase: string;
        currentPlayer: string;
        turn: number;
        reinforcementArmies?: number;
        version?: number;
    }): Promise<void>;
    emitFortifyDeltas(gameId: string, fromTerritoryId: string, toTerritoryId: string, result: ActionResult): Promise<void>;
    emitRevealTo(gameId: string, viewerId: string, state?: GameState): Promise<void>;
}
//# sourceMappingURL=deltaEmitter.d.ts.map