import { promises as fs } from 'node:fs'
import path from 'node:path'
import { DeleteObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { logger } from './logger'

const bucket = process.env.ASSET_BUCKET?.trim()
const accessKeyId = process.env.ASSET_ACCESS_KEY_ID?.trim()
const secretAccessKey = process.env.ASSET_SECRET_ACCESS_KEY?.trim()
const endpoint = process.env.ASSET_ENDPOINT?.trim()
const region = process.env.ASSET_REGION?.trim() || 'auto'
const publicBaseUrl = process.env.PUBLIC_ASSET_BASE_URL?.trim().replace(/\/$/, '')
const mapUploadsOverride = process.env.MAP_UPLOADS_DIR?.trim()

const LOCAL_ROOT = path.join(__dirname, '../../uploads')

const isRemoteEnabled = Boolean(bucket && accessKeyId && secretAccessKey && endpoint)

type RemoteConfig = {
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  endpoint: string
}

const remoteConfig: RemoteConfig | null = isRemoteEnabled
  ? {
      bucket: bucket as string,
      accessKeyId: accessKeyId as string,
      secretAccessKey: secretAccessKey as string,
      endpoint: endpoint as string,
    }
  : null

let s3Client: S3Client | null = null

const getS3Client = (): S3Client => {
  if (!isRemoteEnabled) {
    throw new Error('S3 client requested but asset storage is not configured for remote uploads')
  }

  if (!s3Client) {
    s3Client = new S3Client({
      region,
      endpoint: remoteConfig.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: remoteConfig.accessKeyId,
        secretAccessKey: remoteConfig.secretAccessKey,
      },
    })
  }

  return s3Client
}

const normalizeKey = (key: string): string => key.replace(/^\/+/, '')

const buildLocalPath = (key: string): string => {
  const normalizedKey = normalizeKey(key)

  if (mapUploadsOverride) {
    const stagingPrefix = 'maps/staging/'
    if (normalizedKey.startsWith(stagingPrefix)) {
      const relative = normalizedKey.slice(stagingPrefix.length)
      return path.join(mapUploadsOverride, relative)
    }
  }

  return path.join(LOCAL_ROOT, normalizedKey)
}

const isNotFoundError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false
  const candidate = error as {
    name?: string
    Code?: string
    code?: string
    $metadata?: { httpStatusCode?: number }
  }

  if (candidate.$metadata?.httpStatusCode === 404) return true
  const code = candidate.Code || candidate.code
  if (code === 'NotFound' || code === 'NoSuchKey') return true
  if (candidate.name === 'NotFound' || candidate.name === 'NoSuchKey') return true
  return false
}

const fallbackPublicUrl = (key: string): string => {
  if (publicBaseUrl) {
    return `${publicBaseUrl}/${normalizeKey(key)}`
  }

  if (remoteConfig) {
    const normalizedEndpoint = remoteConfig.endpoint.replace(/\/$/, '')
    return `${normalizedEndpoint}/${remoteConfig.bucket}/${normalizeKey(key)}`
  }

  return `/uploads/${normalizeKey(key)}`
}

export interface UploadAssetOptions {
  key: string
  body: Buffer | Uint8Array
  contentType?: string
  cacheControl?: string
}

export interface AssetUploadResult {
  key: string
  url: string
  storage: 'remote' | 'local'
}

export const isRemoteAssetStorageEnabled = (): boolean => isRemoteEnabled

export const getPublicAssetUrl = (key: string): string => fallbackPublicUrl(key)

export const uploadAsset = async (options: UploadAssetOptions): Promise<AssetUploadResult> => {
  const { key, body, contentType, cacheControl } = options
  const normalizedKey = normalizeKey(key)

  if (isRemoteEnabled) {
    if (!remoteConfig) {
      throw new Error('Remote asset storage requested but configuration is missing')
    }
    try {
      const client = getS3Client()
      const uploader = new Upload({
        client,
        params: {
          Bucket: remoteConfig.bucket,
          Key: normalizedKey,
          Body: body,
          ContentType: contentType,
          CacheControl: cacheControl,
        },
      })

      await uploader.done()

      return {
        key: normalizedKey,
        url: fallbackPublicUrl(normalizedKey),
        storage: 'remote',
      }
    } catch (error) {
      logger.error('Failed to upload asset to remote storage', {
        key: normalizedKey,
        error,
      })
      throw error
    }
  }

  // Local fallback
  try {
    const destination = buildLocalPath(normalizedKey)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.writeFile(destination, body)

    return {
      key: normalizedKey,
      url: fallbackPublicUrl(normalizedKey),
      storage: 'local',
    }
  } catch (error) {
    logger.error('Failed to store asset locally', {
      key: normalizedKey,
      error,
    })
    throw error
  }
}

export const deleteAsset = async (key: string): Promise<void> => {
  const normalizedKey = normalizeKey(key)

  if (isRemoteEnabled) {
    if (!remoteConfig) {
      throw new Error('Remote asset storage requested but configuration is missing')
    }
    try {
      const client = getS3Client()
      await client.send(
        new DeleteObjectCommand({
          Bucket: remoteConfig.bucket,
          Key: normalizedKey,
        }),
      )
      return
    } catch (error) {
      logger.warn('Unable to delete asset from remote storage', {
        key: normalizedKey,
        error,
      })
      throw error
    }
  }

  try {
    const destination = buildLocalPath(normalizedKey)
    await fs.unlink(destination)
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return
    }
    logger.warn('Unable to delete asset from local storage', {
      key: normalizedKey,
      error,
    })
    throw error
  }
}

export const assetExists = async (key: string): Promise<boolean> => {
  const normalizedKey = normalizeKey(key)

  if (isRemoteEnabled) {
    if (!remoteConfig) {
      throw new Error('Remote asset storage requested but configuration is missing')
    }
    try {
      const client = getS3Client()
      await client.send(
        new HeadObjectCommand({
          Bucket: remoteConfig.bucket,
          Key: normalizedKey,
        }),
      )
      return true
    } catch (error) {
      if (isNotFoundError(error)) {
        return false
      }
      logger.warn('Failed to check remote asset existence', {
        key: normalizedKey,
        error,
      })
      throw error
    }
  }

  try {
    const destination = buildLocalPath(normalizedKey)
    await fs.access(destination)
    return true
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return false
    }
    logger.warn('Failed to check local asset existence', {
      key: normalizedKey,
      error,
    })
    throw error
  }
}
