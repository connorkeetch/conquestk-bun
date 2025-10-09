import type { GameRoom } from '../types/gameRoom.js';
import { GameService } from './gameService.js';
export interface LifecycleSnapshot {
    room: GameRoom | null;
    readyStates: Array<{
        userId: string;
        isReady: boolean;
        readyAt: string | null;
    }>;
    triggeredStart: boolean;
    statusMessage?: string;
    statusMessageLevel?: 'error' | 'info' | 'warn';
}
export declare class GameLifecycleService {
    private gameRoomService;
    private gameService;
    private static localTurnTimeouts;
    setReadyState(roomId: string, userId: string, ready: boolean): Promise<LifecycleSnapshot>;
    maybeAutoStart(roomId: string): Promise<boolean>;
    getLifecycleSnapshot(roomId: string): Promise<LifecycleSnapshot>;
    private startGame;
    private broadcastLifecycle;
    private persistGameState;
    private toSerializableGameState;
    private normalizeStatus;
    refreshLifecycle(roomId: string): Promise<LifecycleSnapshot>;
    scheduleTurnTimeout(roomId: string, options?: {
        seconds?: number;
        usingTimeBank?: boolean;
    }): Promise<void>;
    scheduleAiTurn(roomId: string, options?: {
        delayMs?: number;
    }): Promise<void>;
    private computeDefaultBudgetForDifficulty;
    handleTurnTimeout(roomId: string): Promise<void>;
    kickAndNeutralize(roomId: string, userId: string): Promise<Awaited<ReturnType<GameService['neutralizePlayerAndResolve']>>>;
}
//# sourceMappingURL=gameLifecycleService.d.ts.map