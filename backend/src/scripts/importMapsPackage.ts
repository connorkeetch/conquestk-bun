import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
// Ensure environment is loaded before importing modules that read env at module scope
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
  }
  return opts
}

const ensurePath = (p: string): string => (path.isAbsolute(p) ? p : path.resolve(process.cwd(), p))

const listDirectoriesWithMapJson = (root: string): string[] => {
  const out: string[] = []
  const scan = (dir: string, depth: number) => {
    if (depth > 2) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
      if (!e.isDirectory()) continue
      const folder = path.join(dir, e.name)
      const jsonPath = path.join(folder, 'map.json')
      if (fs.existsSync(jsonPath)) {
        out.push(folder)
      } else {
        scan(folder, depth + 1)
      }
    }
  }
  scan(root, 0)
  return out
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
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'map'

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
  // Common fallbacks
  const names = ['background.png', 'background.jpg', 'background.jpeg', 'background.webp']
  for (const n of names) {
    const candidate = path.join(folder, n)
    if (fs.existsSync(candidate)) {
      return { filePath: candidate, mimeType: extToMime(path.extname(candidate)) }
    }
  }
  // Any image in folder
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
  // Prefer an admin user
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

async function extractZip(zipPath: string): Promise<string> {
  // Extract using adm-zip if available; otherwise, instruct manual extraction
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AdmZip = require('adm-zip') as any
    const tempDir = path.join(os.tmpdir(), `maps-import-${randomUUID()}`)
    fs.mkdirSync(tempDir, { recursive: true })
    const zip = new AdmZip(zipPath)
    zip.extractAllTo(tempDir, true)
    return tempDir
  } catch (err) {
    logger.error(
      'Failed to load adm-zip to extract the package. Install it or extract manually and use --dir.',
      err,
    )
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
    if (!fs.existsSync(zipAbs)) {
      throw new Error(`Zip not found: ${zipAbs}`)
    }
    workingRoot = await extractZip(zipAbs)
  } else {
    // Default to repo root maps-package.zip if present
    const defaultZip = path.resolve(process.cwd(), '../../maps-package.zip')
    if (fs.existsSync(defaultZip)) {
      workingRoot = await extractZip(defaultZip)
    } else {
      throw new Error('Provide --zip <file> or --dir <folder>')
    }
  }

  const folders = listDirectoriesWithMapJson(workingRoot)
  if (folders.length === 0) {
    logger.warn('No map folders with map.json found in the package')
    return
  }

  const results: Array<{ name: string; id?: string; ok: boolean; error?: string }> = []

  for (const folder of folders) {
    const jsonPath = path.join(folder, 'map.json')
    try {
      const raw = fs.readFileSync(jsonPath, 'utf8')
      const data = JSON.parse(raw) as MapPackageJson
      if (!data.name || typeof data.name !== 'string') {
        throw new Error('map.json missing required field: name')
      }

      // Handle image upload
      let imageUrl: string | undefined
      let imageWidth: number | undefined
      let imageHeight: number | undefined
      const subdir = `imports/${slug(data.name)}`

      if (data.image && typeof data.image.data === 'string') {
        // Support data URLs or raw base64
        const match = data.image.data.match(/^data:[^;]+;base64,(.*)$/)
        const base64 = match ? match[1] : data.image.data
        const info = await storeBase64Image(base64, {
          mimeType: data.image.mimeType || 'image/png',
          preferredFilename: data.imageFilename || 'background.png',
          subdirectory: subdir,
        })
        imageUrl = info.relativeUrl
        imageWidth = info.width
        imageHeight = info.height
      } else {
        const found = findImageFile(folder, data.imageFilename)
        if (!found) {
          throw new Error(
            `No image found. Provide imageFilename in map.json or include background.(png|jpg|webp) in ${folder}`,
          )
        }
        const buffer = fs.readFileSync(found.filePath)
        const info = await storeImageBuffer(buffer, {
          mimeType: found.mimeType,
          preferredFilename: path.basename(found.filePath),
          subdirectory: subdir,
        })
        imageUrl = info.relativeUrl
        imageWidth = info.width
        imageHeight = info.height
      }

      // Build metadata payload (round-trip through editor)
      const metadata = {
        territories: Array.isArray(data.territories) ? data.territories : [],
        continents: Array.isArray(data.continents) ? data.continents : [],
        adjacencies: Array.isArray(data.adjacencies) ? data.adjacencies : [],
        capitalAssignments: data.capitalAssignments || {},
        territoryModifiers:
          (data.territoryModifiers as Record<string, TerritoryModifierMetadata> | undefined) ||
          undefined,
        width: typeof data.width === 'number' ? data.width : imageWidth,
        height: typeof data.height === 'number' ? data.height : imageHeight,
      }

      if (opts.dryRun) {
        logger.info(`DRY RUN: would import map "${data.name}" from ${folder}`)
        results.push({ name: data.name, ok: true })
        continue
      }
      if (opts.forceDraft) {
        const { default: mapWorkflowService } = (await import(
          '../services/mapWorkflowService'
        )) as typeof import('../services/mapWorkflowService')
        const draft = await mapWorkflowService.saveDraft(userId as string, {
          name: data.name,
          description: data.description || undefined,
          territories: Array.isArray(data.territories) ? data.territories : [],
          continents: Array.isArray(data.continents) ? data.continents : [],
          adjacencies: Array.isArray(data.adjacencies) ? data.adjacencies : [],
          capitalAssignments: data.capitalAssignments || {},
          imageUrl,
          imageWidth,
          imageHeight,
          isPublic: false,
          tags: Array.isArray(data.tags) ? data.tags : [],
        })
        logger.info(`📝 Saved draft: ${data.name} (${draft.id})`)
        results.push({ name: data.name, ok: true, id: draft.id })
        continue
      }

      try {
        const { mapService } = (await import(
          '../services/mapService'
        )) as typeof import('../services/mapService')
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

        if (opts.approve) {
          try {
            const adminId = await resolveAdminUserId()
            const { default: mapWorkflowService } = (await import(
              '../services/mapWorkflowService'
            )) as typeof import('../services/mapWorkflowService')
            await mapWorkflowService.approveMap(created.id, adminId, {
              notes: 'Auto-approved by import script',
            })
            logger.info(`🔓 Approved map: ${created.name} (${created.id})`)
          } catch (approveErr) {
            logger.warn('Failed to auto-approve map (skipping)', {
              mapId: created.id,
              error: approveErr,
            })
          }
        }
        results.push({ name: data.name, ok: true, id: created.id })
      } catch (createErr) {
        if (opts.draftOnFail) {
          const message = createErr instanceof Error ? createErr.message : String(createErr)
          logger.warn(`Create failed; saving as draft: ${data.name} — ${message}`)
          const { default: mapWorkflowService } = (await import(
            '../services/mapWorkflowService'
          )) as typeof import('../services/mapWorkflowService')
          const draft = await mapWorkflowService.saveDraft(userId as string, {
            name: data.name,
            description: data.description || undefined,
            territories: Array.isArray(data.territories) ? data.territories : [],
            continents: Array.isArray(data.continents) ? data.continents : [],
            adjacencies: Array.isArray(data.adjacencies) ? data.adjacencies : [],
            capitalAssignments: data.capitalAssignments || {},
            imageUrl,
            imageWidth,
            imageHeight,
            isPublic: false,
            tags: Array.isArray(data.tags) ? data.tags : [],
          })
          logger.info(`📝 Saved draft: ${data.name} (${draft.id})`)
          results.push({ name: data.name, ok: true, id: draft.id })
        } else {
          throw createErr
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(`❌ Failed to import ${jsonPath}: ${message}`)
      results.push({ name: path.basename(folder), ok: false, error: message })
    }
  }

  const okCount = results.filter((r) => r.ok).length
  const failCount = results.length - okCount
  logger.info(`Import complete: ${okCount} succeeded, ${failCount} failed`)
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Import job failed', err)
    process.exit(1)
  })
