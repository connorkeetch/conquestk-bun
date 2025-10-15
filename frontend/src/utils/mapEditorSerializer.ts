import type { Coordinate } from '@/services/mapService'
import type { PolygonMapDraftPayload } from '@/services/mapWorkflowClient'

// Minimal shape of the polygon editor state we need for serialization
export interface PolygonEditorTerritory {
  id: string
  name?: string
  boundaryCoords: Coordinate[]
  armyPosition: Coordinate
  continentId?: string | null
}

export interface PolygonEditorContinent {
  id: string
  name: string
  bonusArmies: number
  color?: string
}

export interface PolygonEditorAdjacency {
  from: string
  to: string
}

export interface PolygonEditorSnapshot {
  name?: string
  description?: string
  imageUrl?: string
  imageWidth: number
  imageHeight: number
  territories: PolygonEditorTerritory[]
  continents: PolygonEditorContinent[]
  adjacencies: PolygonEditorAdjacency[]
  isPublic?: boolean
  tags?: string[]
}

// Convert the in-memory polygon editor snapshot into a Map Draft payload
// for the workflow-based persistence API.
export function serializePolygonEditorStateToDraft(
  snapshot: PolygonEditorSnapshot,
): PolygonMapDraftPayload {
  // Build sectors (formerly continents) with territory membership
  const sectors = snapshot.continents.map((c) => ({
    id: c.id,
    name: c.name,
    bonusArmies: c.bonusArmies,
    color: c.color,
    territories: snapshot.territories.filter((t) => t.continentId === c.id).map((t) => t.id),
  }))

  // Pass through territories and adjacencies as-is; backend will validate
  const payload: PolygonMapDraftPayload = {
    name: snapshot.name,
    description: snapshot.description,
    data: {
      editor: 'polygon',
      imageUrl: snapshot.imageUrl,
      imageWidth: snapshot.imageWidth,
      imageHeight: snapshot.imageHeight,
    },
    imageUrl: snapshot.imageUrl,
    imageWidth: snapshot.imageWidth,
    imageHeight: snapshot.imageHeight,
    territories: snapshot.territories.map((t) => ({
      id: t.id,
      name: t.name,
      boundaryCoords: t.boundaryCoords,
      armyPosition: t.armyPosition,
      continentId: t.continentId ?? undefined,
    })),
    sectors,
    adjacencies: snapshot.adjacencies.map((a) => ({ from: a.from, to: a.to })),
    isPublic: snapshot.isPublic ?? false,
    tags: snapshot.tags ?? [],
  }

  return payload
}

// TODO(polygon-editor-migration): Wire MapEditor to use serializePolygonEditorStateToDraft
// and mapWorkflowClient.saveDraft()/publishDraft() so polygon maps flow through the
// workflow-based pipeline. See docs/planning/polygon-map-integration.md.
