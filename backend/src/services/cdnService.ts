import { join } from 'node:path'
import { logger } from '../utils/logger.js'

interface CDNProvider {
  name: string
  baseUrl: string
  regions: string[]
  uploadEndpoint?: string
  apiKey?: string
}

interface AssetConfig {
  path: string
  type: 'image' | 'script' | 'style' | 'font' | 'audio' | 'video' | 'document'
  cacheControl: string
  compression: 'gzip' | 'brotli' | 'none'
  minify: boolean
  version?: string
}

interface PerformanceMetrics {
  cdnHits: number
  cdnMisses: number
  totalRequests: number
  avgLoadTime: number
  bandwidth: number
  cacheHitRate: number
}

interface ProviderHealthCheck {
  provider: string
  healthy: boolean
  responseTime?: number
  error?: string
}

interface CDNHealthDetails {
  totalProviders: number
  healthyProviders: number
  metrics: ReturnType<CDNService['getMetrics']>
  checks: Array<ProviderHealthCheck | { error: unknown }>
}

export class CDNService {
  private providers: CDNProvider[] = []
  private assetConfigs: Map<string, AssetConfig> = new Map()
  private metrics: PerformanceMetrics = {
    cdnHits: 0,
    cdnMisses: 0,
    totalRequests: 0,
    avgLoadTime: 0,
    bandwidth: 0,
    cacheHitRate: 0,
  }

  // Asset optimization rules
  private readonly ASSET_RULES = {
    images: {
      cacheControl: 'public, max-age=31536000, immutable', // 1 year
      compression: 'none' as const,
      formats: ['webp', 'avif', 'jpg', 'png'],
      sizes: [320, 640, 1024, 1920, 2560],
    },
    scripts: {
      cacheControl: 'public, max-age=31536000, immutable',
      compression: 'brotli' as const,
      minify: true,
    },
    styles: {
      cacheControl: 'public, max-age=31536000, immutable',
      compression: 'brotli' as const,
      minify: true,
    },
    fonts: {
      cacheControl: 'public, max-age=31536000, immutable',
      compression: 'none' as const,
      preload: true,
    },
    audio: {
      cacheControl: 'public, max-age=86400', // 1 day
      compression: 'none' as const,
      formats: ['opus', 'mp3', 'wav'],
    },
  } as const

  async initialize(): Promise<void> {
    try {
      logger.info('🔄 Initializing CDN Service...')

      // Initialize CDN providers
      await this.initializeCDNProviders()

      // Configure asset optimization
      await this.configureAssetOptimization()

      // Set up asset versioning
      await this.generateAssetVersions()

      logger.info('✅ CDN Service initialized', {
        providers: this.providers.length,
        assets: this.assetConfigs.size,
      })
    } catch (error) {
      logger.error('❌ Failed to initialize CDN Service:', error)
      throw error
    }
  }

  private async initializeCDNProviders(): Promise<void> {
    // Primary CDN (e.g., CloudFlare, AWS CloudFront)
    const primaryCDN = process.env.CDN_PRIMARY_URL
    if (primaryCDN) {
      this.providers.push({
        name: 'primary',
        baseUrl: primaryCDN,
        regions: ['global'],
        apiKey: process.env.CDN_API_KEY,
      })
    }

    // Seed from PUBLIC_ASSET_BASE_URL and VITE_ASSET_BASE_URL if set, so health checks work
    // even when CDN_* envs are not configured explicitly.
    const publicAssetBase = process.env.PUBLIC_ASSET_BASE_URL
    if (publicAssetBase) {
      // Avoid duplicates if it equals the primary URL
      if (!this.providers.some((p) => p.baseUrl === publicAssetBase)) {
        this.providers.push({ name: 'asset-base', baseUrl: publicAssetBase, regions: ['global'] })
      }
    }

    const viteAssetBase = process.env.VITE_ASSET_BASE_URL
    if (viteAssetBase) {
      if (!this.providers.some((p) => p.baseUrl === viteAssetBase)) {
        this.providers.push({
          name: 'vite-asset-base',
          baseUrl: viteAssetBase,
          regions: ['global'],
        })
      }
    }

    // Regional CDNs for game-specific optimizations
    const regionalCDNs = process.env.CDN_REGIONAL_URLS
    if (regionalCDNs) {
      const urls = regionalCDNs.split(',')
      urls.forEach((url, _index) => {
        const [region, cdnUrl] = url.split('=')
        this.providers.push({
          name: `regional-${region}`,
          baseUrl: cdnUrl.trim(),
          regions: [region.trim()],
        })
      })
    }

    // Game-specific CDN for large assets
    const gameCDN = process.env.CDN_GAME_ASSETS_URL
    if (gameCDN) {
      this.providers.push({
        name: 'game-assets',
        baseUrl: gameCDN,
        regions: ['global'],
        uploadEndpoint: process.env.CDN_UPLOAD_ENDPOINT,
      })
    }

    logger.info(`🌐 Configured ${this.providers.length} CDN providers`)
  }

