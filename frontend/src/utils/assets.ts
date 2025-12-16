const ASSET_BASE = import.meta.env.VITE_ASSET_BASE_URL?.trim().replace(/\/$/, '') || ''
const ABSOLUTE_URL_REGEX = /^https?:\/\//i

export const resolveAssetPath = (relativePath: string): string => {
  if (!relativePath) return relativePath
  if (ABSOLUTE_URL_REGEX.test(relativePath)) return relativePath

  const normalized = relativePath.replace(/^\/+/, '')
  if (!normalized) return ASSET_BASE || '/'

  if (!ASSET_BASE) {
    return `/${normalized}`
  }

  return `${ASSET_BASE}/${normalized}`
}

export const getAssetBaseUrl = (): string => ASSET_BASE

/**
 * Generate a Cloudflare Image Transformation URL.
 * Uses /cdn-cgi/image/{params}/{path} format for on-the-fly transforms.
 *
 * @param url - Original image URL (absolute or relative)
 * @param options - Transformation options
 * @returns Transformed URL or original if transformations unavailable
 */
export function cfImage(
  url: string,
  options?: {
    width?: number
    height?: number
    quality?: number
    format?: 'auto' | 'avif' | 'webp' | 'jpeg' | 'png'
    fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad'
  },
): string {
  if (!url) return url

  // Skip transformations for local uploads (development mode)
  // Cloudflare transforms only work when proxied through Cloudflare CDN
  if (url.startsWith('/uploads/') || url.startsWith('uploads/')) {
    return url.startsWith('/') ? url : `/${url}`
  }

  // Build transformation parameters
  const params: string[] = []
  if (options?.format) params.push(`format=${options.format}`)
  if (options?.quality) params.push(`quality=${options.quality}`)
  if (options?.width) params.push(`width=${options.width}`)
  if (options?.height) params.push(`height=${options.height}`)
  if (options?.fit) params.push(`fit=${options.fit}`)

  // If no transformations, return original
  if (params.length === 0) return url

  // Extract the path from the URL
  let imagePath: string
  if (ABSOLUTE_URL_REGEX.test(url)) {
    try {
      const parsed = new URL(url)
      // Only transform URLs from our asset domain
      const assetHost = ASSET_BASE ? new URL(ASSET_BASE).host : ''
      if (assetHost && parsed.host !== assetHost) {
        // External URL, can't transform
        return url
      }
      imagePath = parsed.pathname
    } catch {
      return url
    }
  } else {
    imagePath = url.startsWith('/') ? url : `/${url}`
  }

  // Build the Cloudflare transform URL
  // Format: /cdn-cgi/image/{params}/{path}
  return `/cdn-cgi/image/${params.join(',')}${imagePath}`
}

/**
 * Generate srcset string for responsive images using Cloudflare transforms.
 *
 * @param url - Original image URL
 * @param widths - Array of widths to generate
 * @param options - Base transformation options (format, quality, fit)
 * @returns srcset string for use in img/source elements
 */
export function cfImageSrcSet(
  url: string,
  widths: number[],
  options?: {
    quality?: number
    format?: 'auto' | 'avif' | 'webp' | 'jpeg' | 'png'
    fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad'
  },
): string {
  if (!url || !widths.length) return ''
  return widths.map((w) => `${cfImage(url, { ...options, width: w })} ${w}w`).join(', ')
}
