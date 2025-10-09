import type { GameRoom, Player } from '../types/gameRoom.js';
type AIDifficultyOption = NonNullable<Player['aiDifficulty']>;
export interface CreateRoomData {
    name: string;
    hostId: string;
    maxPlayers: number;
    isPrivate: boolean;
    mapId?: string;
    gameMode?: string;
    allowTeamPlay?: boolean;
    teamMode?: 'none' | 'teams' | 'auto_balance' | boolean | null;
    numberOfTeams?: number | null;
    isRanked?: boolean;
    aiOpponents?: Array<{
        difficulty: AIDifficultyOption;
        personalitySeed?: number | null;
    }>;
    treasureConfig?: unknown;
    kingOfTheHillConfig?: unknown;
    movementType?: 'classic_adjacent' | 'adjacent_multi' | 'path_single' | 'path_multi';
    fogOfWar?: 'off' | 'adjacent' | 'persistent';
    turnTimerSeconds?: number;
    timeBankSeconds?: number;
}
export declare class GameRoomService {
    private validateTeamConfiguration;
    private getValidTeamOptions;
    private normalizeTeamMode;
    private normalizeNumberOfTeams;
    private mapTeamMode;
    private normalizeFogOfWar;
    private normalizeStatus;
    private toDate;
    private parseNullableNumber;
    private isPlayerRow;
    private normalizePlayerTier;
    private normalizeAIDifficulty;
    private sanitizeAiOpponents;
    private mapPlayers;
    private mapRoomRow;
    createRoom(roomData: CreateRoomData): Promise<GameRoom>;
    pruneStaleRooms(): Promise<number>;
    getActiveRooms(): Promise<GameRoom[]>;
    getRoomById(roomId: string): Promise<GameRoom | null>;
    getRoomByCode(roomCode: number): Promise<GameRoom | null>;
    resolveRoomId(idOrCode: string): Promise<string>;
    getRoomByIdOrCode(idOrCode: string): Promise<GameRoom | null>;
    private triggerAutoStartIfReady;
    ensureAiReadyStates(roomId: string): Promise<void>;
    updateAiOpponents(roomId: string, hostId: string, aiOpponents?: Array<{
        difficulty: AIDifficultyOption;
        personalitySeed?: number | null;
    }>): Promise<GameRoom>;
    isPlayerInRoom(roomId: string, userId: string): Promise<boolean>;
    getPlayer(roomId: string, userId: string): Promise<Player | null>;
    joinRoom(roomId: string, userId: string, options?: {
        selectedColor?: string | null;
    }): Promise<{
        success: boolean;
        message: string;
    }>;
    assignPlayerToTeam(roomId: string, actingUserId: string, targetPlayerIdentifier: string, teamId: number | null | undefined): Promise<GameRoom>;
    leaveRoom(roomId: string, userId: string): Promise<void>;
    closeRoom(roomId: string, actorUserId: string): Promise<void>;
    private performCloseRoom;
    getUserGames(userId: string): Promise<GameRoom[]>;
}
export {};
//# sourceMappingURL=gameRoomService.d.ts.map