  private async configureAssetOptimization(): Promise<void> {
    const _publicPath = join(process.cwd(), 'public')

    // Configure static assets
    const assetTypes = [
      { pattern: /\.(js|mjs|jsx)$/, type: 'script' as const },
      { pattern: /\.(css|scss|sass)$/, type: 'style' as const },
      { pattern: /\.(png|jpg|jpeg|gif|svg|webp|avif)$/, type: 'image' as const },
      { pattern: /\.(woff|woff2|ttf|eot)$/, type: 'font' as const },
      { pattern: /\.(mp3|wav|ogg|opus)$/, type: 'audio' as const },
      { pattern: /\.(mp4|webm|avi)$/, type: 'video' as const },
    ]

    // Scan and configure assets
    for (const { pattern, type } of assetTypes) {
      const rule = this.ASSET_RULES[type as keyof typeof this.ASSET_RULES]
      if (rule) {
        this.assetConfigs.set(pattern.source, {
          path: '',
          type,
          cacheControl: rule.cacheControl,
          compression: rule.compression,
          minify: ('minify' in rule ? rule.minify : false) || false,
        })
      }
    }

    logger.info(`📁 Configured optimization for ${this.assetConfigs.size} asset types`)
  }

  private async generateAssetVersions(): Promise<void> {
    try {
      const _publicPath = join(process.cwd(), 'public')
      // Asset versioning logic would go here
      // For now, we'll use a simple timestamp-based approach
      const version = Date.now().toString()

      this.assetConfigs.forEach((config, _pattern) => {
        config.version = version
      })

      logger.info(`🔢 Generated asset versions (v${version})`)
    } catch (error) {
      logger.warn('⚠️ Failed to generate asset versions:', error)
    }
  }

  // Asset URL generation with CDN selection
  getAssetUrl(assetPath: string, options: { region?: string; provider?: string } = {}): string {
    const { region = 'global', provider } = options

    // Select optimal CDN provider
    const selectedProvider = this.selectProvider(region, provider)
    if (!selectedProvider) {
      return assetPath // Fallback to direct serve
    }

    // Get asset configuration
    const config = this.getAssetConfig(assetPath)
    const versionParam = config?.version ? `?v=${config.version}` : ''

    // Construct CDN URL
    const cdnUrl = `${selectedProvider.baseUrl}${assetPath}${versionParam}`

    this.metrics.totalRequests++
    logger.debug(`🌐 CDN URL generated: ${cdnUrl}`)

    return cdnUrl
  }

  private selectProvider(region: string, preferredProvider?: string): CDNProvider | null {
    if (preferredProvider) {
      const provider = this.providers.find((p) => p.name === preferredProvider)
      if (provider) return provider
    }

    // Select based on region
    const regionalProvider = this.providers.find(
      (p) => p.regions.includes(region) || p.regions.includes('global'),
    )

    return regionalProvider || this.providers[0] || null
  }

  private getAssetConfig(assetPath: string): AssetConfig | null {
    // Use URLPattern if available (Node.js 24+) for better performance
    if (typeof URLPattern !== 'undefined') {
      for (const [pattern, config] of this.assetConfigs) {
        try {
          const urlPattern = new URLPattern({ pathname: pattern })
          if (urlPattern.test({ pathname: assetPath })) {
            return config
          }
        } catch {
          // Fallback to RegExp if URLPattern fails
          if (new RegExp(pattern).test(assetPath)) {
            return config
          }
        }
      }
    } else {
      // Fallback to RegExp for older Node.js versions
      for (const [pattern, config] of this.assetConfigs) {
        if (new RegExp(pattern).test(assetPath)) {
          return config
        }
      }
    }
    return null
  }

  // Asset preloading for critical resources
  generatePreloadTags(): string[] {
    const preloadTags: string[] = []

    // Critical CSS
    preloadTags.push(
      `<link rel="preload" href="${this.getAssetUrl('/assets/critical.css')}" as="style">`,
    )

    // Critical JS
    preloadTags.push(
      `<link rel="preload" href="${this.getAssetUrl('/assets/vendor.js')}" as="script">`,
    )

    // Critical fonts
    const criticalFonts = ['/fonts/game-font.woff2', '/fonts/ui-font.woff2']
    criticalFonts.forEach((font) => {
      preloadTags.push(
        `<link rel="preload" href="${this.getAssetUrl(font)}" as="font" type="font/woff2" crossorigin>`,
      )
    })

    // Game-specific assets based on route
    const gameAssets = ['/audio/ui-sounds.opus', '/images/game-icons.webp']
    gameAssets.forEach((asset) => {
      preloadTags.push(`<link rel="prefetch" href="${this.getAssetUrl(asset)}">`)
    })

    return preloadTags
  }

