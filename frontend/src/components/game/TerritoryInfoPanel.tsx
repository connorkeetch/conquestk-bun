import type React from 'react'

interface Territory {
  id: string
  name: string
  continent: string
  owner?: string
  armies?: number
  adjacentTerritories: string[]
}

interface Player {
  id: string
  username: string
  color: string
}

interface TerritoryInfoPanelProps {
  hoveredTerritory: string | null
  selectedTerritory: string | null
  territories: { [key: string]: Territory }
  players: Player[]
  territoryModifiers?: any
}

export const TerritoryInfoPanel: React.FC<TerritoryInfoPanelProps> = ({
  hoveredTerritory,
  selectedTerritory,
  territories,
  players,
  territoryModifiers,
}) => {
  const territoryId = hoveredTerritory || selectedTerritory

  if (!territoryId) {
    return null
  }

  const territory = territories[territoryId]
  if (!territory) {
    return null
  }

  const owner = players.find((p) => p.id === territory.owner)
  const modifier = territoryModifiers?.[territoryId]

  return (
    <div className="p-4 border-b border-gray-200">
      <h3 className="text-lg font-semibold mb-2">Territory Info</h3>
      <div className="space-y-1 text-sm">
        <div>
          <span className="font-medium">Name:</span> {territory.name}
        </div>
        <div>
          <span className="font-medium">Continent:</span> {territory.continent}
        </div>
        <div>
          <span className="font-medium">Owner:</span>{' '}
          {owner ? (
            <span style={{ color: owner.color }}>{owner.username}</span>
          ) : (
            <span className="text-muted">Neutral</span>
          )}
        </div>
        <div>
          <span className="font-medium">Armies:</span> {territory.armies || 0}
        </div>
        {modifier && (
          <div>
            <span className="font-medium">Modifier:</span>{' '}
            <span className="text-purple-600">{modifier.type}</span>
          </div>
        )}
        <div>
          <span className="font-medium">Adjacent ({territory.adjacentTerritories.length}):</span>
          <div className="text-xs text-gray-600 mt-1">
            {territory.adjacentTerritories
              .slice(0, 5)
              .map((adjId) => territories[adjId]?.name || adjId)
              .join(', ')}
            {territory.adjacentTerritories.length > 5 && '...'}
          </div>
        </div>
      </div>
    </div>
  )
}
