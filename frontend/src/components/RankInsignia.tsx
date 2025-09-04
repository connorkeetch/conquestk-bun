import type React from 'react'

export interface ConquestRank {
  name: string
  minRating: number
  color: string
  insignia: string
}

export const CONQUEST_RANKS: ConquestRank[] = [
  { name: 'Recruit', minRating: 0, color: '#8B5A3C', insignia: '⚫' },
  { name: 'Soldier', minRating: 1000, color: '#C0C0C0', insignia: '🔘' },
  { name: 'Commander', minRating: 1300, color: '#FFD700', insignia: '🟡' },
  { name: 'General', minRating: 1600, color: '#E5E4E2', insignia: '⚪' },
  { name: 'Marshal', minRating: 1900, color: '#B9F2FF', insignia: '🔵' },
  { name: 'Conqueror', minRating: 2200, color: '#FF69B4', insignia: '🔴' },
]

export function getConquestRank(skillRating: number): ConquestRank {
  for (let i = CONQUEST_RANKS.length - 1; i >= 0; i--) {
    if (skillRating >= CONQUEST_RANKS[i].minRating) {
      return CONQUEST_RANKS[i]
    }
  }
  return CONQUEST_RANKS[0] // Default to Recruit
}

interface RankInsigniaProps {
  rating: number
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showLabel?: boolean
  showRating?: boolean
  className?: string
}

const sizeClasses = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl'
}

const labelSizeClasses = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
  xl: 'text-lg'
}

const RankInsignia: React.FC<RankInsigniaProps> = ({
  rating,
  size = 'md',
  showLabel = true,
  showRating = false,
  className = ''
}) => {
  const rank = getConquestRank(rating)

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Insignia */}
      <span
        className={`${sizeClasses[size]} inline-block`}
        style={{ color: rank.color }}
        title={`${rank.name} (${rating} ELO)`}
      >
        {rank.insignia}
      </span>
      
      {/* Rank Name */}
      {showLabel && (
        <span
          className={`font-semibold ${labelSizeClasses[size]}`}
          style={{ color: rank.color }}
        >
          {rank.name}
        </span>
      )}
      
      {/* Rating */}
      {showRating && (
        <span className={`text-gray-400 ${labelSizeClasses[size]}`}>
          ({rating})
        </span>
      )}
    </div>
  )
}

export default RankInsignia