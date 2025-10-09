export declare class JobIdempotencyService {
    private inMemoryStore;
    private buildKey;
    private getRedis;
    private cleanupInMemoryStore;
    getProcessedJob<T>(queueName: string, jobKey: string): Promise<{
        exists: boolean;
        value?: T;
    }>;
    markProcessedJob<T>(queueName: string, jobKey: string, value?: T, ttlSeconds?: number): Promise<void>;
    clearProcessedJob(queueName: string, jobKey: string): Promise<void>;
}
export declare const jobIdempotencyService: JobIdempotencyService;
//# sourceMappingURL=jobIdempotencyService.d.ts.map