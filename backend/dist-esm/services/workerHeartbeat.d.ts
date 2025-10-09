export type HeartbeatHandle = {
    stop: () => void;
    key: string;
};
export declare function startWorkerHeartbeat(queueName: string, options?: {
    ttlSeconds?: number;
    intervalMs?: number;
}): HeartbeatHandle | null;
//# sourceMappingURL=workerHeartbeat.d.ts.map