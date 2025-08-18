import React from 'react';

interface SimpleMapSVGProps {
  territories: { [key: string]: any };
  onTerritoryClick: (territoryId: string) => void;
  onTerritoryHover: (territoryId: string | null) => void;
  getTerritoryColor: (territoryId: string) => string;
  hoveredTerritory: string | null;
  selectedTerritory: string | null;
  selectedTargetTerritory: string | null;
  validTargets: string[];
  pendingAction: string | null;
}

export const SimpleMapSVG: React.FC<SimpleMapSVGProps> = ({
  territories,
  onTerritoryClick,
  onTerritoryHover,
  getTerritoryColor,
  hoveredTerritory,
  selectedTerritory,
  selectedTargetTerritory,
  validTargets,
  pendingAction,
}) => {
  const getTerritoryStyles = (territoryId: string) => {
    const baseClasses = 'cursor-pointer transition-all duration-200'
    let extraClasses = ''
    let strokeWidth = '2'
    let strokeColor = '#333'

    // Visual feedback based on territory state
    if (selectedTerritory === territoryId) {
      extraClasses += ' drop-shadow-lg'
      strokeWidth = '4'
      strokeColor = '#FFD700' // Gold for selected
    } else if (selectedTargetTerritory === territoryId) {
      extraClasses += ' drop-shadow-md'
      strokeWidth = '3'
      strokeColor = '#FF4444' // Red for selected target
    } else if (validTargets.includes(territoryId)) {
      extraClasses += ' drop-shadow-sm'
      strokeWidth = '3'
      strokeColor = '#44FF44' // Green for valid targets
    } else if (hoveredTerritory === territoryId) {
      extraClasses += ' brightness-110'
      strokeWidth = '3'
      strokeColor = '#666'
    }

    // Action-specific visual feedback
    if (pendingAction) {
      if (pendingAction === 'attack' && validTargets.includes(territoryId)) {
        extraClasses += ' animate-pulse'
      } else if (pendingAction === 'deploy' && selectedTerritory === territoryId) {
        extraClasses += ' animate-pulse'
      } else if (pendingAction === 'fortify' && validTargets.includes(territoryId)) {
        extraClasses += ' animate-pulse'
      }
    }

    return {
      className: `${baseClasses} ${extraClasses}`,
      strokeWidth,
      stroke: strokeColor
    }
  }

  // Simple geometric territory shapes for the fantasy map
  const territoryPaths: { [key: string]: string } = {
    // Northern Lands (top row)
    frozen_wastes: "M 50 50 L 200 40 L 220 100 L 180 120 L 80 110 Z",
    ice_peaks: "M 220 40 L 380 50 L 400 110 L 350 130 L 240 120 L 220 100 Z", 
    tundra_plains: "M 120 110 L 320 120 L 340 170 L 280 180 L 140 170 Z",
    
    // Central Kingdoms (middle area)
    forest_realm: "M 50 170 L 180 160 L 200 220 L 160 240 L 70 230 Z",
    mountain_pass: "M 200 150 L 380 140 L 420 200 L 380 220 L 220 210 Z",
    river_valley: "M 30 230 L 120 220 L 140 280 L 90 300 L 50 290 Z",
    golden_fields: "M 320 210 L 450 200 L 470 260 L 430 280 L 340 270 Z",
    
    // Southern Realms (lower middle)
    crystal_caverns: "M 70 290 L 200 280 L 220 340 L 180 360 L 90 350 Z",
    coastal_haven: "M 30 350 L 120 340 L 140 400 L 90 420 L 50 410 Z",
    burning_sands: "M 140 360 L 280 350 L 320 410 L 260 430 L 160 420 Z",
    trade_crossroads: "M 280 350 L 450 340 L 480 400 L 430 420 L 300 410 Z",
    
    // Eastern Empire (right side)
    dragon_spine: "M 420 200 L 520 190 L 540 280 L 500 300 L 440 290 L 430 250 Z",
    jade_peaks: "M 430 320 L 520 310 L 540 380 L 500 400 L 450 390 Z",
    mystic_isles: "M 520 290 L 580 280 L 600 340 L 570 360 L 540 350 Z"
  }

  return (
    <div className="relative w-full h-full bg-gradient-to-br from-blue-100 to-green-100 rounded-lg overflow-hidden">
      <svg
        viewBox="0 0 600 450"
        className="w-full h-full"
        style={{ maxHeight: '70vh' }}
      >
        {/* Background elements for visual appeal */}
        <defs>
          <radialGradient id="mountainGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f0f0f0" />
            <stop offset="100%" stopColor="#d0d0d0" />
          </radialGradient>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="2" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="0.3"/>
          </filter>
        </defs>

        {/* Render territories */}
        {Object.keys(territories).map((territoryId) => {
          const styles = getTerritoryStyles(territoryId)
          const pathData = territoryPaths[territoryId]
          
          if (!pathData) return null
          
          return (
            <g key={territoryId}>
              <path
                id={territoryId}
                d={pathData}
                fill={getTerritoryColor(territoryId)}
                stroke={styles.stroke}
                strokeWidth={styles.strokeWidth}
                className={styles.className}
                filter="url(#shadow)"
                onClick={() => onTerritoryClick(territoryId)}
                onMouseEnter={() => onTerritoryHover(territoryId)}
                onMouseLeave={() => onTerritoryHover(null)}
              />
              
              {/* Territory name label on hover */}
              {hoveredTerritory === territoryId && (
                <text
                  x={territories[territoryId]?.armyPosition?.x || 0}
                  y={(territories[territoryId]?.armyPosition?.y || 0) - 20}
                  textAnchor="middle"
                  className="fill-gray-800 text-sm font-semibold pointer-events-none"
                  style={{ textShadow: '1px 1px 2px white' }}
                >
                  {territories[territoryId]?.name}
                </text>
              )}
            </g>
          )
        })}

        {/* Decorative elements */}
        <circle cx="50" cy="50" r="3" fill="#4CAF50" opacity="0.5" />
        <circle cx="550" cy="400" r="3" fill="#9C27B0" opacity="0.5" />
        <circle cx="300" cy="225" r="2" fill="#FF9800" opacity="0.5" />
      </svg>
      
      {/* Map title overlay */}
      <div className="absolute top-4 left-4 bg-black bg-opacity-60 text-white px-3 py-1 rounded-lg text-sm font-semibold">
        Fantasy Realms
      </div>
      
      {/* Legend overlay */}
      <div className="absolute bottom-4 right-4 bg-white bg-opacity-90 p-2 rounded-lg text-xs">
        <div className="font-semibold mb-1">Continents:</div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-green-500 rounded"></div>
          <span>Northern (3)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-blue-500 rounded"></div>
          <span>Central (4)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-orange-500 rounded"></div>
          <span>Southern (2)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-purple-500 rounded"></div>
          <span>Eastern (3)</span>
        </div>
      </div>
    </div>
  );
};