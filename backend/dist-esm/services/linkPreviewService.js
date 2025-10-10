import ogs from 'open-graph-scraper';
import { logger } from '../utils/logger.js';
class LinkPreviewService {
    cache = new Map();
    CACHE_TTL = 24 * 60 * 60 * 1000;
    cacheTimestamps = new Map();
    async extractLinks(text) {
        const urlRegex = /(https?:\/\/[^\s]+)/gi;
        const matches = text.match(urlRegex) || [];
        return matches.filter((url) => {
            try {
                new URL(url);
                return true;
            }
            catch {
                return false;
            }
        });
    }
    async getPreview(url) {
        try {
            const cachedPreview = this.getCachedPreview(url);
            if (cachedPreview) {
                return cachedPreview;
            }
            const { error, result: preview } = await ogs({
                url,
                timeout: 5,
                fetchOptions: {
                    headers: {
                        'user-agent': 'Mozilla/5.0 (compatible; ConquestK/1.0)',
                    },
                },
            });
            if (error || !preview) {
                logger.warn('Open graph metadata not available for url', { url, error });
                return null;
            }
            const result = {
                url,
                title: preview.ogTitle || preview.twitterTitle || preview.dcTitle,
                description: preview.ogDescription || preview.twitterDescription || preview.dcDescription,
                siteName: preview.ogSiteName || preview.twitterSite || preview.ogUrl,
            };
            const ogImageUrl = Array.isArray(preview.ogImage) ? preview.ogImage[0]?.url : undefined;
            const twitterImageUrl = Array.isArray(preview.twitterImage)
                ? preview.twitterImage[0]?.url
                : undefined;
            if (ogImageUrl) {
                result.image = ogImageUrl;
            }
            else if (twitterImageUrl) {
                result.image = twitterImageUrl;
            }
            else if (preview.favicon) {
                result.image = preview.favicon;
            }
            this.setCachedPreview(url, result);
            return result;
        }
        catch (error) {
            logger.error('Error fetching link preview', { url, error });
            return null;
        }
    }
    async getMultiplePreviews(urls) {
        const promises = urls.map((url) => this.getPreview(url));
        return Promise.all(promises);
    }
    getCachedPreview(url) {
        const timestamp = this.cacheTimestamps.get(url);
        if (!timestamp)
            return null;
        if (Date.now() - timestamp > this.CACHE_TTL) {
            this.cache.delete(url);
            this.cacheTimestamps.delete(url);
            return null;
        }
        return this.cache.get(url) || null;
    }
    setCachedPreview(url, preview) {
        this.cache.set(url, preview);
        this.cacheTimestamps.set(url, Date.now());
        if (this.cache.size > 1000) {
            const oldestUrl = Array.from(this.cacheTimestamps.entries()).sort(([, a], [, b]) => a - b)[0][0];
            this.cache.delete(oldestUrl);
            this.cacheTimestamps.delete(oldestUrl);
        }
    }
    clearCache() {
        this.cache.clear();
        this.cacheTimestamps.clear();
    }
}
export const linkPreviewService = new LinkPreviewService();
//# sourceMappingURL=linkPreviewService.js.map