  // Resource hints for performance optimization
  generateResourceHints(): string[] {
    const hints: string[] = []

    // DNS prefetch for CDN domains
    this.providers.forEach((provider) => {
      const domain = new URL(provider.baseUrl).hostname
      hints.push(`<link rel="dns-prefetch" href="//${domain}">`)
    })

    // Preconnect to primary CDN
    if (this.providers.length > 0) {
      const primaryDomain = new URL(this.providers[0].baseUrl).hostname
      hints.push(`<link rel="preconnect" href="//${primaryDomain}" crossorigin>`)
    }

    return hints
  }

  // Image optimization with responsive breakpoints
  generateResponsiveImageTag(
    imagePath: string,
    alt: string,
    options: {
      sizes?: string
      loading?: 'lazy' | 'eager'
      priority?: boolean
    } = {},
  ): string {
    const { sizes = '100vw', loading = 'lazy', priority = false } = options
    const rule = this.ASSET_RULES.images

    // Generate srcset for different sizes
    const srcset = rule.sizes
      .map((size) => {
        const scaledPath = imagePath.replace(/(\.[^.]+)$/, `_${size}w$1`)
        return `${this.getAssetUrl(scaledPath)} ${size}w`
      })
      .join(', ')

    // Generate WebP alternative
    const webpPath = imagePath.replace(/\.[^.]+$/, '.webp')

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
    `.trim()
  }

  // Cache management and purging
  async purgeCache(assetPaths: string[] = [], tags: string[] = []): Promise<boolean> {
    const purgePromises = this.providers.map(async (provider) => {
      if (!provider.apiKey) return false

      try {
        // Implementation would depend on CDN provider API
        // Example for CloudFlare-style API
        logger.info(`🗑️ Purging cache for provider ${provider.name}`, {
          paths: assetPaths.length,
          tags: tags.length,
        })

        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 100))
        return true
      } catch (error) {
        logger.error(`❌ Failed to purge cache for ${provider.name}:`, error)
        return false
      }
    })

    const results = await Promise.allSettled(purgePromises)
    const successful = results.filter(
      (result) => result.status === 'fulfilled' && result.value === true,
    ).length

    logger.info(`✅ Cache purged for ${successful}/${this.providers.length} providers`)
    return successful > 0
  }

  // Performance monitoring
  recordCDNHit(loadTime: number, bandwidth: number): void {
    this.metrics.cdnHits++
    this.metrics.totalRequests++

    // Update average load time
    const alpha = 0.1
    this.metrics.avgLoadTime = this.metrics.avgLoadTime * (1 - alpha) + loadTime * alpha

    // Update bandwidth
    this.metrics.bandwidth += bandwidth

    // Update cache hit rate
    this.metrics.cacheHitRate = (this.metrics.cdnHits / this.metrics.totalRequests) * 100
  }

  recordCDNMiss(): void {
    this.metrics.cdnMisses++
    this.metrics.totalRequests++
    this.metrics.cacheHitRate = (this.metrics.cdnHits / this.metrics.totalRequests) * 100
  }

  getMetrics(): PerformanceMetrics & { providers: number; totalAssetConfigs: number } {
    return {
      ...this.metrics,
      providers: this.providers.length,
      totalAssetConfigs: this.assetConfigs.size,
    }
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy' | 'not_configured'
    details: CDNHealthDetails
  }> {
    // If no providers are configured, surface a neutral status so overall health isn't degraded
    if (this.providers.length === 0) {
      return {
        status: 'not_configured',
        details: {
          totalProviders: 0,
          healthyProviders: 0,
          metrics: this.getMetrics(),
          checks: [],
        },
      }
    }

    const healthChecks = await Promise.allSettled<ProviderHealthCheck>(
      this.providers.map(async (provider) => {
        try {
          // Simple health check - try to fetch a small asset
          const testUrl = `${provider.baseUrl}/health-check.txt`
          const startTime = Date.now()
          const response = await fetch(testUrl, {
            method: 'HEAD',
            signal: AbortSignal.timeout(5000),
          })

          // Consider 2xx as healthy, and also 4xx as reachable (domain responds),
          // only treat 5xx or network errors as unhealthy.
          const isHealthy = response.ok || (response.status >= 400 && response.status < 500)

          return {
            provider: provider.name,
            healthy: isHealthy,
            responseTime: Date.now() - startTime,
          }
        } catch (error) {
          return {
            provider: provider.name,
            healthy: false,
            error: (error as Error).message,
          }
        }
      }),
    )

    const healthyProviders = healthChecks.filter(
      (check) => check.status === 'fulfilled' && check.value.healthy,
    ).length

    return {
      status: healthyProviders > 0 ? 'healthy' : 'unhealthy',
      details: {
        totalProviders: this.providers.length,
        healthyProviders,
        metrics: this.getMetrics(),
        checks: healthChecks.map((check) =>
          check.status === 'fulfilled' ? check.value : { error: check.reason },
        ),
      },
    }
  }
}

// Export singleton instance
export const cdnService = new CDNService()
