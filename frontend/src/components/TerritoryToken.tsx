import type React from 'react'
import { memo, useMemo } from 'react'

export type TokenShape = 'hexagon' | 'square' | 'circle'

export interface TerritoryTokenProps {
  x: number
  y: number
  armies?: number
  color: string
  outlineColor?: string // Optional outline color for continent
  shape?: TokenShape
  isSelected?: boolean
  isDragging?: boolean
  onClick?: (e: React.MouseEvent) => void
  onMouseDown?: (e: React.MouseEvent) => void
  size?: number
  opacity?: number
  showArmies?: boolean
}

function TerritoryTokenComponent({
  x,
  y,
  armies = 1,
  color,
  outlineColor,
  shape = 'hexagon',
  isSelected = false,
  isDragging = false,
  onClick,
  onMouseDown,
  size = 30,
  opacity = 0.6,
  showArmies = true,
}: TerritoryTokenProps) {
  const style = useMemo<React.CSSProperties>(() => {
    const baseStyle: React.CSSProperties = {
      width: `${size}px`,
      height: `${size}px`,
      backgroundColor: color,
      opacity: isDragging ? opacity * 0.7 : opacity,
      position: 'absolute',
      left: `${x}px`,
      top: `${y}px`,
      cursor: isDragging ? 'grabbing' : 'pointer',
      transition: isDragging ? 'none' : 'all 0.2s ease',
      // Center on (x,y) first, then apply scale so the center stays fixed
      transform: `translate(-50%, -50%) ${isSelected ? 'scale(1.3)' : 'scale(1)'}`,
      transformOrigin: '50% 50%',
      padding: 0,
      boxSizing: 'border-box',
      boxShadow: isSelected
        ? `0 0 0 3px ${color}, 0 0 25px ${color}, 0 0 40px ${color}, 0 4px 8px rgba(0,0,0,0.4)`
        : '0 2px 4px rgba(0,0,0,0.3)',
      zIndex: isDragging ? 1000 : isSelected ? 100 : 10,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      userSelect: 'none',
      border: isSelected
        ? `3px solid ${color}`
        : outlineColor
          ? `2px solid ${outlineColor}`
          : `1px solid rgba(255,255,255,0.2)`,
      animation: isSelected ? 'tokenPulse 2s ease-in-out infinite' : 'none',
    }

    switch (shape) {
      case 'hexagon':
        return {
          ...baseStyle,
          clipPath: 'polygon(30% 0%, 70% 0%, 100% 50%, 70% 100%, 30% 100%, 0% 50%)',
        }
      case 'square':
        return {
          ...baseStyle,
          borderRadius: '3px',
        }
      case 'circle':
        return {
          ...baseStyle,
          borderRadius: '50%',
        }
      default:
        return baseStyle
    }
  }, [color, isDragging, isSelected, opacity, outlineColor, shape, size, x, y])

  return (
    <button
      type="button"
      style={style}
      onClick={onClick}
      onMouseDown={onMouseDown}
      aria-label={`Territory: ${armies} armies`}
    >
      {showArmies && (
        <span
          style={{
            color: 'white',
            fontSize: `${size * 0.4}px`,
            fontWeight: 'bold',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
            pointerEvents: 'none',
          }}
        >
          {armies}
        </span>
      )}
    </button>
  )
}

export default memo(TerritoryTokenComponent)
