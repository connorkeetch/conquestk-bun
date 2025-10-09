interface PerformanceMetrics {
    cdnHits: number;
    cdnMisses: number;
    totalRequests: number;
    avgLoadTime: number;
    bandwidth: number;
    cacheHitRate: number;
}
interface ProviderHealthCheck {
    provider: string;
    healthy: boolean;
    responseTime?: number;
    error?: string;
}
interface CDNHealthDetails {
    totalProviders: number;
    healthyProviders: number;
    metrics: ReturnType<CDNService['getMetrics']>;
    checks: Array<ProviderHealthCheck | {
        error: unknown;
    }>;
}
export declare class CDNService {
    private providers;
    private assetConfigs;
    private metrics;
    private readonly ASSET_RULES;
    initialize(): Promise<void>;
    private initializeCDNProviders;
    private configureAssetOptimization;
    private generateAssetVersions;
    getAssetUrl(assetPath: string, options?: {
        region?: string;
        provider?: string;
    }): string;
    private selectProvider;
    private getAssetConfig;
    generatePreloadTags(): string[];
    generateResourceHints(): string[];
    generateResponsiveImageTag(imagePath: string, alt: string, options?: {
        sizes?: string;
        loading?: 'lazy' | 'eager';
        priority?: boolean;
    }): string;
    purgeCache(assetPaths?: string[], tags?: string[]): Promise<boolean>;
    recordCDNHit(loadTime: number, bandwidth: number): void;
    recordCDNMiss(): void;
    getMetrics(): PerformanceMetrics & {
        providers: number;
        totalAssetConfigs: number;
    };
    healthCheck(): Promise<{
        status: 'healthy' | 'unhealthy';
        details: CDNHealthDetails;
    }>;
}
export declare const cdnService: CDNService;
export {};
//# sourceMappingURL=cdnService.d.ts.map