import React from 'react'

export interface SkillTier {
  name: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Master' | 'Grandmaster'
  minRating: number
  maxRating: number
  icon: string
  color: string
}

interface SkillTierBadgeProps {
  rating: number
  tier?: string
  showRating?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SKILL_TIERS: SkillTier[] = [
  { name: 'Bronze', minRating: 0, maxRating: 799, icon: '🥉', color: 'text-orange-600' },
  { name: 'Silver', minRating: 800, maxRating: 999, icon: '🥈', color: 'text-gray-400' },
  { name: 'Gold', minRating: 1000, maxRating: 1199, icon: '🥇', color: 'text-yellow-500' },
  { name: 'Platinum', minRating: 1200, maxRating: 1399, icon: '💎', color: 'text-cyan-400' },
  { name: 'Master', minRating: 1400, maxRating: 1599, icon: '👑', color: 'text-purple-500' },
  { name: 'Grandmaster', minRating: 1600, maxRating: 9999, icon: '⚔️', color: 'text-red-600' },
]

const SkillTierBadge: React.FC<SkillTierBadgeProps> = ({ 
  rating, 
  tier, 
  showRating = true, 
  size = 'md',
  className = '' 
}) => {
  // Get tier based on rating
  const skillTier = SKILL_TIERS.find(t => 
    rating >= t.minRating && rating <= t.maxRating
  ) || SKILL_TIERS[2] // Default to Gold

  const currentTier = tier || skillTier.name

  const sizeClasses = {
    sm: 'text-sm px-2 py-1',
    md: 'text-base px-3 py-1.5',
    lg: 'text-lg px-4 py-2'
  }

  const iconSizes = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl'
  }

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full bg-gray-800 border border-gray-700 ${sizeClasses[size]} ${className}`}>
      <span className={`${iconSizes[size]} ${skillTier.color}`}>
        {skillTier.icon}
      </span>
      <div className="flex flex-col">
        <span className={`font-semibold ${skillTier.color}`}>
          {currentTier}
        </span>
        {showRating && (
          <span className="text-xs text-gray-400">
            {rating} CP
          </span>
        )}
      </div>
    </div>
  )
}

export default SkillTierBadge