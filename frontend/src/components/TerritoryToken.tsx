import React from 'react'

export type TokenShape = 'hexagon' | 'square' | 'circle'

export interface TerritoryTokenProps {
  x: number                 
  y: number                 
  armies?: number           
  color: string            
  outlineColor?: string     // Optional outline color for continent
  shape?: TokenShape
  isSelected?: boolean     
  isDragging?: boolean     
  onClick?: () => void
  onMouseDown?: (e: React.MouseEvent) => void
  size?: number  
  opacity?: number
}

export default function TerritoryToken({
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
  opacity = 0.6
}: TerritoryTokenProps) {
  
  const getShapeStyle = (): React.CSSProperties => {
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
      transform: isSelected ? 'scale(1.15)' : 'scale(1)',
      boxShadow: isSelected 
        ? '0 0 15px rgba(255,255,255,0.6), 0 2px 4px rgba(0,0,0,0.3)' 
        : '0 2px 4px rgba(0,0,0,0.3)',
      zIndex: isDragging ? 1000 : (isSelected ? 100 : 10),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      userSelect: 'none',
      border: outlineColor ? `2px solid ${outlineColor}` : `1px solid rgba(255,255,255,0.2)`
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
  }

  return (
    <div
      style={getShapeStyle()}
      onClick={onClick}
      onMouseDown={onMouseDown}
      role="button"
      aria-label={`Territory: ${armies} armies`}
    >
      <span 
        style={{ 
          color: 'white',
          fontSize: `${size * 0.4}px`,
          fontWeight: 'bold',
          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
          pointerEvents: 'none'
        }}
      >
        {armies}
      </span>
    </div>
  )
}