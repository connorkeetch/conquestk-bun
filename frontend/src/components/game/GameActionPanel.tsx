import type React from 'react'

interface Territory {
  id: string
  name: string
}

interface GameActionPanelProps {
  selectedTerritory: string | null
  selectedTargetTerritory: string | null
  pendingAction: string | null
  validTargets: string[]
  territories: { [key: string]: Territory }
}

export const GameActionPanel: React.FC<GameActionPanelProps> = ({
  selectedTerritory,
  selectedTargetTerritory,
  pendingAction,
  validTargets,
  territories,
}) => {
  if (!selectedTerritory && !pendingAction) {
    return null
  }

  return (
    <div className="p-4 border-b border-gray-200 bg-blue-50">
      <h3 className="text-lg font-semibold mb-2">Current Action</h3>
      {selectedTerritory && (
        <div className="mb-2">
          <span className="text-sm font-medium">Selected: </span>
          <span className="text-sm">{territories[selectedTerritory]?.name}</span>
        </div>
      )}
      {selectedTargetTerritory && (
        <div className="mb-2">
          <span className="text-sm font-medium">Target: </span>
          <span className="text-sm">{territories[selectedTargetTerritory]?.name}</span>
        </div>
      )}
      {pendingAction && (
        <div className="mb-2">
          <span className="text-sm font-medium">Action: </span>
          <span className="text-sm capitalize bg-yellow-200 px-2 py-1 rounded">
            {pendingAction}
          </span>
        </div>
      )}
      {validTargets.length > 0 && (
        <div className="text-xs text-gray-600">{validTargets.length} valid target(s) available</div>
      )}
    </div>
  )
}
