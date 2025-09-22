import type React from 'react'
import type { SkillTier } from './SkillTierBadge'

interface SkillProgressBarProps {
  currentRating: number
  className?: string
}

const SKILL_TIERS: SkillTier[] = [
  { name: 'Chieftain', minRating: 0, maxRating: 599, icon: '🛡️', color: 'bg-amber-700' },
  { name: 'Warlord', minRating: 600, maxRating: 799, icon: '⚔️', color: 'bg-red-600' },
  { name: 'Raider King', minRating: 800, maxRating: 999, icon: '⚓', color: 'bg-blue-500' },
  { name: 'Sultan', minRating: 1000, maxRating: 1199, icon: '☪️', color: 'bg-green-600' },
  { name: 'Caesar', minRating: 1200, maxRating: 1399, icon: '🦅', color: 'bg-yellow-500' },
  { name: 'Khan', minRating: 1400, maxRating: 1599, icon: '🏹', color: 'bg-orange-500' },
  { name: 'Emperor', minRating: 1600, maxRating: 1799, icon: '👑', color: 'bg-purple-500' },
  { name: 'The Great King', minRating: 1800, maxRating: 1999, icon: '☀️', color: 'bg-orange-400' },
  { name: 'Overlord', minRating: 2000, maxRating: 2199, icon: '💀', color: 'bg-gray-600' },
  { name: 'Worldbreaker', minRating: 2200, maxRating: 9999, icon: '☄️', color: 'bg-red-800' },
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

  if (nextTier && currentTier.name !== 'Worldbreaker') {
    pointsInCurrentTier = currentRating - currentTier.minRating
    const tierRange = nextTier.minRating - currentTier.minRating
    progress = (pointsInCurrentTier / tierRange) * 100
    pointsToNext = nextTier.minRating - currentRating
  } else if (currentTier.name === 'Worldbreaker') {
    // For the top tier, show progress beyond threshold
    progress = Math.min(100, ((currentRating - currentTier.minRating) / 400) * 100)
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
            <p className="text-xs text-muted">{currentRating} CP</p>
          </div>
        </div>
        {nextTier && (
          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-200">{nextTier.name}</p>
              <p className="text-xs text-muted">{pointsToNext} to go</p>
            </div>
            <span className="text-2xl opacity-50">{nextTier.icon}</span>
          </div>
        )}
        {!nextTier && currentTier.name === 'Worldbreaker' && (
          <div className="text-right">
            <p className="text-sm font-semibold text-red-600">Peak Rank</p>
            <p className="text-xs text-muted">Top Tier</p>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="relative">
        <div className="w-full h-6 bg-surface-1 rounded-full overflow-hidden border border-border">
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
        <div className="flex justify-between mt-2 text-xs text-muted">
          <span>{currentTier.minRating} CP</span>
          <span className="text-muted">
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
