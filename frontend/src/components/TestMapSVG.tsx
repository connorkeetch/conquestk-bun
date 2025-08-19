import React from 'react';

interface TestMapSVGProps {
  territories: { [key: string]: any };
  onTerritoryClick: (territoryId: string) => void;
  onTerritoryHover: (territoryId: string | null) => void;
  getTerritoryColor: (territoryId: string) => string;
  hoveredTerritory: string | null;
  selectedTerritory: string | null;
  selectedTargetTerritory: string | null;
  validTargets: string[];
  pendingAction: string | null;
  mapType?: 'simple-world' | 'mini-risk';
}

export const TestMapSVG: React.FC<TestMapSVGProps> = ({
  territories,
  onTerritoryClick,
  onTerritoryHover,
  getTerritoryColor,
  hoveredTerritory,
  selectedTerritory,
  selectedTargetTerritory,
  validTargets,
  pendingAction,
  mapType = 'simple-world'
}) => {
  const getTerritoryStyles = (territoryId: string) => {
    const baseClasses = 'cursor-pointer transition-all duration-200';
    let extraClasses = '';
    let strokeWidth = '2';
    let strokeColor = '#333';

    // Visual feedback based on territory state
    if (selectedTerritory === territoryId) {
      extraClasses += ' drop-shadow-lg';
      strokeWidth = '4';
      strokeColor = '#FFD700'; // Gold for selected
    } else if (selectedTargetTerritory === territoryId) {
      extraClasses += ' drop-shadow-md';
      strokeWidth = '3';
      strokeColor = '#FF4444'; // Red for selected target
    } else if (validTargets.includes(territoryId)) {
      extraClasses += ' drop-shadow-sm';
      strokeWidth = '3';
      strokeColor = '#44FF44'; // Green for valid targets
    } else if (hoveredTerritory === territoryId) {
      extraClasses += ' brightness-110';
      strokeWidth = '3';
      strokeColor = '#666';
    }

    // Action-specific visual feedback
    if (pendingAction) {
      if (pendingAction === 'attack' && validTargets.includes(territoryId)) {
        extraClasses += ' animate-pulse';
      } else if (pendingAction === 'deploy' && selectedTerritory === territoryId) {
        extraClasses += ' animate-pulse';
      } else if (pendingAction === 'fortify' && validTargets.includes(territoryId)) {
        extraClasses += ' animate-pulse';
      }
    }

    return {
      className: `${baseClasses} ${extraClasses}`,
      strokeWidth,
      stroke: strokeColor
    };
  };

  // Convert coordinate arrays to SVG path strings
  const coordsToPath = (coords: number[][]): string => {
    if (!coords || coords.length === 0) return '';
    
    // Start with Move command
    let path = `M ${coords[0][0]} ${coords[0][1]}`;
    
    // Add Line commands for remaining points
    for (let i = 1; i < coords.length; i++) {
      path += ` L ${coords[i][0]} ${coords[i][1]}`;
    }
    
    // Close the path
    path += ' Z';
    return path;
  };

  // Simple World Map paths (converted from coordinates)
  const simpleWorldPaths: { [key: string]: string } = {
    'north-america': coordsToPath([[100,50],[200,50],[200,150],[100,150]]),
    'south-america': coordsToPath([[100,200],[200,200],[200,300],[100,300]]),
    'europe': coordsToPath([[300,50],[400,50],[400,150],[300,150]]),
    'africa': coordsToPath([[300,175],[400,175],[400,275],[300,275]]),
    'asia': coordsToPath([[425,50],[550,50],[550,150],[425,150]]),
    'australia': coordsToPath([[450,225],[550,225],[550,275],[450,275]])
  };

  // Mini Risk Map paths (converted from coordinates)
  const miniRiskPaths: { [key: string]: string } = {
    'territory-1': coordsToPath([[50,50],[150,50],[150,150],[50,150]]),
    'territory-2': coordsToPath([[200,50],[300,50],[300,150],[200,150]]),
    'territory-3': coordsToPath([[50,175],[150,175],[150,275],[50,275]]),
    'territory-4': coordsToPath([[200,175],[300,175],[300,275],[200,275]])
  };

  // Select appropriate paths based on map type
  const territoryPaths = mapType === 'mini-risk' ? miniRiskPaths : simpleWorldPaths;

  // Connection lines between territories (for visual adjacency hints)
  const renderConnectionLines = () => {
    if (mapType === 'simple-world') {
      return (
        <g className="connections opacity-20">
          {/* North America connections */}
          <line x1="150" y1="150" x2="150" y2="200" stroke="#666" strokeWidth="1" strokeDasharray="5,5" />
          <line x1="200" y1="100" x2="300" y2="100" stroke="#666" strokeWidth="1" strokeDasharray="5,5" />
          
          {/* Europe connections */}
          <line x1="350" y1="150" x2="350" y2="175" stroke="#666" strokeWidth="1" strokeDasharray="5,5" />
          <line x1="400" y1="100" x2="425" y2="100" stroke="#666" strokeWidth="1" strokeDasharray="5,5" />
          
          {/* Africa connections */}
          <line x1="200" y1="250" x2="300" y2="225" stroke="#666" strokeWidth="1" strokeDasharray="5,5" />
          <line x1="400" y1="225" x2="425" y2="100" stroke="#666" strokeWidth="1" strokeDasharray="5,5" />
          
          {/* Asia connections */}
          <line x1="500" y1="150" x2="500" y2="225" stroke="#666" strokeWidth="1" strokeDasharray="5,5" />
        </g>
      );
    } else if (mapType === 'mini-risk') {
      return (
        <g className="connections opacity-20">
          <line x1="150" y1="100" x2="200" y2="100" stroke="#666" strokeWidth="1" strokeDasharray="5,5" />
          <line x1="100" y1="150" x2="100" y2="175" stroke="#666" strokeWidth="1" strokeDasharray="5,5" />
          <line x1="250" y1="150" x2="250" y2="175" stroke="#666" strokeWidth="1" strokeDasharray="5,5" />
          <line x1="150" y1="225" x2="200" y2="225" stroke="#666" strokeWidth="1" strokeDasharray="5,5" />
          {/* Cross connection */}
          <line x1="200" y1="150" x2="150" y2="175" stroke="#666" strokeWidth="1" strokeDasharray="5,5" />
        </g>
      );
    }
    return null;
  };

  // Army position data
  const armyPositions: { [key: string]: { x: number; y: number } } = mapType === 'mini-risk' ? {
    'territory-1': { x: 100, y: 100 },
    'territory-2': { x: 250, y: 100 },
    'territory-3': { x: 100, y: 225 },
    'territory-4': { x: 250, y: 225 }
  } : {
    'north-america': { x: 150, y: 100 },
    'south-america': { x: 150, y: 250 },
    'europe': { x: 350, y: 100 },
    'africa': { x: 350, y: 225 },
    'asia': { x: 487, y: 100 },
    'australia': { x: 500, y: 250 }
  };

  const viewBox = mapType === 'mini-risk' ? '0 0 350 325' : '0 0 600 350';
  const bgGradient = mapType === 'mini-risk' 
    ? 'from-purple-100 to-pink-100' 
    : 'from-blue-100 to-green-100';

  return (
    <div className={`relative w-full h-full bg-gradient-to-br ${bgGradient} rounded-lg overflow-hidden`}>
      <svg
        viewBox={viewBox}
        className="w-full h-full"
        style={{ maxHeight: '70vh' }}
      >
        {/* Background pattern */}
        <defs>
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e0e0e0" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" opacity="0.3" />

        {/* Connection lines */}
        {renderConnectionLines()}

        {/* Territories */}
        {Object.keys(territoryPaths).map(territoryId => {
          const territory = territories[territoryId];
          if (!territory) return null;

          const styles = getTerritoryStyles(territoryId);
          const fillColor = getTerritoryColor(territoryId);
          const armyPos = armyPositions[territoryId] || { x: 0, y: 0 };

          return (
            <g key={territoryId}>
              {/* Territory shape */}
              <path
                d={territoryPaths[territoryId]}
                fill={fillColor}
                {...styles}
                fillOpacity="0.8"
                onMouseEnter={() => onTerritoryHover(territoryId)}
                onMouseLeave={() => onTerritoryHover(null)}
                onClick={() => onTerritoryClick(territoryId)}
              />
              
              {/* Territory name */}
              <text
                x={armyPos.x}
                y={armyPos.y - 15}
                textAnchor="middle"
                className="text-xs font-semibold pointer-events-none select-none"
                fill="#333"
              >
                {territory.name}
              </text>

              {/* Army count circle */}
              {territory.armies > 0 && (
                <g className="pointer-events-none">
                  <circle
                    cx={armyPos.x}
                    cy={armyPos.y}
                    r="18"
                    fill="white"
                    stroke="#333"
                    strokeWidth="2"
                    opacity="0.9"
                  />
                  <text
                    x={armyPos.x}
                    y={armyPos.y + 5}
                    textAnchor="middle"
                    className="text-lg font-bold select-none"
                    fill="#333"
                  >
                    {territory.armies}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Map title */}
        <text
          x={mapType === 'mini-risk' ? 175 : 300}
          y="30"
          textAnchor="middle"
          className="text-xl font-bold"
          fill="#666"
        >
          {mapType === 'mini-risk' ? 'Mini Risk' : 'Simple World'}
        </text>
      </svg>
    </div>
  );
};