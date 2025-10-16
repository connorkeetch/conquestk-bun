#!/usr/bin/env node
import path from 'node:path'
import dotenv from 'dotenv'

// Load backend/.env
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

// Import compiled ESM helpers (ensure you ran `npm run build` first)
const { query } = await import('../dist-esm/config/database.js')
const { assetExists, extractStorageKeyFromUrl, getPublicAssetUrl } = await import(
  '../dist-esm/utils/assetStorage.js'
)

function parseArgs() {
  const args = process.argv.slice(2)
  const out = { like: undefined, mapId: undefined, limit: 5 }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--like' && args[i + 1]) out.like = args[++i]
    else if (a === '--map-id' && args[i + 1]) out.mapId = args[++i]
    else if (a === '--limit' && args[i + 1]) out.limit = parseInt(args[++i] || '5', 10)
  }
  return out
}

const { like, mapId, limit } = parseArgs()

const conditions = ['image_url IS NOT NULL']
const params = []
if (mapId) {
  conditions.push('id = $' + (params.length + 1))
  params.push(mapId)
}
if (like) {
  const p = '%' + like.toLowerCase() + '%'
  // Match either name or image_url to allow searching subdirectory like 'world-classic'
  conditions.push('(LOWER(name) LIKE $' + (params.length + 1) + ' OR image_url LIKE $' + (params.length + 2) + ')')
  params.push(p, p)
}

const sql = `SELECT id, name, image_url AS imageUrl, image_width AS width, image_height AS height
             FROM maps WHERE ${conditions.join(' AND ')}
             ORDER BY created_at DESC LIMIT ${limit}`

const res = await query(sql, params)
if (!res.rows.length) {
  console.log('No maps matched.')
  process.exit(0)
}

for (const row of res.rows) {
  const key = extractStorageKeyFromUrl(row.imageurl || row.imageUrl || '')
  const width = Number(row.width || 0)
  const height = Number(row.height || 0)
  console.log(`\nMap: ${row.name} (${row.id})`)
  console.log('intrinsic:', width, 'x', height)
  console.log('image_url:', row.imageurl || row.imageUrl)
  console.log('storageKey:', key)
  if (!key) continue
  const base = key.replace(/\.[^.]+$/, '')
  const candidates = [
    `${base}.avif`,
    `${base}.webp`,
    `${base}-1024w.avif`,
    `${base}-1024w.webp`,
    `${base}-1536w.avif`,
    `${base}-1536w.webp`,
    `${base}-2048w.avif`,
    `${base}-2048w.webp`,
  ]
  for (const k of candidates) {
    let ok = false
    try {
      ok = await assetExists(k)
    } catch {
      ok = false
    }
    console.log(`${k}  ${ok ? '✓' : '✗'}  ${ok ? getPublicAssetUrl(k) : ''}`)
  }
}
