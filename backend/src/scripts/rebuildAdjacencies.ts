import path from 'node:path'
import dotenv from 'dotenv'
import { logger } from '../utils/logger.js'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

type Json = unknown

type MapRow = {
  id: string
  name: string
  metadata: Json | string | null
}

type MetadataTerritory = { id?: string; name?: string; connections?: string[] }
type MetadataAdjacency = {
  from?: string
  to?: string
  fromTerritoryId?: string
  toTerritoryId?: string
  territory_from?: string
  territory_to?: string
  source?: string
  target?: string
}

type Metadata = {
  territories?: MetadataTerritory[]
  adjacencies?: MetadataAdjacency[]
}

const pick = (...candidates: Array<string | undefined>): string | undefined => {
  for (const c of candidates) if (c?.trim()) return c.trim()
  return undefined
}

async function run() {
  const mapId = process.argv[2]
  if (!mapId) {
    logger.error('Usage: ts-node src/scripts/rebuildAdjacencies.ts <mapId>')
    process.exit(1)
  }

  // Load map + metadata
  const { query } = (await import(
    '../config/database.js'
  )) as typeof import('../config/database.js')
  const result = await query<MapRow>('SELECT id, name, metadata FROM maps WHERE id = $1', [mapId])
  const row = result.rows[0]
  if (!row) {
    logger.error('Map not found', { mapId })
    process.exit(1)
  }

  const metadata = ((): Metadata => {
    const raw = row.metadata
    if (!raw) return {}
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as Metadata
      } catch {
        return {}
      }
    }
    return raw as Metadata
  })()

  const territories = Array.isArray(metadata.territories) ? metadata.territories : []
  const adjacencies = Array.isArray(metadata.adjacencies) ? metadata.adjacencies : []

  if (territories.length === 0) {
    logger.error('No territories in metadata; cannot rebuild adjacencies')
    process.exit(1)
  }

  // Build id/name → canonical name map (the stored name in DB)
  const idToName = new Map<string, string>()
  for (const t of territories) {
    const nameUsed = pick(t.name, t.id) || 'Territory'
    if (t.id) idToName.set(t.id.trim(), nameUsed)
    if (t.name) idToName.set(t.name.trim(), nameUsed)
  }

  const normalize = (key?: string): string | undefined => {
    if (!key) return undefined
    const trimmed = key.trim()
    return idToName.get(trimmed) || trimmed
  }

  const pairs: Array<{ from: string; to: string }> = []
  const seen = new Set<string>()

  const addPair = (from?: string, to?: string) => {
    const nf = normalize(from)
    const nt = normalize(to)
    if (!nf || !nt || nf === nt) return
    const key = nf < nt ? `${nf}|${nt}` : `${nt}|${nf}`
    if (seen.has(key)) return
    seen.add(key)
    pairs.push({ from: nf, to: nt })
    pairs.push({ from: nt, to: nf })
  }

  if (adjacencies.length > 0) {
    for (const a of adjacencies) {
      const from = pick(a.from, a.fromTerritoryId, a.territory_from, a.source)
      const to = pick(a.to, a.toTerritoryId, a.territory_to, a.target)
      addPair(from, to)
    }
  } else {
    for (const t of territories) {
      const from = pick(t.id, t.name)
      if (!from || !Array.isArray(t.connections)) continue
      for (const c of t.connections) addPair(from, c)
    }
  }

  logger.info(`Rebuilding adjacencies for ${row.name}: ${pairs.length} directed edges`)

  await query('DELETE FROM territory_adjacencies WHERE map_id = $1', [mapId])
  for (const { from, to } of pairs) {
    await query(
      `INSERT INTO territory_adjacencies (map_id, territory_from, territory_to)
       VALUES ($1,$2,$3)
       ON CONFLICT (map_id, territory_from, territory_to) DO NOTHING`,
      [mapId, from, to],
    )
  }

  logger.info('Adjacencies rebuilt successfully')
}

run().catch((err) => {
  logger.error('Failed to rebuild adjacencies', err)
  process.exit(1)
})
