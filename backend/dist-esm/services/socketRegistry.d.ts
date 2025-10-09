import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared.js';
export declare function registerSocketServer(io: Server<ClientToServerEvents, ServerToClientEvents>): void;
export declare function getSocketServer(): Server<ClientToServerEvents, ServerToClientEvents>;
export declare function tryGetSocketServer(): Server<ClientToServerEvents, ServerToClientEvents> | null;
//# sourceMappingURL=socketRegistry.d.ts.map