import type React from 'react'
import { useId, useState } from 'react'
import type { TerritoryModifier } from './TerritoryModifierIcon'

interface TerritoryModifierLegendProps {
  modifiers: Map<string, TerritoryModifier>
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  collapsible?: boolean
}

export const TerritoryModifierLegend: React.FC<TerritoryModifierLegendProps> = ({
  modifiers,
  position = 'bottom-right',
  collapsible = true,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const contentId = useId()

  // Get unique modifiers
  const uniqueModifiers = new Map<string, TerritoryModifier>()
  modifiers.forEach((mod) => {
    if (!uniqueModifiers.has(mod.name)) {
      uniqueModifiers.set(mod.name, mod)
    }
  })

  if (uniqueModifiers.size === 0) return null

  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
  }

  return (
    <div className={`absolute ${positionClasses[position]} z-20`}>
      <div className="bg-surface-1/90 backdrop-blur-sm border border-border rounded-lg shadow-xl">
        {/* Header */}
        {collapsible ? (
          <button
            type="button"
            className="px-3 py-2 border-b border-border flex items-center justify-between w-full text-left hover:bg-surface-1/50 transition-colors"
            onClick={() => setIsCollapsed((prev) => !prev)}
            aria-expanded={!isCollapsed}
            aria-controls={contentId}
          >
            <span className="text-sm font-semibold text-white flex items-center gap-2">
              <span aria-hidden="true">⚡</span> Territory Modifiers
            </span>
            <span className="text-muted hover:text-white transition-colors" aria-hidden="true">
              {isCollapsed ? '▶' : '▼'}
            </span>
          </button>
        ) : (
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <span aria-hidden="true">⚡</span> Territory Modifiers
            </h3>
          </div>
        )}

        {/* Content */}
        <div
          id={contentId}
          className={`p-3 space-y-2 max-h-64 overflow-y-auto ${isCollapsed ? 'hidden' : ''}`}
          aria-hidden={isCollapsed}
        >
          {Array.from(uniqueModifiers.values()).map((modifier) => (
            <div
              key={modifier.name}
              className="flex items-start gap-3 p-2 rounded hover:bg-surface-1/30 transition-colors"
            >
              {/* Icon */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: `${modifier.color}33`,
                  border: `1px solid ${modifier.color}66`,
                }}
              >
                <span className="text-lg">{modifier.icon}</span>
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white text-sm">{modifier.name}</div>
                <div className="text-xs text-muted mt-1 space-x-3">
                  {modifier.defense_bonus !== 0 && (
                    <span
                      className={modifier.defense_bonus > 0 ? 'text-primary-soft' : 'text-red-400'}
                    >
                      🛡️ {modifier.defense_bonus > 0 ? '+' : ''}
                      {modifier.defense_bonus}
                    </span>
                  )}
                  {modifier.attack_bonus !== 0 && (
                    <span className={modifier.attack_bonus > 0 ? 'text-red-400' : 'text-muted'}>
                      ⚔️ {modifier.attack_bonus > 0 ? '+' : ''}
                      {modifier.attack_bonus}
                    </span>
                  )}
                  {modifier.troop_generation_bonus > 0 && (
                    <span className="text-green-400">👥 +{modifier.troop_generation_bonus}</span>
                  )}
                </div>
                {modifier.movement_restriction && (
                  <div className="text-xs text-yellow-400 mt-1">🚧 Restricted Movement</div>
                )}
                {modifier.supply_line_bonus && (
                  <div className="text-xs text-purple-400 mt-1">🔗 Supply Line Bonus</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default TerritoryModifierLegend
