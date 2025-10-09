import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared.js';
import { DeltaEmitter } from './deltaEmitter.js';
export declare class GameActionProcessor {
    private gameService;
    private deltaEmitter;
    private io;
    constructor(io: Server<ClientToServerEvents, ServerToClientEvents>);
    processDeployment(gameId: string, playerId: string, territoryId: string, armies: number, socketId?: string): Promise<{
        mode: 'queued' | 'inline';
        result?: import('./deltaEmitter.js').ActionResult;
    }>;
    private processDeploymentInline;
    processFortify(gameId: string, playerId: string, fromTerritoryId: string, toTerritoryId: string, armies: number, socketId?: string): Promise<void>;
    private processFortifyInline;
    processGoBack(gameId: string, playerId: string, socketId?: string): Promise<void>;
    private processGoBackInline;
    getDeltaEmitter(): DeltaEmitter;
    processAttack(gameId: string, playerId: string, fromTerritoryId: string, toTerritoryId: string, armies?: number, socketId?: string): Promise<{
        mode: 'queued' | 'inline';
    }>;
}
//# sourceMappingURL=gameActionProcessor.d.ts.map