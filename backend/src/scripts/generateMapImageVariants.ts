import path from 'node:path'
import dotenv from 'dotenv'
import sharp from 'sharp'
import { logger } from '../utils/logger.js'

// Load .env before importing modules that read env at module scope
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

// Defer env-sensitive imports until after dotenv has run
const { query } = await import('../config/database.js')
const { assetExists, extractStorageKeyFromUrl, getPublicAssetUrl, uploadAsset } = await import(
  '../utils/assetStorage.js'
)

type Options = {
  mapId?: string
  like?: string
  dry?: boolean
  limit?: number
}

function parseArgs(): Options {
  const opts: Options = {}
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--map-id' && args[i + 1]) opts.mapId = args[++i]
    else if (a === '--like' && args[i + 1]) opts.like = args[++i]
    else if (a === '--dry') opts.dry = true
    else if (a === '--limit' && args[i + 1]) {
      const next = args[++i]
      if (next) opts.limit = parseInt(next, 10)
    }
  }
  return opts
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  const arr = await res.arrayBuffer()
  return Buffer.from(arr)
}

async function processOne(
  imageUrl: string,
  intrinsicWidth: number,
  _height: number,
  dry: boolean,
): Promise<{ created: string[]; skipped: string[] }> {
  const created: string[] = []
  const skipped: string[] = []
  const key = extractStorageKeyFromUrl(imageUrl)
  if (!key) throw new Error(`Could not derive storage key from url: ${imageUrl}`)
  const base = key.replace(/\.[^.]+$/, '')
  const avifKey = `${base}.avif`
  const webpKey = `${base}.webp`

  // Skip if both already exist
  const [hasAvif, hasWebp] = await Promise.all([
    assetExists(avifKey).catch(() => false),
    assetExists(webpKey).catch(() => false),
  ])
  if (hasAvif) skipped.push('avif')
  if (hasWebp) skipped.push('webp')
  if (hasAvif && hasWebp) return { created, skipped }

  const srcBuf = await fetchBuffer(getPublicAssetUrl(key))

  if (!hasAvif) {
    const avifBuf = await sharp(srcBuf).avif({ quality: 60, effort: 4 }).toBuffer()
    if (!dry) {
      await uploadAsset({
        key: avifKey,
        body: avifBuf,
        contentType: 'image/avif',
        cacheControl: 'public, max-age=31536000, immutable',
      })
    }
    created.push('avif')
  }

  if (!hasWebp) {
    const webpBuf = await sharp(srcBuf).webp({ quality: 70 }).toBuffer()
    if (!dry) {
      await uploadAsset({
        key: webpKey,
        body: webpBuf,
        contentType: 'image/webp',
        cacheControl: 'public, max-age=31536000, immutable',
      })
    }
    created.push('webp')
  }

  // Responsive widths
  const targets = [1024, 1536, 2048].filter((w) => w > 0 && w < intrinsicWidth)
  for (const w of targets) {
    const avifW = `${base}-${w}w.avif`
    const webpW = `${base}-${w}w.webp`
    const [haveAvifW, haveWebpW] = await Promise.all([
      assetExists(avifW).catch(() => false),
      assetExists(webpW).catch(() => false),
    ])
    if (!haveAvifW) {
      const buf = await sharp(srcBuf)
        .resize({ width: w })
        .avif({ quality: 60, effort: 4 })
        .toBuffer()
      if (!dry) {
        await uploadAsset({
          key: avifW,
          body: buf,
          contentType: 'image/avif',
          cacheControl: 'public, max-age=31536000, immutable',
        })
      }
      created.push(`avif-${w}w`)
    } else {
      skipped.push(`avif-${w}w`)
    }
    if (!haveWebpW) {
      const buf = await sharp(srcBuf).resize({ width: w }).webp({ quality: 70 }).toBuffer()
      if (!dry) {
        await uploadAsset({
          key: webpW,
          body: buf,
          contentType: 'image/webp',
          cacheControl: 'public, max-age=31536000, immutable',
        })
      }
      created.push(`webp-${w}w`)
    } else {
      skipped.push(`webp-${w}w`)
    }
  }

  return { created, skipped }
}

async function run(): Promise<void> {
  const opts = parseArgs()
  logger.info('[variants] starting', opts)

  const conditions: string[] = ['image_url IS NOT NULL']
  const params: unknown[] = []
  if (opts.mapId) {
    conditions.push('id = $1')
    params.push(opts.mapId)
  }
  let likeClause = ''
  if (opts.like) {
    likeClause = ` AND image_url LIKE $${params.length + 1}`
    params.push(`%${opts.like}%`)
  }
  const lim = Number.isFinite(opts.limit) ? Math.max(1, opts.limit as number) : 100

  const sql = `SELECT id, name, image_url AS imageUrl, image_width AS width, image_height AS height
               FROM maps
               WHERE ${conditions.join(' AND ')}${likeClause}
               ORDER BY created_at DESC
               LIMIT ${lim}`
  const res = await query<{
    id: string
    name: string
    imageurl: string
    imageurl_1?: string
    imageUrl?: string
    width: number
    height: number
  }>(sql, params)

  const rows = res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    imageUrl:
      (r as unknown as { imageUrl?: string; imageurl?: string }).imageUrl ||
      (r as unknown as { imageUrl?: string; imageurl?: string }).imageurl ||
      '',
    width: r.width,
    height: r.height,
  }))

  if (!rows.length) {
    logger.info('[variants] no candidate maps found')
    return
  }

  logger.info(`[variants] processing ${rows.length} map(s) ...`)
  for (const row of rows) {
    if (!row.imageUrl) continue
    try {
      const { created, skipped } = await processOne(row.imageUrl, row.width, row.height, !!opts.dry)
      logger.info('[variants] map', {
        id: row.id,
        name: row.name,
        created,
        skipped,
      })
    } catch (err) {
      logger.warn('[variants] failed', {
        id: row.id,
        name: row.name,
        error: err instanceof Error ? err.message : err,
      })
    }
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('[variants] fatal', err)
    process.exit(1)
  })
