import path from 'node:path'
import { imageSize } from 'image-size'
import { getPublicAssetUrl, uploadAsset } from './assetStorage.js'
import { logger } from './logger.js'

interface StoreImageOptions {
  mimeType?: string
  preferredFilename?: string
  subdirectory?: string
}

export interface StoredImageInfo {
  filename: string
  relativeUrl: string
  width: number
  height: number
  storageKey: string
}

const mimeToExtension = (mimeType: string | undefined): string => {
  switch (mimeType) {
    case 'image/jpeg':
    case 'image/jpg':
      return '.jpg'
    case 'image/webp':
      return '.webp'
    case 'image/gif':
      return '.gif'
    default:
      return '.png'
  }
}

const sanitizePreferredFilename = (preferred?: string): string | null => {
  if (!preferred) return null
  const trimmed = preferred.trim()
  if (!trimmed) return null

  const base = path.basename(trimmed)
  const sanitized = base.replace(/[^a-zA-Z0-9._-]/g, '')
  const withoutLeadingDots = sanitized.replace(/^\.+/, '')

  if (!withoutLeadingDots) return null

  return withoutLeadingDots
}

export const storeBase64Image = async (
  base64Data: string,
  options: StoreImageOptions = {},
): Promise<StoredImageInfo> => {
  const buffer = Buffer.from(base64Data, 'base64')
  return storeImageBuffer(buffer, options)
}

const buildStorageKey = (filename: string, subdirectory?: string): string => {
  const segments = ['maps']
  if (subdirectory) segments.push(subdirectory)
  segments.push(filename)
  return segments.join('/')
}

export const storeImageBuffer = async (
  buffer: Buffer,
  options: StoreImageOptions = {},
): Promise<StoredImageInfo> => {
  const sanitizedPreferred = sanitizePreferredFilename(options.preferredFilename)
  const fallbackExtension = mimeToExtension(options.mimeType)
  const preferredWithExtension = sanitizedPreferred
    ? sanitizedPreferred + (path.extname(sanitizedPreferred) ? '' : fallbackExtension)
    : null
  const extension = preferredWithExtension
    ? path.extname(preferredWithExtension) || fallbackExtension
    : fallbackExtension
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`

  const uniqueFilename = preferredWithExtension
    ? `${uniqueSuffix}-${preferredWithExtension}`
    : `map-${uniqueSuffix}${extension}`

  const storageKey = buildStorageKey(uniqueFilename, options.subdirectory)

  await uploadAsset({
    key: storageKey,
    body: buffer,
    cacheControl: 'public, max-age=31536000, immutable',
    ...(options.mimeType ? { contentType: options.mimeType } : {}),
  })

  let width = 800
  let height = 600
  try {
    const dimensions = imageSize(buffer)
    width = dimensions.width ?? width
    height = dimensions.height ?? height
  } catch (dimensionError) {
    logger.warn('Failed to read image dimensions', dimensionError)
  }

  const relativeUrl = getPublicAssetUrl(storageKey)

  // Cloudflare Image Transformations handles format conversion and resizing on-the-fly.
  // We only store the original image and let the CDN do the rest.

  return {
    filename: uniqueFilename,
    relativeUrl,
    width,
    height,
    storageKey,
  }
}
