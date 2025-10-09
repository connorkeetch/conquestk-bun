import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared.js';
export declare function getSocketLatencyMetrics(): {
    avgLatency: number;
    p95Latency: number;
    maxLatency: number;
    activeConnections: number;
};
export declare function setupSocketHandlers(io: Server<ClientToServerEvents, ServerToClientEvents>): void;
//# sourceMappingURL=socketService.d.ts.map