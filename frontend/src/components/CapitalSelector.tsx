import type React from 'react'
import { useCallback, useEffect, useState } from 'react'

interface Territory {
  id: number
  name: string
  x: number
  y: number
  adjacencies: number[]
}

interface CapitalSelectorProps {
  territories: Territory[]
  playerCount: number
  onCapitalsSelected: (capitals: number[]) => void
  existingCapitals?: number[]
}

const CapitalSelector: React.FC<CapitalSelectorProps> = ({
  territories,
  playerCount,
  onCapitalsSelected,
  existingCapitals = [],
}) => {
  const [selectedCapitals, setSelectedCapitals] = useState<number[]>(existingCapitals)
  const [validationError, setValidationError] = useState<string>('')

  const validateCapitals = useCallback(
    (capitals: number[]) => {
      if (capitals.length !== playerCount) {
        setValidationError(`Select exactly ${playerCount} capitals (currently ${capitals.length})`)
        return false
      }

      // Check if capitals are too close (adjacent)
      for (let i = 0; i < capitals.length; i++) {
        for (let j = i + 1; j < capitals.length; j++) {
          const territory1 = territories.find((t) => t.id === capitals[i])
          const territory2 = territories.find((t) => t.id === capitals[j])

          if (territory1 && territory2) {
            if (territory1.adjacencies.includes(capitals[j])) {
              setValidationError(
                `Capitals ${territory1.name} and ${territory2.name} are too close (adjacent)`,
              )
              return false
            }
          }
        }
      }

      setValidationError('')
      return true
    },
    [playerCount, territories],
  )

  useEffect(() => {
    validateCapitals(selectedCapitals)
  }, [selectedCapitals, validateCapitals])

  const toggleCapital = (territoryId: number) => {
    if (selectedCapitals.includes(territoryId)) {
      setSelectedCapitals((prev) => prev.filter((id) => id !== territoryId))
    } else if (selectedCapitals.length < playerCount) {
      setSelectedCapitals((prev) => [...prev, territoryId])
    }
  }

  const getDistanceColor = (territoryId: number): string => {
    if (selectedCapitals.includes(territoryId)) return 'bg-yellow-500'

    // Check if this territory is adjacent to any capital
    const territory = territories.find((t) => t.id === territoryId)
    if (territory) {
      for (const capitalId of selectedCapitals) {
        if (territory.adjacencies.includes(capitalId)) {
          return 'bg-red-500 opacity-50' // Too close
        }
      }
    }

    return 'bg-gray-600 hover:bg-gray-500'
  }

  const handleConfirm = () => {
    if (validateCapitals(selectedCapitals)) {
      onCapitalsSelected(selectedCapitals)
    }
  }

  return (
    <div className="bg-surface-1 rounded-lg p-6">
      <h3 className="text-xl font-bold text-white mb-4">
        Select {playerCount} Capital Territories
      </h3>

      <div className="mb-4">
        <p className="text-muted text-sm">👑 Capitals must be at least 2 territories apart</p>
        <p className="text-muted text-sm">⚔️ Capturing a capital eliminates the player instantly</p>
      </div>

      {validationError && (
        <div className="bg-red-500/20 border border-red-500 text-red-300 p-3 rounded mb-4">
          {validationError}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 max-h-96 overflow-y-auto mb-4">
        {territories.map((territory) => (
          <button
            key={territory.id}
            type="button"
            onClick={() => toggleCapital(territory.id)}
            className={`p-2 rounded text-white text-sm transition-colors ${getDistanceColor(territory.id)}`}
            disabled={
              !selectedCapitals.includes(territory.id) && selectedCapitals.length >= playerCount
            }
          >
            {selectedCapitals.includes(territory.id) && '👑 '}
            {territory.name}
          </button>
        ))}
      </div>

      <div className="flex justify-between items-center">
        <div className="text-muted">
          Selected: {selectedCapitals.length} / {playerCount}
        </div>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={selectedCapitals.length !== playerCount || !!validationError}
          className="px-6 py-2 bg-primary hover:bg-primary disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          Confirm Capitals
        </button>
      </div>
    </div>
  )
}

export default CapitalSelector
