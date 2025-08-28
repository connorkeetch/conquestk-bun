import type React from 'react'
import type { SkillTier } from './SkillTierBadge'

interface SkillProgressBarProps {
  currentRating: number
  className?: string
}

const SKILL_TIERS: SkillTier[] = [
  { name: 'Bronze', minRating: 0, maxRating: 799, icon: '🥉', color: 'bg-orange-600' },
  { name: 'Silver', minRating: 800, maxRating: 999, icon: '🥈', color: 'bg-gray-400' },
  { name: 'Gold', minRating: 1000, maxRating: 1199, icon: '🥇', color: 'bg-yellow-500' },
  { name: 'Platinum', minRating: 1200, maxRating: 1399, icon: '💎', color: 'bg-cyan-400' },
  { name: 'Master', minRating: 1400, maxRating: 1599, icon: '👑', color: 'bg-purple-500' },
  { name: 'Grandmaster', minRating: 1600, maxRating: 9999, icon: '⚔️', color: 'bg-red-600' },
]

const SkillProgressBar: React.FC<SkillProgressBarProps> = ({ currentRating, className = '' }) => {
  // Find current tier
  const currentTier =
    SKILL_TIERS.find((t) => currentRating >= t.minRating && currentRating <= t.maxRating) ||
    SKILL_TIERS[2] // Default to Gold

  // Find next tier
  const currentTierIndex = SKILL_TIERS.findIndex((t) => t.name === currentTier.name)
  const nextTier = SKILL_TIERS[currentTierIndex + 1]

  // Calculate progress
  let progress = 0
  let pointsToNext = 0
  let pointsInCurrentTier = 0

  if (nextTier && currentTier.name !== 'Grandmaster') {
    pointsInCurrentTier = currentRating - currentTier.minRating
    const tierRange = nextTier.minRating - currentTier.minRating
    progress = (pointsInCurrentTier / tierRange) * 100
    pointsToNext = nextTier.minRating - currentRating
  } else if (currentTier.name === 'Grandmaster') {
    // For Grandmaster, show progress above 1600
    progress = Math.min(100, ((currentRating - 1600) / 400) * 100)
    pointsToNext = 0
  }

  return (
    <div className={`w-full ${className}`}>
      {/* Tier Labels */}
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{currentTier.icon}</span>
          <div>
            <p className="text-sm font-semibold text-gray-200">{currentTier.name}</p>
            <p className="text-xs text-gray-400">{currentRating} CP</p>
          </div>
        </div>
        {nextTier && (
          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-200">{nextTier.name}</p>
              <p className="text-xs text-gray-400">{pointsToNext} to go</p>
            </div>
            <span className="text-2xl opacity-50">{nextTier.icon}</span>
          </div>
        )}
        {!nextTier && currentTier.name === 'Grandmaster' && (
          <div className="text-right">
            <p className="text-sm font-semibold text-red-600">Peak Rank</p>
            <p className="text-xs text-gray-400">Top Tier</p>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="relative">
        <div className="w-full h-6 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
          <div
            className={`h-full transition-all duration-500 ease-out ${currentTier.color} bg-opacity-80`}
            style={{ width: `${progress}%` }}
          >
            <div className="h-full bg-gradient-to-r from-transparent to-white opacity-20"></div>
          </div>
        </div>

        {/* Progress Text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold text-white drop-shadow-lg">
            {Math.round(progress)}%
          </span>
        </div>
      </div>

      {/* Milestone Markers */}
      {nextTier && (
        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>{currentTier.minRating} CP</span>
          <span className="text-gray-400">
            {currentTier.minRating + Math.floor((nextTier.minRating - currentTier.minRating) / 2)}{' '}
            CP
          </span>
          <span>{nextTier.minRating} CP</span>
        </div>
      )}
    </div>
  )
}

export default SkillProgressBar
