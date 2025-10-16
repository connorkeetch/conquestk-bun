import path from 'node:path'
import { imageSize } from 'image-size'
import sharp from 'sharp'
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
  variants?: {
    avif?: Array<{ key: string; url: string; width: number; height: number }>
    webp?: Array<{ key: string; url: string; width: number; height: number }>
  }
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

  // Generate modern format variants alongside the original, using the same intrinsic size.
  // Keep naming predictable: maps/<base>.avif, maps/<base>.webp
  const baseKey = storageKey.replace(/\.[^.]+$/, '')
  const avifKey = `${baseKey}.avif`
  const webpKey = `${baseKey}.webp`
  const variants: StoredImageInfo['variants'] = {}

  try {
    const avifBuf = await sharp(buffer).avif({ quality: 60, effort: 4 }).toBuffer()
    await uploadAsset({
      key: avifKey,
      body: avifBuf,
      contentType: 'image/avif',
      cacheControl: 'public, max-age=31536000, immutable',
    })
    variants.avif = [{ key: avifKey, url: getPublicAssetUrl(avifKey), width, height }]
  } catch (err) {
    logger.warn('Failed to generate AVIF variant for map image (non-fatal)', {
      storageKey,
      error: err instanceof Error ? err.message : err,
    })
  }

  try {
    const webpBuf = await sharp(buffer).webp({ quality: 70 }).toBuffer()
    await uploadAsset({
      key: webpKey,
      body: webpBuf,
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000, immutable',
    })
    variants.webp = [{ key: webpKey, url: getPublicAssetUrl(webpKey), width, height }]
  } catch (err) {
    logger.warn('Failed to generate WebP variant for map image (non-fatal)', {
      storageKey,
      error: err instanceof Error ? err.message : err,
    })
  }

  // Responsive widths: generate downscaled variants if beneficial
  try {
    const targetWidths = [1024, 1536, 2048].filter((w) => w > 0 && w < width).sort((a, b) => a - b)
    for (const w of targetWidths) {
      const h = Math.round((w / width) * height)
      try {
        const key = `${baseKey}-${w}w.avif`
        const buf = await sharp(buffer)
          .resize({ width: w })
          .avif({ quality: 60, effort: 4 })
          .toBuffer()
        await uploadAsset({
          key,
          body: buf,
          contentType: 'image/avif',
          cacheControl: 'public, max-age=31536000, immutable',
        })
        if (!variants.avif) variants.avif = []
        variants.avif.push({ key, url: getPublicAssetUrl(key), width: w, height: h })
      } catch (e) {
        logger.warn('Failed to generate AVIF responsive variant', {
          storageKey,
          width: w,
          error: e,
        })
      }
      try {
        const key = `${baseKey}-${w}w.webp`
        const buf = await sharp(buffer).resize({ width: w }).webp({ quality: 70 }).toBuffer()
        await uploadAsset({
          key,
          body: buf,
          contentType: 'image/webp',
          cacheControl: 'public, max-age=31536000, immutable',
        })
        if (!variants.webp) variants.webp = []
        variants.webp.push({ key, url: getPublicAssetUrl(key), width: w, height: h })
      } catch (e) {
        logger.warn('Failed to generate WebP responsive variant', {
          storageKey,
          width: w,
          error: e,
        })
      }
    }
    if (variants.avif) variants.avif.sort((a, b) => a.width - b.width)
    if (variants.webp) variants.webp.sort((a, b) => a.width - b.width)
  } catch (e) {
    logger.warn('Responsive variant generation error (non-fatal)', { storageKey, error: e })
  }

  return {
    filename: uniqueFilename,
    relativeUrl,
    width,
    height,
    storageKey,
    ...(variants.avif || variants.webp ? { variants } : {}),
  }
}
