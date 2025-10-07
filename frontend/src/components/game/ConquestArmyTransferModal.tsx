import { useEffect, useId, useState } from 'react'

interface ConquestArmyTransferModalProps {
  isOpen: boolean
  fromTerritoryName: string
  toTerritoryName: string
  availableArmies: number
  onConfirm: (armies: number) => void
  onCancel: () => void
}

export function ConquestArmyTransferModal({
  isOpen,
  fromTerritoryName,
  toTerritoryName,
  availableArmies,
  onConfirm,
  onCancel,
}: ConquestArmyTransferModalProps) {
  const [armies, setArmies] = useState(Math.min(availableArmies, 3))
  const sliderId = useId()

  // Update armies when availableArmies changes
  useEffect(() => {
    setArmies(Math.min(availableArmies, 3))
  }, [availableArmies])

  if (!isOpen) return null

  const handleConfirm = () => {
    const transferAmount = Math.max(1, Math.min(armies, availableArmies))
    onConfirm(transferAmount)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-surface-1 border border-border rounded-xl shadow-2xl max-w-md w-full m-4">
        <div className="p-6">
          {/* Header */}
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-white mb-2">Territory Conquered! 🎉</h2>
            <p className="text-muted text-sm">
              <span className="font-semibold text-green-400">{toTerritoryName}</span> is now under
              your control
            </p>
          </div>

          {/* Transfer Info */}
          <div className="bg-surface-2/50 rounded-lg p-4 mb-6">
            <p className="text-sm text-muted mb-4">
              How many armies do you want to move from{' '}
              <span className="font-semibold text-white">{fromTerritoryName}</span> to{' '}
              <span className="font-semibold text-white">{toTerritoryName}</span>?
            </p>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Available to transfer:</span>
                <span className="font-semibold text-white">{availableArmies}</span>
              </div>

              {/* Slider */}
              <div className="space-y-2">
                <label htmlFor={sliderId} className="text-xs font-medium text-muted">
                  Armies to transfer:
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id={sliderId}
                    type="range"
                    min={1}
                    max={availableArmies}
                    value={armies}
                    onChange={(e) => setArmies(Number.parseInt(e.target.value, 10))}
                    className="flex-1"
                  />
                  <div className="w-12 text-right">
                    <span className="text-lg font-bold text-white">{armies}</span>
                  </div>
                </div>
              </div>

              {/* Quick select buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setArmies(1)}
                  className="btn btn-ghost btn-xs flex-1"
                  disabled={availableArmies < 1}
                >
                  Min (1)
                </button>
                <button
                  type="button"
                  onClick={() => setArmies(Math.floor(availableArmies / 2))}
                  className="btn btn-ghost btn-xs flex-1"
                  disabled={availableArmies < 2}
                >
                  Half
                </button>
                <button
                  type="button"
                  onClick={() => setArmies(availableArmies)}
                  className="btn btn-ghost btn-xs flex-1"
                >
                  All
                </button>
              </div>
            </div>
          </div>

          {/* Info text */}
          <div className="bg-info-soft border border-blue-600/30 rounded-lg p-3 mb-4 text-xs text-blue-200">
            <p>
              You must move at least 1 army. The remaining armies will stay in{' '}
              <span className="font-semibold">{fromTerritoryName}</span>.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 btn btn-secondary"
              title="Cancel and keep default"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 btn btn-success"
              title={`Move ${armies} ${armies === 1 ? 'army' : 'armies'}`}
            >
              Confirm ({armies})
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
