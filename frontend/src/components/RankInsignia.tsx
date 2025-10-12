// Shared ranks come from the shared package (ESM named exports)
import * as ranksModule from '@conquestk/shared/constants/ranks'
import type React from 'react'
import { RANK_COLORS } from '../constants/colors'

export interface ConquestRank {
  name: string
  minRating: number
  color: string
  insignia: string
}

export const RANK_ROMAN_NUMERALS = [
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
] as const

// 🎯 NOW USING UNIFIED COLOR SYSTEM - All colors reference RANK_COLORS from colors.ts
// Build frontend rank table from shared thresholds, layering UI colors/insignia locally
const RANK_INSIGNIA: Record<string, string> = {
  Chieftain: '🛡️',
  Warlord: '⚔️',
  'Raider King': '⚓',
  Sultan: '☪️',
  Caesar: '🦅',
  Khan: '🏹',
  Emperor: '👑',
  'The Great King': '☀️',
  Overlord: '💀',
  Worldbreaker: '☄️',
}

const COLOR_BY_NAME: Record<string, string> = {
  Chieftain: RANK_COLORS.CHIEFTAIN.base,
  Warlord: RANK_COLORS.WARLORD.base,
  'Raider King': RANK_COLORS.RAIDER_KING.base,
  Sultan: RANK_COLORS.SULTAN.base,
  Caesar: RANK_COLORS.CAESAR.base,
  Khan: RANK_COLORS.KHAN.base,
  Emperor: RANK_COLORS.EMPEROR.base,
  'The Great King': RANK_COLORS.GREAT_KING.base,
  Overlord: RANK_COLORS.OVERLORD.base,
  Worldbreaker: RANK_COLORS.WORLDBREAKER.base,
}

const SHARED_RANKS =
  (ranksModule as unknown as { RANKS?: Array<{ name: string; minRating: number }> }).RANKS || []

export const CONQUEST_RANKS: ConquestRank[] = SHARED_RANKS.map((r) => ({
  name: r.name,
  minRating: r.minRating,
  color: COLOR_BY_NAME[r.name] ?? RANK_COLORS.CHIEFTAIN.base,
  insignia: RANK_INSIGNIA[r.name] ?? '🏅',
}))

export function getConquestRank(skillRating: number): ConquestRank {
  for (let i = CONQUEST_RANKS.length - 1; i >= 0; i--) {
    if (skillRating >= CONQUEST_RANKS[i].minRating) {
      return CONQUEST_RANKS[i]
    }
  }
  return CONQUEST_RANKS[0] // Default to Chieftain
}

interface RankTierInfoOptions {
  minRating?: number
  rating?: number
}

export function getRankTierInfo({ minRating, rating }: RankTierInfoOptions) {
  const totalTiers = CONQUEST_RANKS.length
  let tierIndex = -1

  if (typeof minRating === 'number') {
    tierIndex = CONQUEST_RANKS.findIndex((rank) => rank.minRating === minRating)
  }

  if (tierIndex < 0 && typeof rating === 'number') {
    for (let i = totalTiers - 1; i >= 0; i--) {
      if (rating >= CONQUEST_RANKS[i].minRating) {
        tierIndex = i
        break
      }
    }
  }

  if (tierIndex < 0) {
    tierIndex = 0
  }

  const roman = RANK_ROMAN_NUMERALS[tierIndex] ?? String(tierIndex + 1)

  return {
    index: tierIndex,
    roman,
    label: `Rank ${roman}`,
    total: totalTiers,
  }
}

interface RankInsigniaProps {
  rating: number
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showLabel?: boolean
  showRating?: boolean
  className?: string
  style?: React.CSSProperties
  textColor?: string
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
  style,
  textColor,
}) => {
  const rank = getConquestRank(rating)

  return (
    <div className={`flex items-center gap-2 ${className}`} style={style}>
      {/* Insignia */}
      <span
        className={`${sizeClasses[size]} inline-block`}
        style={{ color: textColor ?? rank.color }}
        title={`${rank.name} (${rating} CP)`}
      >
        {rank.insignia}
      </span>

      {/* Rank Name */}
      {showLabel && (
        <span
          className={`font-semibold ${labelSizeClasses[size]}`}
          style={{ color: textColor ?? rank.color }}
        >
          {rank.name}
        </span>
      )}

      {/* Rating */}
      {showRating && <span className={`text-muted ${labelSizeClasses[size]}`}>({rating})</span>}
    </div>
  )
}

export default RankInsignia
