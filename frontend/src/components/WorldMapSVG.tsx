import React from 'react';

interface WorldMapSVGProps {
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

export const WorldMapSVG: React.FC<WorldMapSVGProps> = ({
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
    let strokeWidth = '1'
    let strokeColor = '#333'

    // Visual feedback based on territory state
    if (selectedTerritory === territoryId) {
      extraClasses += ' drop-shadow-lg'
      strokeWidth = '3'
      strokeColor = '#FFD700' // Gold for selected
    } else if (selectedTargetTerritory === territoryId) {
      extraClasses += ' drop-shadow-md'
      strokeWidth = '2'
      strokeColor = '#FF4444' // Red for selected target
    } else if (validTargets.includes(territoryId)) {
      extraClasses += ' drop-shadow-sm'
      strokeWidth = '2'
      strokeColor = '#44FF44' // Green for valid targets
    } else if (hoveredTerritory === territoryId) {
      extraClasses += ' brightness-110 stroke-2'
      strokeWidth = '2'
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

  // Territory path data mapping
  const territoryPaths: { [key: string]: string } = {
    alaska: "M 20 80 L 80 60 L 120 80 L 140 120 L 100 140 L 60 130 Z",
    northwest_territory: "M 140 60 L 200 50 L 240 80 L 220 120 L 180 130 L 140 120 Z",
    greenland: "M 250 40 L 320 30 L 340 70 L 320 100 L 280 110 L 240 80 Z",
    alberta: "M 100 120 L 140 120 L 180 130 L 180 170 L 140 180 L 100 170 Z",
    ontario: "M 140 120 L 220 120 L 240 140 L 220 180 L 180 170 L 140 180 Z",
    quebec: "M 220 120 L 280 110 L 300 140 L 280 180 L 240 180 L 220 140 Z",
    western_united_states: "M 100 170 L 180 170 L 220 180 L 200 220 L 160 230 L 120 220 Z",
    eastern_united_states: "M 180 170 L 240 180 L 260 200 L 240 230 L 200 220 L 180 190 Z",
    central_america: "M 120 220 L 200 220 L 240 230 L 220 270 L 180 280 L 140 270 Z",
    venezuela: "M 180 270 L 220 270 L 240 300 L 220 320 L 180 310 L 160 290 Z",
    brazil: "M 200 300 L 280 290 L 300 340 L 280 370 L 240 380 L 200 360 L 180 330 Z",
    peru: "M 160 320 L 200 330 L 220 360 L 200 380 L 160 370 L 140 340 Z",
    argentina: "M 180 370 L 240 380 L 250 420 L 220 450 L 180 440 L 160 410 Z",
    iceland: "M 300 90 L 340 80 L 360 110 L 340 130 L 300 120 L 280 100 Z",
    great_britain: "M 320 140 L 360 130 L 380 160 L 360 180 L 320 170 L 300 150 Z",
    scandinavia: "M 360 80 L 420 70 L 440 110 L 420 140 L 380 130 L 360 100 Z",
    ukraine: "M 420 120 L 480 110 L 500 150 L 480 180 L 440 170 L 420 140 Z",
    northern_europe: "M 360 140 L 420 130 L 440 160 L 420 180 L 380 170 L 360 150 Z",
    western_europe: "M 320 180 L 380 170 L 400 200 L 380 220 L 340 210 L 320 190 Z",
    southern_europe: "M 380 180 L 440 170 L 460 200 L 440 220 L 400 210 L 380 190 Z",
    north_africa: "M 320 240 L 400 230 L 420 270 L 400 300 L 360 310 L 340 280 Z",
    egypt: "M 400 250 L 440 240 L 460 270 L 440 290 L 420 280 L 400 260 Z",
    east_africa: "M 420 300 L 460 290 L 480 330 L 460 360 L 440 350 L 420 320 Z",
    congo: "M 360 320 L 420 310 L 440 340 L 420 370 L 380 380 L 360 350 Z",
    south_africa: "M 380 370 L 440 360 L 460 390 L 440 420 L 400 430 L 380 400 Z",
    madagascar: "M 460 350 L 480 340 L 490 370 L 480 390 L 460 380 L 450 360 Z",
    middle_east: "M 460 210 L 500 200 L 520 240 L 500 270 L 480 260 L 460 230 Z",
    afghanistan: "M 480 180 L 520 170 L 540 200 L 520 230 L 500 220 L 480 190 Z",
    ural: "M 480 110 L 540 100 L 560 140 L 540 160 L 520 150 L 480 120 Z",
    siberia: "M 540 80 L 600 70 L 620 110 L 600 140 L 560 130 L 540 100 Z",
    yakutsk: "M 600 60 L 660 50 L 680 80 L 660 110 L 620 100 L 600 70 Z",
    kamchatka: "M 660 80 L 720 70 L 740 110 L 720 140 L 680 130 L 660 100 Z",
    irkutsk: "M 600 120 L 660 110 L 680 140 L 660 160 L 620 150 L 600 130 Z",
    mongolia: "M 600 150 L 660 140 L 680 180 L 660 200 L 620 190 L 600 170 Z",
    japan: "M 680 180 L 720 170 L 740 200 L 720 220 L 700 210 L 680 190 Z",
    china: "M 560 170 L 620 160 L 640 200 L 620 230 L 580 220 L 560 190 Z",
    india: "M 520 240 L 580 230 L 600 270 L 580 300 L 540 290 L 520 260 Z",
    siam: "M 580 260 L 620 250 L 640 280 L 620 310 L 600 300 L 580 280 Z",
    indonesia: "M 600 320 L 640 310 L 660 340 L 640 360 L 620 350 L 600 330 Z",
    new_guinea: "M 640 340 L 680 330 L 700 360 L 680 380 L 660 370 L 640 350 Z",
    western_australia: "M 600 360 L 640 350 L 660 390 L 640 420 L 600 430 L 580 400 Z",
    eastern_australia: "M 640 380 L 680 370 L 700 410 L 680 440 L 640 430 L 620 400 Z"
  }

  return (
    <svg
      viewBox="0 0 800 500"
      className="w-full h-full"
      style={{ maxHeight: '70vh' }}
    >
      {Object.keys(territories).map((territoryId) => {
        const styles = getTerritoryStyles(territoryId)
        const pathData = territoryPaths[territoryId]
        
        if (!pathData) return null
        
        return (
          <path
            key={territoryId}
            id={territoryId}
            d={pathData}
            fill={getTerritoryColor(territoryId)}
            stroke={styles.stroke}
            strokeWidth={styles.strokeWidth}
            className={styles.className}
            onClick={() => onTerritoryClick(territoryId)}
            onMouseEnter={() => onTerritoryHover(territoryId)}
            onMouseLeave={() => onTerritoryHover(null)}
          />
        )
      })}
    </svg>
  );
};