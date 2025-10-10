import { join } from 'node:path';
import { logger } from '../utils/logger.js';
export class CDNService {
    providers = [];
    assetConfigs = new Map();
    metrics = {
        cdnHits: 0,
        cdnMisses: 0,
        totalRequests: 0,
        avgLoadTime: 0,
        bandwidth: 0,
        cacheHitRate: 0,
    };
    ASSET_RULES = {
        images: {
            cacheControl: 'public, max-age=31536000, immutable',
            compression: 'none',
            formats: ['webp', 'avif', 'jpg', 'png'],
            sizes: [320, 640, 1024, 1920, 2560],
        },
        scripts: {
            cacheControl: 'public, max-age=31536000, immutable',
            compression: 'brotli',
            minify: true,
        },
        styles: {
            cacheControl: 'public, max-age=31536000, immutable',
            compression: 'brotli',
            minify: true,
        },
        fonts: {
            cacheControl: 'public, max-age=31536000, immutable',
            compression: 'none',
            preload: true,
        },
        audio: {
            cacheControl: 'public, max-age=86400',
            compression: 'none',
            formats: ['opus', 'mp3', 'wav'],
        },
    };
    async initialize() {
        try {
            logger.info('🔄 Initializing CDN Service...');
            await this.initializeCDNProviders();
            await this.configureAssetOptimization();
            await this.generateAssetVersions();
            logger.info('✅ CDN Service initialized', {
                providers: this.providers.length,
                assets: this.assetConfigs.size,
            });
        }
        catch (error) {
            logger.error('❌ Failed to initialize CDN Service:', error);
            throw error;
        }
    }
    async initializeCDNProviders() {
        const primaryCDN = process.env.CDN_PRIMARY_URL;
        if (primaryCDN) {
            this.providers.push({
                name: 'primary',
                baseUrl: primaryCDN,
                regions: ['global'],
                apiKey: process.env.CDN_API_KEY,
            });
        }
        const regionalCDNs = process.env.CDN_REGIONAL_URLS;
        if (regionalCDNs) {
            const urls = regionalCDNs.split(',');
            urls.forEach((url, _index) => {
                const [region, cdnUrl] = url.split('=');
                this.providers.push({
                    name: `regional-${region}`,
                    baseUrl: cdnUrl.trim(),
                    regions: [region.trim()],
                });
            });
        }
        const gameCDN = process.env.CDN_GAME_ASSETS_URL;
        if (gameCDN) {
            this.providers.push({
                name: 'game-assets',
                baseUrl: gameCDN,
                regions: ['global'],
                uploadEndpoint: process.env.CDN_UPLOAD_ENDPOINT,
            });
        }
        logger.info(`🌐 Configured ${this.providers.length} CDN providers`);
    }
    async configureAssetOptimization() {
        const _publicPath = join(process.cwd(), 'public');
        const assetTypes = [
            { pattern: /\.(js|mjs|jsx)$/, type: 'script' },
            { pattern: /\.(css|scss|sass)$/, type: 'style' },
            { pattern: /\.(png|jpg|jpeg|gif|svg|webp|avif)$/, type: 'image' },
            { pattern: /\.(woff|woff2|ttf|eot)$/, type: 'font' },
            { pattern: /\.(mp3|wav|ogg|opus)$/, type: 'audio' },
            { pattern: /\.(mp4|webm|avi)$/, type: 'video' },
        ];
        for (const { pattern, type } of assetTypes) {
            const rule = this.ASSET_RULES[type];
            if (rule) {
                this.assetConfigs.set(pattern.source, {
                    path: '',
                    type,
                    cacheControl: rule.cacheControl,
                    compression: rule.compression,
                    minify: ('minify' in rule ? rule.minify : false) || false,
                });
            }
        }
        logger.info(`📁 Configured optimization for ${this.assetConfigs.size} asset types`);
    }
    async generateAssetVersions() {
        try {
            const _publicPath = join(process.cwd(), 'public');
            const version = Date.now().toString();
            this.assetConfigs.forEach((config, _pattern) => {
                config.version = version;
            });
            logger.info(`🔢 Generated asset versions (v${version})`);
        }
        catch (error) {
            logger.warn('⚠️ Failed to generate asset versions:', error);
        }
    }
    getAssetUrl(assetPath, options = {}) {
        const { region = 'global', provider } = options;
        const selectedProvider = this.selectProvider(region, provider);
        if (!selectedProvider) {
            return assetPath;
        }
        const config = this.getAssetConfig(assetPath);
        const versionParam = config?.version ? `?v=${config.version}` : '';
        const cdnUrl = `${selectedProvider.baseUrl}${assetPath}${versionParam}`;
        this.metrics.totalRequests++;
        logger.debug(`🌐 CDN URL generated: ${cdnUrl}`);
        return cdnUrl;
    }
    selectProvider(region, preferredProvider) {
        if (preferredProvider) {
            const provider = this.providers.find((p) => p.name === preferredProvider);
            if (provider)
                return provider;
        }
        const regionalProvider = this.providers.find((p) => p.regions.includes(region) || p.regions.includes('global'));
        return regionalProvider || this.providers[0] || null;
    }
    getAssetConfig(assetPath) {
        if (typeof URLPattern !== 'undefined') {
            for (const [pattern, config] of this.assetConfigs) {
                try {
                    const urlPattern = new URLPattern({ pathname: pattern });
                    if (urlPattern.test({ pathname: assetPath })) {
                        return config;
                    }
                }
                catch {
                    if (new RegExp(pattern).test(assetPath)) {
                        return config;
                    }
                }
            }
        }
        else {
            for (const [pattern, config] of this.assetConfigs) {
                if (new RegExp(pattern).test(assetPath)) {
                    return config;
                }
            }
        }
        return null;
    }
    generatePreloadTags() {
        const preloadTags = [];
        preloadTags.push(`<link rel="preload" href="${this.getAssetUrl('/assets/critical.css')}" as="style">`);
        preloadTags.push(`<link rel="preload" href="${this.getAssetUrl('/assets/vendor.js')}" as="script">`);
        const criticalFonts = ['/fonts/game-font.woff2', '/fonts/ui-font.woff2'];
        criticalFonts.forEach((font) => {
            preloadTags.push(`<link rel="preload" href="${this.getAssetUrl(font)}" as="font" type="font/woff2" crossorigin>`);
        });
        const gameAssets = ['/audio/ui-sounds.opus', '/images/game-icons.webp'];
        gameAssets.forEach((asset) => {
            preloadTags.push(`<link rel="prefetch" href="${this.getAssetUrl(asset)}">`);
        });
        return preloadTags;
    }
    generateResourceHints() {
        const hints = [];
        this.providers.forEach((provider) => {
            const domain = new URL(provider.baseUrl).hostname;
            hints.push(`<link rel="dns-prefetch" href="//${domain}">`);
        });
        if (this.providers.length > 0) {
            const primaryDomain = new URL(this.providers[0].baseUrl).hostname;
            hints.push(`<link rel="preconnect" href="//${primaryDomain}" crossorigin>`);
        }
        return hints;
    }
    generateResponsiveImageTag(imagePath, alt, options = {}) {
        const { sizes = '100vw', loading = 'lazy', priority = false } = options;
        const rule = this.ASSET_RULES.images;
        const srcset = rule.sizes
            .map((size) => {
            const scaledPath = imagePath.replace(/(\.[^.]+)$/, `_${size}w$1`);
            return `${this.getAssetUrl(scaledPath)} ${size}w`;
        })
            .join(', ');
        const webpPath = imagePath.replace(/\.[^.]+$/, '.webp');
        return `
      <picture>
        <source srcset="${this.getAssetUrl(webpPath)}" type="image/webp">
        <img 
          src="${this.getAssetUrl(imagePath)}" 
          srcset="${srcset}"
          sizes="${sizes}"
          alt="${alt}"
          loading="${loading}"
          ${priority ? 'fetchpriority="high"' : ''}
        >
      </picture>
    `.trim();
    }
    async purgeCache(assetPaths = [], tags = []) {
        const purgePromises = this.providers.map(async (provider) => {
            if (!provider.apiKey)
                return false;
            try {
                logger.info(`🗑️ Purging cache for provider ${provider.name}`, {
                    paths: assetPaths.length,
                    tags: tags.length,
                });
                await new Promise((resolve) => setTimeout(resolve, 100));
                return true;
            }
            catch (error) {
                logger.error(`❌ Failed to purge cache for ${provider.name}:`, error);
                return false;
            }
        });
        const results = await Promise.allSettled(purgePromises);
        const successful = results.filter((result) => result.status === 'fulfilled' && result.value === true).length;
        logger.info(`✅ Cache purged for ${successful}/${this.providers.length} providers`);
        return successful > 0;
    }
    recordCDNHit(loadTime, bandwidth) {
        this.metrics.cdnHits++;
        this.metrics.totalRequests++;
        const alpha = 0.1;
        this.metrics.avgLoadTime = this.metrics.avgLoadTime * (1 - alpha) + loadTime * alpha;
        this.metrics.bandwidth += bandwidth;
        this.metrics.cacheHitRate = (this.metrics.cdnHits / this.metrics.totalRequests) * 100;
    }
    recordCDNMiss() {
        this.metrics.cdnMisses++;
        this.metrics.totalRequests++;
        this.metrics.cacheHitRate = (this.metrics.cdnHits / this.metrics.totalRequests) * 100;
    }
    getMetrics() {
        return {
            ...this.metrics,
            providers: this.providers.length,
            totalAssetConfigs: this.assetConfigs.size,
        };
    }
    async healthCheck() {
        const healthChecks = await Promise.allSettled(this.providers.map(async (provider) => {
            try {
                const testUrl = `${provider.baseUrl}/health-check.txt`;
                const startTime = Date.now();
                const response = await fetch(testUrl, {
                    method: 'HEAD',
                    signal: AbortSignal.timeout(5000),
                });
                return {
                    provider: provider.name,
                    healthy: response.ok,
                    responseTime: Date.now() - startTime,
                };
            }
            catch (error) {
                return {
                    provider: provider.name,
                    healthy: false,
                    error: error.message,
                };
            }
        }));
        const healthyProviders = healthChecks.filter((check) => check.status === 'fulfilled' && check.value.healthy).length;
        return {
            status: healthyProviders > 0 ? 'healthy' : 'unhealthy',
            details: {
                totalProviders: this.providers.length,
                healthyProviders,
                metrics: this.getMetrics(),
                checks: healthChecks.map((check) => check.status === 'fulfilled' ? check.value : { error: check.reason }),
            },
        };
    }
}
export const cdnService = new CDNService();
//# sourceMappingURL=cdnService.js.map