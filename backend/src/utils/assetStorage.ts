import { promises as fs } from 'node:fs'
import path from 'node:path'
// Note: Avoid import.meta usage here so Jest (CJS) can parse this module
import { DeleteObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { logger } from './logger.js'

const bucket = process.env.ASSET_BUCKET?.trim()
const accessKeyId = process.env.ASSET_ACCESS_KEY_ID?.trim()
const secretAccessKey = process.env.ASSET_SECRET_ACCESS_KEY?.trim()
const endpoint = process.env.ASSET_ENDPOINT?.trim()
const region = process.env.ASSET_REGION?.trim() || 'auto'
const publicBaseUrl = process.env.PUBLIC_ASSET_BASE_URL?.trim().replace(/\/$/, '')
const mapUploadsOverride = process.env.MAP_UPLOADS_DIR?.trim()
const mapUploadsRoot = mapUploadsOverride ? path.resolve(mapUploadsOverride) : null
const isTestEnvironment = process.env.NODE_ENV === 'test'
const allowRemoteInTests = process.env.ASSET_ENABLE_REMOTE_IN_TESTS === 'true'

const hasRemoteConfig = Boolean(bucket && accessKeyId && secretAccessKey && endpoint)

const remoteToggle = process.env.ASSET_REMOTE_ENABLED?.trim().toLowerCase()
const remoteOverride =
  remoteToggle === 'true' ? true : remoteToggle === 'false' ? false : null

const disableRemoteInTests =
  process.env.NODE_ENV === 'test' && remoteOverride !== true

// Resolve a stable uploads root without relying on ESM-only APIs.
// Prefer working-directory relative paths so both dev server and Jest work.
const cwd = process.cwd()
const LOCAL_ROOT = path.join(cwd, path.basename(cwd) === 'backend' ? 'uploads' : 'backend/uploads')

<<<<<<< ours
const isRemoteEnabled =
  remoteOverride ?? (hasRemoteConfig && !disableRemoteInTests)
=======
const hasRemoteCredentials = Boolean(bucket && accessKeyId && secretAccessKey && endpoint)
const isRemoteEnabled = hasRemoteCredentials && (!isTestEnvironment || allowRemoteInTests)
>>>>>>> theirs

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

  if (!remoteConfig) {
    throw new Error('Remote asset storage requested but configuration is missing')
  }

  if (!s3Client) {
    const config = remoteConfig
    s3Client = new S3Client({
      region,
      endpoint: config.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })
  }

  return s3Client
}

const normalizeKey = (key: string): string => {
  const trimmed = key.trim()
  if (!trimmed) {
    throw new Error('Asset key must be a non-empty string')
  }

  const withForwardSlashes = trimmed.replace(/\\+/g, '/')
  if (path.posix.isAbsolute(withForwardSlashes)) {
    throw new Error('Asset key must be a relative path')
  }

  if (/^[a-zA-Z]:/.test(withForwardSlashes)) {
    throw new Error('Asset key must not include a drive prefix')
  }

  const normalized = path.posix.normalize(withForwardSlashes)

  if (!normalized || normalized === '.' || normalized === './') {
    throw new Error('Asset key resolves to an empty path')
  }

  if (normalized === '..' || normalized.startsWith('../')) {
    throw new Error('Asset key must not traverse directories')
  }

  return normalized.replace(/^\/+/, '')
}

const ensureWithinRoot = (root: string, candidate: string): string => {
  const relative = path.relative(root, candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Resolved asset path escapes the uploads root')
  }
  return candidate
}

const buildLocalPath = (key: string): string => {
  const normalizedKey = normalizeKey(key)

  if (mapUploadsRoot) {
    const stagingPrefix = 'maps/staging/'
    if (normalizedKey.startsWith(stagingPrefix)) {
      const relative = normalizedKey.slice(stagingPrefix.length)
      const destination = path.resolve(mapUploadsRoot, relative)
      return ensureWithinRoot(mapUploadsRoot, destination)
    }
  }

  const destination = path.resolve(LOCAL_ROOT, normalizedKey)
  return ensureWithinRoot(LOCAL_ROOT, destination)
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

/**
 * Extract the storage key (e.g. `maps/foo.png`) from a public URL or local uploads path.
 * Handles these cases:
 * - Absolute CDN URL using PUBLIC_ASSET_BASE_URL: `${PUBLIC_ASSET_BASE_URL}/maps/...`
 * - Absolute R2 endpoint URL: `${ASSET_ENDPOINT}/${ASSET_BUCKET}/maps/...`
 * - Local dev served path: `/uploads/maps/...`
 * - Raw storage key input already (returns normalized key)
 */
export const extractStorageKeyFromUrl = (input: string | null | undefined): string | null => {
  if (!input) return null
  let url = input.trim()
  if (!url) return null

  // Strip query/hash
  const hashIndex = url.indexOf('#')
  if (hashIndex >= 0) url = url.slice(0, hashIndex)
  const qIndex = url.indexOf('?')
  if (qIndex >= 0) url = url.slice(0, qIndex)

  // Already a storage key
  if (!/^https?:\/\//i.test(url) && !url.startsWith('/uploads/')) {
    return normalizeKey(url)
  }

  // Local served path
  if (url.startsWith('/uploads/')) {
    const relative = url.replace(/^\/uploads\//, '')
    return normalizeKey(relative)
  }

  // Try PUBLIC_ASSET_BASE_URL
  if (publicBaseUrl && url.startsWith(publicBaseUrl)) {
    const suffix = url.slice(publicBaseUrl.length).replace(/^\//, '')
    return normalizeKey(suffix)
  }

  // Try R2 endpoint + bucket
  if (remoteConfig) {
    const base = `${remoteConfig.endpoint.replace(/\/$/, '')}/${remoteConfig.bucket}`
    if (url.startsWith(base)) {
      const suffix = url.slice(base.length).replace(/^\//, '')
      return normalizeKey(suffix)
    }
  }

  // Fallback: attempt to parse path and locate `/maps/...`
  try {
    const parsed = new URL(url)
    const idx = parsed.pathname.indexOf('/maps/')
    if (idx >= 0) {
      const key = parsed.pathname.slice(idx + 1) // remove leading '/'
      return normalizeKey(key)
    }
  } catch {
    // ignore
  }

  return null
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
