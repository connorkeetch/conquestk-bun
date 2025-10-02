declare module 'open-graph-scraper' {
  export interface OpenGraphImage {
    url?: string
  }

  export interface OpenGraphScraperOptions {
    url: string
    timeout?: number
    fetchOptions?: {
      headers?: Record<string, string>
    }
  }

  export interface OpenGraphScraperResult {
    ogTitle?: string
    ogDescription?: string
    ogSiteName?: string
    ogUrl?: string
    ogImage?: OpenGraphImage[] | OpenGraphImage
    twitterTitle?: string
    twitterDescription?: string
    twitterSite?: string
    twitterImage?: OpenGraphImage[] | OpenGraphImage
    dcTitle?: string
    dcDescription?: string
    favicon?: string
  }

  export interface OpenGraphScraperResponse {
    error: boolean
    result?: OpenGraphScraperResult
    errorDetails?: unknown
  }

  export default function ogs(options: OpenGraphScraperOptions): Promise<OpenGraphScraperResponse>
}
