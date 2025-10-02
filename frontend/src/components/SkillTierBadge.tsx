import type React from 'react'

export interface SkillTier {
  name:
    | 'Chieftain'
    | 'Warlord'
    | 'Raider King'
    | 'Sultan'
    | 'Caesar'
    | 'Khan'
    | 'Emperor'
    | 'The Great King'
    | 'Overlord'
    | 'Worldbreaker'
  minRating: number
  maxRating: number
  icon: string
  color: string
  description?: string
}

interface SkillTierBadgeProps {
  rating: number
  tier?: string
  showRating?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

// The Conqueror's Path - Historical conquest-themed ranking system
const SKILL_TIERS: SkillTier[] = [
  {
    name: 'Chieftain',
    minRating: 0,
    maxRating: 599,
    icon: '🛡️',
    color: 'text-amber-700',
    description: 'Leads a tribe or small clan, fighting for survival and territory',
  },
  {
    name: 'Warlord',
    minRating: 600,
    maxRating: 799,
    icon: '⚔️',
    color: 'text-red-600',
    description: 'Rules by might, feared by neighboring villages and rival tribes',
  },
  {
    name: 'Raider King',
    minRating: 800,
    maxRating: 999,
    icon: '⚓',
    color: 'text-primary',
    description: 'Expands by plunder and coastal terror campaigns',
  },
  {
    name: 'Sultan',
    minRating: 1000,
    maxRating: 1199,
    icon: '☪️',
    color: 'text-green-600',
    description: 'A ruler who wields faith and politics alongside armies',
  },
  {
    name: 'Caesar',
    minRating: 1200,
    maxRating: 1399,
    icon: '🦅',
    color: 'text-yellow-500',
    description: 'Transforms a republic into empire, master of politics and war',
  },
  {
    name: 'Khan',
    minRating: 1400,
    maxRating: 1599,
    icon: '🏹',
    color: 'text-orange-500',
    description: 'Unstoppable steppe warlord, masters of cavalry and mobility',
  },
  {
    name: 'Emperor',
    minRating: 1600,
    maxRating: 1799,
    icon: '👑',
    color: 'text-purple-500',
    description: 'Commands massive armies, reshapes Europe through ambition',
  },
  {
    name: 'The Great King',
    minRating: 1800,
    maxRating: 1999,
    icon: '☀️',
    color: 'text-orange-400',
    description: 'Ruler of kings, empire spanning continents',
  },
  {
    name: 'Overlord',
    minRating: 2000,
    maxRating: 2199,
    icon: '💀',
    color: 'text-gray-600',
    description: 'Ruler of rulers, tyrant who demands tribute and burns resistance',
  },
  {
    name: 'Worldbreaker',
    minRating: 2200,
    maxRating: 9999,
    icon: '☄️',
    color: 'text-red-800',
    description: 'The apocalyptic conqueror, remembered for brutality and empire-wide destruction',
  },
]

const SkillTierBadge: React.FC<SkillTierBadgeProps> = ({
  rating,
  tier,
  showRating = true,
  size = 'md',
  className = '',
}) => {
  // Get tier based on rating
  const skillTier =
    SKILL_TIERS.find((t) => rating >= t.minRating && rating <= t.maxRating) || SKILL_TIERS[3] // Default to Sultan (1000 rating)

  const currentTier = tier || skillTier.name

  const sizeClasses = {
    sm: 'text-sm px-2 py-1',
    md: 'text-base px-3 py-1.5',
    lg: 'text-lg px-4 py-2',
  }

  const iconSizes = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl',
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full bg-surface-1 border border-border ${sizeClasses[size]} ${className}`}
    >
      <span className={`${iconSizes[size]} ${skillTier.color}`}>{skillTier.icon}</span>
      <div className="flex flex-col">
        <span className={`font-semibold ${skillTier.color}`}>{currentTier}</span>
        {showRating && <span className="text-xs text-muted">{rating} CP</span>}
      </div>
    </div>
  )
}

export default SkillTierBadge
