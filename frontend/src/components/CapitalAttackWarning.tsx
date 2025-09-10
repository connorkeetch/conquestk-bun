import type React from 'react'

interface CapitalAttackWarningProps {
  defenderName: string
  territoryName: string
  onConfirm: () => void
  onCancel: () => void
}

const CapitalAttackWarning: React.FC<CapitalAttackWarningProps> = ({
  defenderName,
  territoryName,
  onConfirm,
  onCancel,
}) => {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fadeIn">
      <div className="bg-surface-1 border-2 border-red-500 rounded-xl p-8 max-w-md mx-4 shadow-2xl animate-scaleIn">
        <div className="text-center mb-6">
          <div className="text-6xl mb-4 animate-pulse">⚠️</div>
          <h2 className="text-2xl font-bold text-red-400 mb-2">CAPITAL ATTACK WARNING</h2>
          <div className="w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent"></div>
        </div>

        <div className="space-y-4 text-center">
          <p className="text-white text-lg">
            You are attacking <span className="font-bold text-yellow-400">{defenderName}'s</span>{' '}
            capital at
          </p>
          <p className="text-2xl font-bold text-red-400">👑 {territoryName}</p>

          <div className="bg-danger-soft border border-red-700 rounded-lg p-4 my-6">
            <p className="text-red-300 font-semibold text-lg mb-2">⚔️ INSTANT ELIMINATION</p>
            <p className="text-muted">
              If you capture this capital, {defenderName} will be{' '}
              <span className="text-red-400 font-bold">immediately eliminated</span> from the game!
            </p>
            <p className="text-muted mt-2">
              You will gain <span className="text-green-400 font-bold">ALL</span> their territories
              and troops.
            </p>
          </div>
        </div>

        <div className="flex gap-4 mt-8">
          <button
            onClick={onCancel}
            className="flex-1 px-6 py-3 bg-surface-2 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
          >
            Cancel Attack
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold rounded-lg transition-all transform hover:scale-105 shadow-lg"
          >
            ⚔️ Attack Capital
          </button>
        </div>
      </div>
    </div>
  )
}

export default CapitalAttackWarning
