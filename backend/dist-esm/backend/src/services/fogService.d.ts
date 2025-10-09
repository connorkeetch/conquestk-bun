import type { GameDelta } from '@risk-game/shared/types';
import type { Server } from 'socket.io';
import type { GameState } from '../types/game.js';
export declare function computeVisibilityMask(state: GameState, viewerId: string): Set<string>;
export declare function emitFogFilteredDelta(io: Server, roomId: string, delta: GameDelta, state?: GameState): Promise<void>;
export declare function filterFullStateForViewer(state: GameState, viewerId: string): GameState;
export declare function filterStateForPlanner(state: GameState, viewerId: string): GameState;
export declare function emitRevealSnapshot(io: Server, roomId: string, viewerId: string, state?: GameState): Promise<void>;
//# sourceMappingURL=fogService.d.ts.map