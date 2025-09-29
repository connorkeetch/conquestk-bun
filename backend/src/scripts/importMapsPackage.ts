import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'

// Load backend/.env before importing helpers that read env on import
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

import { storeBase64Image, storeImageBuffer } from '../utils/imageStorage'
import type { TerritoryModifierMetadata } from '../types/maps'
import { logger } from '../utils/logger'

type Json = unknown

type MapPackageJson = {
  name: string
  description?: string
  minPlayers?: number
  maxPlayers?: number
  tags?: string[]
  width?: number
  height?: number
  imageFilename?: string
  image?: { mimeType?: string; data: string }
  territories?: Json
  continents?: Json
  adjacencies?: Json
  capitalAssignments?: Record<string, string[]>
  territoryModifiers?: Record<string, unknown>
}

type Options = {
  zipPath?: string
  dirPath?: string
  userId?: string
  dryRun?: boolean
  approve?: boolean
  draftOnFail?: boolean
  forceDraft?: boolean
  nameSuffix?: string
}

const parseArgs = (): Options => {
  const opts: Options = {}
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--zip' && args[i + 1]) opts.zipPath = args[++i]
    else if (a === '--dir' && args[i + 1]) opts.dirPath = args[++i]
    else if (a === '--user' && args[i + 1]) opts.userId = args[++i]
    else if (a === '--dry') opts.dryRun = true
    else if (a === '--approve') opts.approve = true
    else if (a === '--draft-on-fail') opts.draftOnFail = true
    else if (a === '--force-draft') opts.forceDraft = true
    else if (a === '--name-suffix' && args[i + 1]) opts.nameSuffix = args[++i]
  }
  return opts
}

const ensurePath = (p: string): string => (path.isAbsolute(p) ? p : path.resolve(process.cwd(), p))

const listCandidateJsonFiles = (root: string): string[] => {
  const out: string[] = []
  const scan = (dir: string, depth: number) => {
    if (depth > 6) return
    let entries: fs.Dirent[] = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        scan(full, depth + 1)
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.json')) {
        out.push(full)
      }
    }
  }
  scan(root, 0)
  // Prefer files literally named map.json first, then others
  return out.sort((a, b) => {
    const aIsMap = path.basename(a).toLowerCase() === 'map.json'
    const bIsMap = path.basename(b).toLowerCase() === 'map.json'
    if (aIsMap && !bIsMap) return -1
    if (!aIsMap && bIsMap) return 1
    return a.localeCompare(b)
  })
}

const extToMime = (ext: string): string => {
  const e = ext.toLowerCase().replace(/^\./, '')
  switch (e) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    default:
      return 'image/png'
  }
}

const slug = (name: string): string =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'map'

const findImageFile = (
  folder: string,
  preferred?: string,
): { filePath: string; mimeType: string } | null => {
  if (preferred) {
    const candidate = path.join(folder, preferred)
    if (fs.existsSync(candidate)) {
      return { filePath: candidate, mimeType: extToMime(path.extname(candidate)) }
    }
  }
  const names = ['background.png', 'background.jpg', 'background.jpeg', 'background.webp']
  for (const n of names) {
    const candidate = path.join(folder, n)
    if (fs.existsSync(candidate)) {
      return { filePath: candidate, mimeType: extToMime(path.extname(candidate)) }
    }
  }
  for (const file of fs.readdirSync(folder)) {
    if (/\.(png|jpe?g|webp|gif)$/i.test(file)) {
      const candidate = path.join(folder, file)
      return { filePath: candidate, mimeType: extToMime(path.extname(candidate)) }
    }
  }
  return null
}

async function resolveCreatorUserId(explicit?: string): Promise<string> {
  if (explicit) return explicit
  const { query } = (await import('../config/database')) as typeof import('../config/database')
  const admin = await query<{ id: string }>(
    'SELECT id FROM users WHERE is_admin = TRUE ORDER BY created_at ASC LIMIT 1',
  )
  if (admin.rows[0]?.id) return admin.rows[0].id
  const any = await query<{ id: string }>('SELECT id FROM users ORDER BY created_at ASC LIMIT 1')
  if (any.rows[0]?.id) return any.rows[0].id
  throw new Error('No users found. Create a user first or pass --user <id>.')
}

async function resolveAdminUserId(): Promise<string> {
  const { query } = (await import('../config/database')) as typeof import('../config/database')
  const admin = await query<{ id: string }>(
    'SELECT id FROM users WHERE is_admin = TRUE ORDER BY created_at ASC LIMIT 1',
  )
  if (admin.rows[0]?.id) return admin.rows[0].id
  throw new Error('No admin users found; cannot approve maps automatically')
}

