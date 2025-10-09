export interface LinkPreview {
    url: string;
    title?: string;
    description?: string;
    image?: string;
    siteName?: string;
}
declare class LinkPreviewService {
    private cache;
    private readonly CACHE_TTL;
    private cacheTimestamps;
    extractLinks(text: string): Promise<string[]>;
    getPreview(url: string): Promise<LinkPreview | null>;
    getMultiplePreviews(urls: string[]): Promise<(LinkPreview | null)[]>;
    private getCachedPreview;
    private setCachedPreview;
    clearCache(): void;
}
export declare const linkPreviewService: LinkPreviewService;
export {};
//# sourceMappingURL=linkPreviewService.d.ts.map