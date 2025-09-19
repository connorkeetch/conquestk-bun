import { promises as fsPromises } from 'node:fs'
import path from 'node:path'
import sizeOf from 'image-size'
import { logger } from './logger'
import { getMapUploadsDir } from './mapUploads'

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
  const extension = options.preferredFilename
    ? path.extname(options.preferredFilename) || mimeToExtension(options.mimeType)
    : mimeToExtension(options.mimeType)

  const uniqueFilename = options.preferredFilename
    ? `${Date.now()}-${Math.random().toString(36).substring(7)}-${options.preferredFilename.replace(/\s+/g, '-')}`
    : `map-${Date.now()}-${Math.random().toString(36).substring(7)}${extension}`

  const rootDir = getMapUploadsDir()
  const targetDir = options.subdirectory ? path.join(rootDir, options.subdirectory) : rootDir

  await fsPromises.mkdir(targetDir, { recursive: true })

  const filepath = path.join(targetDir, uniqueFilename)
  await fsPromises.writeFile(filepath, buffer)

  let width = 800
  let height = 600
  try {
    const dimensions = sizeOf(buffer)
    width = dimensions.width ?? width
    height = dimensions.height ?? height
  } catch (dimensionError) {
    logger.warn('Failed to read image dimensions', dimensionError)
  }

  const relativeUrl = `/uploads/maps${options.subdirectory ? `/${options.subdirectory}` : ''}/${uniqueFilename}`

  return {
    filename: uniqueFilename,
    relativeUrl,
    width,
    height,
  }
}
