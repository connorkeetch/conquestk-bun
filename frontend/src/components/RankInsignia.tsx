import type React from 'react'
import { RANK_COLORS } from '../constants/colors'

export interface ConquestRank {
  name: string
  minRating: number
  color: string
  insignia: string
}

// 🎯 NOW USING UNIFIED COLOR SYSTEM - All colors reference RANK_COLORS from colors.ts
export const CONQUEST_RANKS: ConquestRank[] = [
  { name: 'Chieftain', minRating: 0, color: RANK_COLORS.CHIEFTAIN.base, insignia: '🛡️' },
  { name: 'Warlord', minRating: 800, color: RANK_COLORS.WARLORD.base, insignia: '⚔️' },
  { name: 'Raider King', minRating: 1000, color: RANK_COLORS.RAIDER_KING.base, insignia: '⚓' },
  { name: 'Sultan', minRating: 1200, color: RANK_COLORS.SULTAN.base, insignia: '☪️' },
  { name: 'Caesar', minRating: 1400, color: RANK_COLORS.CAESAR.base, insignia: '🦅' },
  { name: 'Khan', minRating: 1600, color: RANK_COLORS.KHAN.base, insignia: '🏹' },
  { name: 'Emperor', minRating: 1800, color: RANK_COLORS.EMPEROR.base, insignia: '👑' },
  { name: 'The Great King', minRating: 2000, color: RANK_COLORS.GREAT_KING.base, insignia: '☀️' },
  { name: 'Overlord', minRating: 2200, color: RANK_COLORS.OVERLORD.base, insignia: '💀' },
  { name: 'Worldbreaker', minRating: 2400, color: RANK_COLORS.APOCALYPSE.base, insignia: '☄️' },
]

export function getConquestRank(skillRating: number): ConquestRank {
  for (let i = CONQUEST_RANKS.length - 1; i >= 0; i--) {
    if (skillRating >= CONQUEST_RANKS[i].minRating) {
      return CONQUEST_RANKS[i]
    }
  }
  return CONQUEST_RANKS[0] // Default to Chieftain
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
  xl: 'text-xl',
}

const labelSizeClasses = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
  xl: 'text-lg',
}

const RankInsignia: React.FC<RankInsigniaProps> = ({
  rating,
  size = 'md',
  showLabel = true,
  showRating = false,
  className = '',
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
        <span className={`font-semibold ${labelSizeClasses[size]}`} style={{ color: rank.color }}>
          {rank.name}
        </span>
      )}

      {/* Rating */}
      {showRating && <span className={`text-muted ${labelSizeClasses[size]}`}>({rating})</span>}
    </div>
  )
}

export default RankInsignia
