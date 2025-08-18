import React, { useState, useCallback } from 'react';
import territoryData from '../data/simple-risk-territories.json';

interface Territory {
  id: string;
  name: string;
  x: number;
  y: number;
  continent: string;
  connections: string[];
}

interface GameState {
  territories: { [key: string]: { owner: string; armies: number } };
  currentPlayer: string;
  selectedTerritory: string | null;
}

const PLAYER_COLORS = {
  'player1': '#ff4444',
  'player2': '#4444ff', 
  'player3': '#44ff44',
  'player4': '#ffff44',
  'player5': '#ff44ff',
  'player6': '#44ffff',
  'neutral': '#888888'
};

const SimpleRiskBoard: React.FC = () => {
  const territories = territoryData.territories as Territory[];
  
  // Initialize with some sample territory ownership
  const [gameState, setGameState] = useState<GameState>({
    territories: territories.reduce((acc, territory) => {
      acc[territory.id] = {
        owner: Math.random() > 0.7 ? 'neutral' : `player${Math.floor(Math.random() * 3) + 1}`,
        armies: Math.floor(Math.random() * 5) + 1
      };
      return acc;
    }, {} as { [key: string]: { owner: string; armies: number } }),
    currentPlayer: 'player1',
    selectedTerritory: null
  });

  const handleTerritoryClick = useCallback((territoryId: string) => {
    setGameState(prev => ({
      ...prev,
      selectedTerritory: prev.selectedTerritory === territoryId ? null : territoryId
    }));
  }, []);

  const getTerritoryStyle = (territory: Territory) => {
    const territoryState = gameState.territories[territory.id];
    const isSelected = gameState.selectedTerritory === territory.id;
    
    return {
      position: 'absolute' as const,
      left: `${territory.x}%`,
      top: `${territory.y}%`,
      transform: 'translate(-50%, -50%)',
      width: '24px',
      height: '24px',
      borderRadius: '50%',
      backgroundColor: PLAYER_COLORS[territoryState.owner as keyof typeof PLAYER_COLORS] || PLAYER_COLORS.neutral,
      border: isSelected ? '3px solid #000' : '2px solid #fff',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '12px',
      fontWeight: 'bold',
      color: '#fff',
      textShadow: '1px 1px 1px rgba(0,0,0,0.8)',
      zIndex: isSelected ? 1000 : 100,
      boxShadow: isSelected ? '0 0 10px rgba(0,0,0,0.5)' : '0 2px 4px rgba(0,0,0,0.3)',
      transition: 'all 0.2s ease'
    };
  };

  const selectedTerritory = gameState.selectedTerritory 
    ? territories.find(t => t.id === gameState.selectedTerritory)
    : null;

  return (
    <div style={{ 
      position: 'relative', 
      width: '100%', 
      height: '600px',
      backgroundImage: 'url("https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Risk_game_map_fixed.png/1024px-Risk_game_map_fixed.png")',
      backgroundSize: 'contain',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center',
      border: '2px solid #333',
      borderRadius: '8px',
      overflow: 'hidden'
    }}>
      {/* Territory Markers */}
      {territories.map(territory => (
        <div
          key={territory.id}
          style={getTerritoryStyle(territory)}
          onClick={() => handleTerritoryClick(territory.id)}
          title={`${territory.name} (${gameState.territories[territory.id].armies} armies)`}
        >
          {gameState.territories[territory.id].armies}
        </div>
      ))}

      {/* Territory Info Panel */}
      {selectedTerritory && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          padding: '15px',
          borderRadius: '8px',
          border: '2px solid #333',
          minWidth: '200px',
          zIndex: 2000
        }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#333' }}>
            {selectedTerritory.name}
          </h3>
          <div style={{ marginBottom: '8px' }}>
            <strong>Owner:</strong> {gameState.territories[selectedTerritory.id].owner}
          </div>
          <div style={{ marginBottom: '8px' }}>
            <strong>Armies:</strong> {gameState.territories[selectedTerritory.id].armies}
          </div>
          <div style={{ marginBottom: '8px' }}>
            <strong>Continent:</strong> {selectedTerritory.continent}
          </div>
          <div>
            <strong>Connections:</strong>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>
              {selectedTerritory.connections.map(connId => {
                const connTerritory = territories.find(t => t.id === connId);
                return (
                  <div key={connId} style={{ padding: '2px 0' }}>
                    • {connTerritory?.name || connId}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{
        position: 'absolute',
        bottom: '10px',
        left: '10px',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        padding: '10px',
        borderRadius: '8px',
        border: '2px solid #333'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Players:</div>
        {Object.entries(PLAYER_COLORS).slice(0, 4).map(([player, color]) => (
          <div key={player} style={{ 
            display: 'flex', 
            alignItems: 'center', 
            marginBottom: '4px' 
          }}>
            <div style={{
              width: '16px',
              height: '16px',
              backgroundColor: color,
              borderRadius: '50%',
              marginRight: '8px',
              border: '1px solid #fff'
            }}></div>
            <span style={{ fontSize: '12px' }}>
              {player === 'neutral' ? 'Neutral' : player.replace('player', 'Player ')}
            </span>
          </div>
        ))}
      </div>

      {/* Instructions */}
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '10px',
        borderRadius: '8px',
        fontSize: '14px',
        maxWidth: '250px'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>Simple Risk Map Demo</div>
        <div style={{ fontSize: '12px' }}>
          • Click territory markers to select them<br/>
          • Numbers show army count<br/>
          • Colors indicate territory owner<br/>
          • Info panel shows connections
        </div>
      </div>
    </div>
  );
};

export default SimpleRiskBoard;