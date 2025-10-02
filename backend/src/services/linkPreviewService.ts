import ogs from 'open-graph-scraper'
import { logger } from '../utils/logger'

export interface LinkPreview {
  url: string
  title?: string
  description?: string
  image?: string
  siteName?: string
}

class LinkPreviewService {
  private cache: Map<string, LinkPreview> = new Map()
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours
  private cacheTimestamps: Map<string, number> = new Map()

  async extractLinks(text: string): Promise<string[]> {
    const urlRegex = /(https?:\/\/[^\s]+)/gi
    const matches = text.match(urlRegex) || []
    return matches.filter((url) => {
      try {
        new URL(url)
        return true
      } catch {
        return false
      }
    })
  }

  async getPreview(url: string): Promise<LinkPreview | null> {
    try {
      // Check cache
      const cachedPreview = this.getCachedPreview(url)
      if (cachedPreview) {
        return cachedPreview
      }

      // Fetch preview
      const { error, result: preview } = await ogs({
        url,
        timeout: 5,
        fetchOptions: {
          headers: {
            'user-agent': 'Mozilla/5.0 (compatible; ConquestK/1.0)',
          },
        },
      })

      if (error || !preview) {
        logger.warn('Open graph metadata not available for url', { url, error })
        return null
      }

      const result: LinkPreview = {
        url,
        title: preview.ogTitle || preview.twitterTitle || preview.dcTitle,
        description: preview.ogDescription || preview.twitterDescription || preview.dcDescription,
        siteName: preview.ogSiteName || preview.twitterSite || preview.ogUrl,
      }

      const ogImageUrl = Array.isArray(preview.ogImage) ? preview.ogImage[0]?.url : undefined

      const twitterImageUrl = Array.isArray(preview.twitterImage)
        ? preview.twitterImage[0]?.url
        : undefined

      if (ogImageUrl) {
        result.image = ogImageUrl
      } else if (twitterImageUrl) {
        result.image = twitterImageUrl
      } else if (preview.favicon) {
        result.image = preview.favicon
      }

      // Cache the result
      this.setCachedPreview(url, result)

      return result
    } catch (error) {
      logger.error('Error fetching link preview', { url, error })
      return null
    }
  }

  async getMultiplePreviews(urls: string[]): Promise<(LinkPreview | null)[]> {
    const promises = urls.map((url) => this.getPreview(url))
    return Promise.all(promises)
  }

  private getCachedPreview(url: string): LinkPreview | null {
    const timestamp = this.cacheTimestamps.get(url)
    if (!timestamp) return null

    if (Date.now() - timestamp > this.CACHE_TTL) {
      this.cache.delete(url)
      this.cacheTimestamps.delete(url)
      return null
    }

    return this.cache.get(url) || null
  }

  private setCachedPreview(url: string, preview: LinkPreview): void {
    this.cache.set(url, preview)
    this.cacheTimestamps.set(url, Date.now())

    // Limit cache size
    if (this.cache.size > 1000) {
      const oldestUrl = Array.from(this.cacheTimestamps.entries()).sort(
        ([, a], [, b]) => a - b,
      )[0][0]
      this.cache.delete(oldestUrl)
      this.cacheTimestamps.delete(oldestUrl)
    }
  }

  clearCache(): void {
    this.cache.clear()
    this.cacheTimestamps.clear()
  }
}

export const linkPreviewService = new LinkPreviewService()