const normalizeImageUrl = (url?: string): string | undefined => {
  if (!url) return url
  const endpoint = process.env.ASSET_ENDPOINT?.replace(/\/$/, '')
  const bucket = process.env.ASSET_BUCKET?.replace(/\/$/, '')
  const publicBase = process.env.PUBLIC_ASSET_BASE_URL?.replace(/\/$/, '')
  if (publicBase && endpoint && bucket) {
    const oldPrefix = `${endpoint}/${bucket}`
    if (url.startsWith(oldPrefix)) {
      return url.replace(oldPrefix, publicBase)
    }
  }
  return url
}

async function extractZip(zipPath: string): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AdmZip = require('adm-zip') as any
    const tempDir = path.join(os.tmpdir(), `maps-import-${randomUUID()}`)
    fs.mkdirSync(tempDir, { recursive: true })
    const zip = new AdmZip(zipPath)
    zip.extractAllTo(tempDir, true)
    return tempDir
  } catch (err) {
    logger.error('Failed to load/extract zip. Install adm-zip or extract manually and use --dir.', err)
    throw new Error('adm-zip not installed. Run: cd backend && npm i adm-zip')
  }
}

async function run(): Promise<void> {
  const opts = parseArgs()

  let userId: string | undefined
  if (!opts.dryRun) {
    userId = await resolveCreatorUserId(opts.userId || process.env.IMPORT_USER_ID)
    logger.info(`Using creator user: ${userId}`)
  } else {
    logger.info('Dry run: skipping user lookup and database writes')
  }

  let workingRoot: string
  if (opts.dirPath) {
    workingRoot = ensurePath(opts.dirPath)
  } else if (opts.zipPath) {
    const zipAbs = ensurePath(opts.zipPath)
    if (!fs.existsSync(zipAbs)) throw new Error(`Zip not found: ${zipAbs}`)
    workingRoot = await extractZip(zipAbs)
  } else {
    const defaultZip = path.resolve(process.cwd(), '../../maps-package.zip')
    if (!fs.existsSync(defaultZip)) throw new Error('Provide --zip <file> or --dir <folder>')
    workingRoot = await extractZip(defaultZip)
  }

  const jsonFiles = listCandidateJsonFiles(workingRoot)
  if (jsonFiles.length === 0) {
    logger.warn('No map JSON files found in the package')
    return
  }

  for (const jsonPath of jsonFiles) {
    const folder = path.dirname(jsonPath)
    try {
      const raw = fs.readFileSync(jsonPath, 'utf8')
      const data = JSON.parse(raw) as MapPackageJson
      if (!data.name || typeof data.name !== 'string') throw new Error('map.json missing name')

      // Apply optional name suffix to enable test imports without colliding
      if (opts.nameSuffix && typeof opts.nameSuffix === 'string') {
        data.name = `${data.name}${opts.nameSuffix}`
      }

      // Skip if a map or draft with this name already exists (default behavior)
      const { query } = (await import('../config/database')) as typeof import('../config/database')
      const existingMap = await query<{ id: string }>(
        'SELECT id FROM maps WHERE LOWER(name) = LOWER($1) LIMIT 1',
        [data.name.trim()],
      )
      const existingDraft = await query<{ id: string }>(
        "SELECT id FROM map_drafts WHERE LOWER(name) = LOWER($1) AND draft_status != 'submitted' LIMIT 1",
        [data.name.trim()],
      )
      if (existingMap.rows[0]?.id || existingDraft.rows[0]?.id) {
        logger.info('⏭️  Skipping existing map by name', {
          name: data.name,
          existingMapId: existingMap.rows[0]?.id,
          existingDraftId: existingDraft.rows[0]?.id,
          source: jsonPath,
        })
        continue
      }

      // Resolve image and upload via asset pipeline
      let imageUrl: string | undefined
      let imageWidth: number | undefined
      let imageHeight: number | undefined
      const subdir = `imports/${slug(data.name)}`

      if (data.image && typeof data.image.data === 'string') {
        const match = data.image.data.match(/^data:[^;]+;base64,(.*)$/)
        const base64 = match ? match[1] : data.image.data
        const info = await storeBase64Image(base64, {
          mimeType: data.image.mimeType || 'image/png',
          preferredFilename: data.imageFilename || 'background.png',
          subdirectory: subdir,
        })
        imageUrl = normalizeImageUrl(info.relativeUrl)
        imageWidth = info.width
        imageHeight = info.height
      } else {
        const found = findImageFile(folder, data.imageFilename)
        if (!found) throw new Error('No image found in folder')
        const buffer = fs.readFileSync(found.filePath)
        const info = await storeImageBuffer(buffer, {
          mimeType: found.mimeType,
          preferredFilename: path.basename(found.filePath),
          subdirectory: subdir,
        })
        imageUrl = normalizeImageUrl(info.relativeUrl)
        imageWidth = info.width
        imageHeight = info.height
      }

  const metadata = {
        territories: Array.isArray(data.territories) ? data.territories : [],
        continents: Array.isArray(data.continents) ? data.continents : [],
        adjacencies: Array.isArray(data.adjacencies) ? data.adjacencies : [],
        capitalAssignments: data.capitalAssignments || {},
        territoryModifiers: (data.territoryModifiers as
          | Record<string, TerritoryModifierMetadata>
          | undefined) || undefined,
        width: typeof data.width === 'number' ? data.width : imageWidth,
        height: typeof data.height === 'number' ? data.height : imageHeight,
      }

      // Normalize connections/adjacencies for compatibility
      const normTerritories = Array.isArray(metadata.territories)
        ? metadata.territories.map((t: any) => {
            if (t && !Array.isArray(t.connections)) {
              const neighbors = Array.isArray(t.neighbors)
                ? t.neighbors
                : Array.isArray(t.neighbours)
                  ? t.neighbours
                  : Array.isArray(t.links)
                    ? t.links
                    : Array.isArray(t.adjacent)
                      ? t.adjacent
                      : undefined
              if (Array.isArray(neighbors)) {
                return { ...t, connections: neighbors.filter((x: any) => typeof x === 'string') }
              }
            }
            return t
          })
        : []

      const normAdjacencies = (() => {
        const pairs: Array<{ from: string; to: string }> = []
        const seen = new Set<string>()

        const addPair = (from?: unknown, to?: unknown) => {
          if (typeof from !== 'string') return
          if (typeof to !== 'string') return
          const f = from.trim()
          const t = to.trim()
          if (!f || !t || f === t) return
          const key = f < t ? `${f}|${t}` : `${t}|${f}`
          if (seen.has(key)) return
          seen.add(key)
          pairs.push({ from: f, to: t })
          pairs.push({ from: t, to: f })
        }

        const raw = Array.isArray(metadata.adjacencies) ? metadata.adjacencies : []
        if (raw.length > 0) {
          for (const a of raw as any[]) {
            if (!a || typeof a !== 'object') continue
            const from = (a.from || a.fromTerritoryId || a.territory_from || a.source) as
              | string
              | undefined
            const toVal = (a.to || a.toTerritoryId || a.territory_to || a.target) as
              | string
              | string[]
              | undefined
            if (Array.isArray(toVal)) {
              for (const t of toVal) addPair(from, t)
            } else {
              addPair(from, toVal)
            }
          }
          return pairs
        }

        // Fallback: build from per-territory connections if present
        for (const t of normTerritories as any[]) {
          const from = (t?.id || t?.name) as string | undefined
          if (!from || !Array.isArray(t?.connections)) continue
          for (const c of t.connections) addPair(from, c)
        }
        return pairs
      })()

      metadata.territories = normTerritories
      metadata.adjacencies = normAdjacencies

      if (opts.dryRun) {
        logger.info(`DRY RUN: would import "${data.name}" from ${folder}`)
        continue
      }

      if (opts.forceDraft) {
        const { default: mapWorkflowService } = (await import('../services/mapWorkflowService')) as typeof import('../services/mapWorkflowService')
        const draft = await mapWorkflowService.saveDraft(userId as string, {
          name: data.name,
          description: data.description || undefined,
          territories: metadata.territories,
          continents: metadata.continents,
          adjacencies: metadata.adjacencies,
          capitalAssignments: metadata.capitalAssignments,
          imageUrl,
          imageWidth,
          imageHeight,
          isPublic: false,
          tags: Array.isArray(data.tags) ? data.tags : [],
        })
        logger.info(`📝 Saved draft: ${data.name} (${draft.id})`)
        continue
      }

      try {
        const { mapService } = (await import('../services/mapService')) as typeof import('../services/mapService')
        const created = await mapService.createMap(userId as string, {
          name: data.name,
          description: data.description || undefined,
          imageUrl,
          imageWidth,
          imageHeight,
          isPublic: false,
          tags: Array.isArray(data.tags) ? data.tags : [],
          minPlayers: typeof data.minPlayers === 'number' ? data.minPlayers : 2,
          maxPlayers: typeof data.maxPlayers === 'number' ? data.maxPlayers : 6,
          metadata,
        })

        logger.info(`✅ Imported map: ${created.name} (${created.id})`)

        // Post-insert row counts (authoritative from DB)
        try {
          const { query } = (await import('../config/database')) as typeof import('../config/database')
          const t = await query<{ c: string }>('SELECT COUNT(*) AS c FROM map_territories WHERE map_id = $1', [created.id])
          const c = await query<{ c: string }>('SELECT COUNT(*) AS c FROM map_continents WHERE map_id = $1', [created.id])
          const a = await query<{ c: string }>('SELECT COUNT(*) AS c FROM territory_adjacencies WHERE map_id = $1', [created.id])
          logger.info('📊 Inserted rows', {
            mapId: created.id,
            territories: parseInt(t.rows[0]?.c || '0', 10),
            continents: parseInt(c.rows[0]?.c || '0', 10),
            adjacencies: parseInt(a.rows[0]?.c || '0', 10),
          })
        } catch (countErr) {
          logger.warn('Could not fetch row counts after import', { error: countErr })
        }

        if (opts.approve) {
          try {
            const adminId = await resolveAdminUserId()
            const { default: mapWorkflowService } = (await import('../services/mapWorkflowService')) as typeof import('../services/mapWorkflowService')
            await mapWorkflowService.approveMap(created.id, adminId, {
              notes: 'Auto-approved by import script',
            })
            logger.info(`🔓 Approved map: ${created.name} (${created.id})`)
          } catch (approveErr) {
            logger.warn('Failed to auto-approve map (skipping)', { mapId: created.id, error: approveErr })
          }
        }
      } catch (createErr) {
        if (opts.draftOnFail) {
          const { default: mapWorkflowService } = (await import('../services/mapWorkflowService')) as typeof import('../services/mapWorkflowService')
          const draft = await mapWorkflowService.saveDraft(userId as string, {
            name: data.name,
            description: data.description || undefined,
            territories: metadata.territories,
            continents: metadata.continents,
            adjacencies: metadata.adjacencies,
            capitalAssignments: metadata.capitalAssignments,
            imageUrl,
            imageWidth,
            imageHeight,
            isPublic: false,
            tags: Array.isArray(data.tags) ? data.tags : [],
          })
          logger.info(`📝 Saved draft: ${data.name} (${draft.id})`)
        } else {
          throw createErr
        }
      }
    } catch (err) {
      logger.error(`❌ Failed to process ${jsonPath}`, { error: err })
    }
  }

  // After processing the package, normalize any lingering image URLs to the public CDN base
  try {
    const endpoint = process.env.ASSET_ENDPOINT?.replace(/\/$/, '')
    const bucket = process.env.ASSET_BUCKET?.replace(/\/$/, '')
    const publicBase = process.env.PUBLIC_ASSET_BASE_URL?.replace(/\/$/, '')

    if (endpoint && bucket && publicBase) {
      const oldPrefix = `${endpoint}/${bucket}`
      const like = `${oldPrefix}/%`
      const { query } = (await import('../config/database')) as typeof import('../config/database')

      // Update maps table
      const mapsToUpdate = await query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM maps WHERE image_url LIKE $1`,
        [like],
      )
      const mapsCount = parseInt(mapsToUpdate.rows[0]?.total || '0', 10)
      if (mapsCount > 0) {
        logger.info(`Post-import: updating ${mapsCount} map image URL(s) to ${publicBase}`)
        await query(
          `UPDATE maps SET image_url = REPLACE(image_url, $1, $2) WHERE image_url LIKE $3`,
          [oldPrefix, publicBase, like],
        )
      }

      // Update drafts table
      const draftsToUpdate = await query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM map_drafts WHERE image_url LIKE $1`,
        [like],
      )
      const draftsCount = parseInt(draftsToUpdate.rows[0]?.total || '0', 10)
      if (draftsCount > 0) {
        logger.info(`Post-import: updating ${draftsCount} draft image URL(s) to ${publicBase}`)
        await query(
          `UPDATE map_drafts SET image_url = REPLACE(image_url, $1, $2) WHERE image_url LIKE $3`,
          [oldPrefix, publicBase, like],
        )
      }
    } else {
      logger.info(
        'Post-import URL normalization skipped: ensure ASSET_ENDPOINT, ASSET_BUCKET, and PUBLIC_ASSET_BASE_URL are set to auto-rewrite raw R2 URLs to CDN',
      )
    }
  } catch (normErr) {
    logger.warn('Post-import image URL normalization failed (non-critical):', normErr)
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Import job failed', err)
    process.exit(1)
  })
