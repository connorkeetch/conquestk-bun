import React from 'react';

interface CapitalMarkerProps {
  x: number;
  y: number;
  color?: string;
  isUnderAttack?: boolean;
  size?: number;
  fogOfWar?: boolean;  // When true, shows crown without ownership color
}

const CapitalMarker: React.FC<CapitalMarkerProps> = ({ 
  x, 
  y, 
  color = '#FFD700',  // Default gold color
  isUnderAttack = false,
  size = 24,
  fogOfWar = false
}) => {
  // In fog of war, always show neutral gold color
  const displayColor = fogOfWar ? '#FFD700' : color;
  return (
    <div
      className={`absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30 ${
        isUnderAttack ? 'animate-pulse' : ''
      }`}
      style={{
        left: `${x}px`,
        top: `${y}px`,
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      {/* Crown SVG */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`w-full h-full ${isUnderAttack ? 'animate-bounce' : 'animate-pulse'}`}
        style={{
          filter: `drop-shadow(0 0 4px ${displayColor})`
        }}
      >
        {/* Crown outline */}
        <path
          d="M5 16L3 7L7 10L12 4L17 10L21 7L19 16H5Z"
          stroke={displayColor}
          strokeWidth="2"
          fill={displayColor}
          fillOpacity="0.8"
        />
        {/* Crown jewels */}
        <circle cx="7" cy="13" r="1" fill="white" />
        <circle cx="12" cy="13" r="1" fill="white" />
        <circle cx="17" cy="13" r="1" fill="white" />
        {/* Crown base */}
        <rect x="5" y="16" width="14" height="3" fill={displayColor} />
      </svg>
      
      {/* Attack warning overlay */}
      {isUnderAttack && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></div>
        </div>
      )}
    </div>
  );
};

export default CapitalMarker;