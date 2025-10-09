interface MemoryDiagnosticsOptions {
    intervalMs?: number;
    growthThresholdMb?: number;
    minSamples?: number;
    alertCooldownMs?: number;
    historySize?: number;
    snapshotDirectory?: string | null;
}
declare class MemoryDiagnosticsService {
    private readonly intervalMs;
    private readonly growthThresholdBytes;
    private readonly minSamples;
    private readonly alertCooldownMs;
    private readonly historySize;
    private readonly snapshotDirectory;
    private samples;
    private monitorInterval;
    private lastAlertAt;
    constructor(options?: MemoryDiagnosticsOptions);
    start(): void;
    stop(): void;
    reportUsage(context: string): void;
    private captureSample;
    private evaluateTrend;
    private captureHeapSnapshot;
    private toMb;
    private readNumberEnv;
}
export declare const memoryDiagnosticsService: MemoryDiagnosticsService;
export {};
//# sourceMappingURL=memoryDiagnosticsService.d.ts.map