import path from 'node:path'
import sizeOf from 'image-size'
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
  const extension = options.preferredFilename
    ? path.extname(options.preferredFilename) || mimeToExtension(options.mimeType)
    : mimeToExtension(options.mimeType)

  const uniqueFilename = options.preferredFilename
    ? `${Date.now()}-${Math.random().toString(36).substring(7)}-${options.preferredFilename.replace(/\s+/g, '-')}`
    : `map-${Date.now()}-${Math.random().toString(36).substring(7)}${extension}`

  const storageKey = buildStorageKey(uniqueFilename, options.subdirectory)

  await uploadAsset({
    key: storageKey,
    body: buffer,
    contentType: options.mimeType,
    cacheControl: 'public, max-age=31536000, immutable',
  })

  let width = 800
  let height = 600
  try {
    const dimensions = sizeOf(buffer)
    width = dimensions.width ?? width
    height = dimensions.height ?? height
  } catch (dimensionError) {
    logger.warn('Failed to read image dimensions', dimensionError)
  }

  const relativeUrl = getPublicAssetUrl(storageKey)

  return {
    filename: uniqueFilename,
    relativeUrl,
    width,
    height,
    storageKey,
  }
}
