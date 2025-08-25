import React from 'react'

export type TokenShape = 'circle' | 'hexagon' | 'shield' | 'diamond'

export interface TerritoryTokenProps {
  x: number                 // px from left (map coords)
  y: number                 // px from top
  armies?: number           // number of armies (optional for editor)
  color: string            // CSS color (e.g. "#3B82F6")
  shape?: TokenShape
  isSelected?: boolean     // show selection ring
  isDragging?: boolean     // being dragged
  isHovered?: boolean      // hover state
  isCapital?: boolean      // capital territory
  onClick?: () => void
  onMouseDown?: (e: React.MouseEvent) => void
  onMouseUp?: (e: React.MouseEvent) => void
  name?: string           // territory name (for editor)
  showName?: boolean      // show territory name
}

export default function TerritoryToken({
  x,
  y,
  armies = 1,
  color,
  shape = 'circle',
  isSelected = false,
  isDragging = false,
  isHovered = false,
  isCapital = false,
  onClick,
  onMouseDown,
  onMouseUp,
  name = '',
  showName = false
}: TerritoryTokenProps) {
  // Base styles with Tailwind classes
  const baseStyles = `
    absolute -translate-x-1/2 -translate-y-1/2
    flex items-center justify-center
    w-12 h-12
    font-bold text-lg
    text-white
    cursor-pointer
    transition-all duration-200
    select-none
  `

  // Shape-specific styles
  const shapeStyles = {
    circle: 'rounded-full',
    hexagon: 'clip-path-polygon-hexagon',
    shield: 'clip-path-polygon-shield rounded-t-lg',
    diamond: 'rotate-45'
  }

  // Dynamic styles based on state
  const stateStyles = `
    ${isSelected ? 'ring-4 ring-yellow-400 ring-opacity-75 scale-110' : ''}
    ${isDragging ? 'opacity-75 scale-95 cursor-grabbing' : 'hover:scale-105'}
    ${isHovered && !isSelected ? 'ring-2 ring-white ring-opacity-50' : ''}
  `

  // Container style with color and position
  const containerStyle: React.CSSProperties = {
    left: `${x}px`,
    top: `${y}px`,
    backgroundColor: color,
    boxShadow: `
      0 2px 4px rgba(0,0,0,0.3),
      0 4px 8px rgba(0,0,0,0.2),
      inset 0 1px 0 rgba(255,255,255,0.3)
    `,
    zIndex: isDragging ? 1000 : isSelected ? 100 : 10
  }

  // Text rotation compensation for diamond shape
  const textRotation = shape === 'diamond' ? '-rotate-45' : ''

  return (
    <>
      <div
        className={`${baseStyles} ${shapeStyles[shape]} ${stateStyles}`}
        style={containerStyle}
        onClick={onClick}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        role="button"
        aria-label={`${name || 'Territory'}: ${armies} armies`}
      >
        {/* Army count or territory initial */}
        <span className={`relative z-10 ${textRotation} drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]`}>
          {armies > 0 ? armies : name ? name[0].toUpperCase() : ''}
        </span>

        {/* Glossy overlay effect */}
        <div 
          className="absolute inset-0 rounded-inherit opacity-30 pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.4) 0%, transparent 50%)',
            borderRadius: 'inherit'
          }}
        />

        {/* Capital indicator */}
        {isCapital && (
          <div 
            className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full border border-yellow-600"
            style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.4)' }}
          />
        )}
      </div>

      {/* Territory name label */}
      {showName && name && (
        <div
          className="absolute text-xs font-medium text-white bg-black bg-opacity-75 px-2 py-1 rounded pointer-events-none whitespace-nowrap"
          style={{
            left: `${x}px`,
            top: `${y + 30}px`,
            transform: 'translateX(-50%)',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
            zIndex: isDragging ? 1001 : isSelected ? 101 : 11
          }}
        >
          {name}
        </div>
      )}
    </>
  )
}

// Add these to your global CSS or Tailwind config for custom clip-paths
// .clip-path-polygon-hexagon {
//   clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
// }
// .clip-path-polygon-shield {
//   clip-path: polygon(50% 0%, 100% 20%, 100% 70%, 50% 100%, 0% 70%, 0% 20%);
// }