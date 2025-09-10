import type React from 'react'

export interface TerritoryModifier {
  name: string
  icon: string
  color: string
  defense_bonus: number
  attack_bonus: number
  troop_generation_bonus: number
  movement_restriction?: boolean
  supply_line_bonus?: boolean
}

interface TerritoryModifierIconProps {
  modifier: TerritoryModifier
  size?: 'small' | 'medium' | 'large'
  showTooltip?: boolean
  className?: string
}

export const TerritoryModifierIcon: React.FC<TerritoryModifierIconProps> = ({
  modifier,
  size = 'medium',
  showTooltip = true,
  className = '',
}) => {
  const sizeClasses = {
    small: 'w-5 h-5 text-xs',
    medium: 'w-7 h-7 text-sm',
    large: 'w-10 h-10 text-base',
  }

  const getBonusText = (value: number, type: string) => {
    if (value === 0) return null
    const sign = value > 0 ? '+' : ''
    return `${type}: ${sign}${value}`
  }

  const tooltipContent = [
    getBonusText(modifier.defense_bonus, 'Defense'),
    getBonusText(modifier.attack_bonus, 'Attack'),
    getBonusText(modifier.troop_generation_bonus, 'Troops/Turn'),
    modifier.movement_restriction ? '🚧 Movement Restricted' : null,
    modifier.supply_line_bonus ? '🔗 Supply Line Bonus' : null,
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <div
      className={`relative inline-flex items-center justify-center ${sizeClasses[size]} ${className}`}
      title={showTooltip ? `${modifier.name}\n${tooltipContent}` : undefined}
    >
      {/* Background glow effect */}
      <div
        className="absolute inset-0 rounded-full opacity-30 blur-sm"
        style={{ backgroundColor: modifier.color }}
      />

      {/* Icon background */}
      <div
        className="absolute inset-0 rounded-full opacity-20"
        style={{ backgroundColor: modifier.color }}
      />

      {/* Icon */}
      <span className="relative z-10 select-none">{modifier.icon}</span>

      {/* Bonus indicators */}
      {modifier.defense_bonus > 0 && (
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full text-[8px] text-white flex items-center justify-center">
          +{modifier.defense_bonus}
        </span>
      )}
      {modifier.attack_bonus > 0 && (
        <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-red-500 rounded-full text-[8px] text-white flex items-center justify-center">
          +{modifier.attack_bonus}
        </span>
      )}
    </div>
  )
}

export default TerritoryModifierIcon
