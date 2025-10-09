import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared.js';
type SocketWithUser = Socket<ClientToServerEvents, ServerToClientEvents> & {
    userId?: string;
    username?: string;
    joinedConversations?: Set<string>;
};
export declare const setupChatHandlers: (io: Server<ClientToServerEvents, ServerToClientEvents>, socket: SocketWithUser) => void;
export {};
//# sourceMappingURL=chatHandlers.d.ts.map