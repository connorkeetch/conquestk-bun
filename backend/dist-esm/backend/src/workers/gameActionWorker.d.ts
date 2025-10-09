import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared.js';
export declare class GameActionWorker {
    private worker;
    private queueName;
    private gameService;
    private deltaEmitter;
    private io;
    constructor(io: Server<ClientToServerEvents, ServerToClientEvents>);
    private computePayloadBytes;
    private emitGameUpdate;
    initialize(): Promise<void>;
    private processAiTurn;
    private runAiTurnStreaming;
    private computeBudgetForDifficulty;
    private processGameAction;
    private canPlayerPerformAction;
    private recordMove;
    private processPlaceArmies;
    private processFortify;
    private processEndTurn;
    private processPhaseChange;
}
export declare const createGameActionWorker: (io: Server<ClientToServerEvents, ServerToClientEvents>) => GameActionWorker;
//# sourceMappingURL=gameActionWorker.d.ts.map