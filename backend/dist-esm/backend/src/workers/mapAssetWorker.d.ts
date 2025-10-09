interface PurgeOptions {
    batchSize?: number;
    minAgeMinutes?: number;
}
export declare class MapAssetWorker {
    private timer;
    private worker;
    initialize(): Promise<void>;
    runOnce(source: 'startup' | 'interval' | 'manual', overrides?: PurgeOptions): Promise<{
        processed: number;
        purged: number;
        failed: number;
        bytesPurged: number;
    }>;
    shutdown(): void;
}
export declare const createMapAssetWorker: () => MapAssetWorker;
export {};
//# sourceMappingURL=mapAssetWorker.d.ts.map