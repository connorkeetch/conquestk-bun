import React, { useState, useCallback, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { SimpleMapSVG } from './SimpleMapSVG';
import { GamePhaseControls } from './GamePhaseControls';
import { GameOverModal } from './GameOverModal';
import territoryData from '../data/simple-territories.json';
import { RootState, AppDispatch } from '../store';
import { selectTerritory, selectTargetTerritory, setPendingAction } from '../store/gameSlice';
import { endTurn } from '../store/gameActions';

interface TerritoryDisplay {
  id: string;
  name: string;
  continent: string;
  adjacentTerritories: string[];
  armyPosition: { x: number; y: number };
  owner?: string;
  armies?: number;
}

interface SimpleRiskGameBoardProps {
  onTerritoryClick?: (territoryId: string) => void;
}

// Helper function to convert Redux territories to display format
const createTerritoryDisplayMap = (
  territories: any[], 
  territoryData: any
): { [key: string]: TerritoryDisplay } => {
  const displayMap: { [key: string]: TerritoryDisplay } = {};
  
  territories.forEach(territory => {
    const staticData = territoryData.territories[territory.id];
    if (staticData) {
      displayMap[territory.id] = {
        id: territory.id,
        name: staticData.name,
        continent: staticData.continent,
        adjacentTerritories: staticData.adjacentTerritories,
        armyPosition: staticData.armyPosition,
        owner: territory.ownerId,
        armies: territory.armies,
      };
    }
  });
  
  return displayMap;
};

export const SimpleRiskGameBoard: React.FC<SimpleRiskGameBoardProps> = ({
  onTerritoryClick,
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const gameState = useSelector((state: RootState) => state.game.currentGame);
  const selectedTerritory = useSelector((state: RootState) => state.game.selectedTerritory);
  const selectedTargetTerritory = useSelector((state: RootState) => state.game.selectedTargetTerritory);
  const validTargets = useSelector((state: RootState) => state.game.validTargets);
  const pendingAction = useSelector((state: RootState) => state.game.pendingAction);
  
  const [hoveredTerritory, setHoveredTerritory] = useState<string | null>(null);
  const [showGameOverModal, setShowGameOverModal] = useState(false);

  // Monitor for game end state
  useEffect(() => {
    if (gameState?.phase === 'finished') {
      setShowGameOverModal(true);
    }
  }, [gameState?.phase]);
  
  // Early return if no game state
  if (!gameState) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-blue-50 to-green-50 rounded-lg">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-700 mb-4">🏰 Fantasy Realms</h2>
          <p className="text-gray-600 mb-2">No Game in Progress</p>
          <p className="text-gray-500 text-sm">Join a game room to start conquering the realms!</p>
        </div>
      </div>
    );
  }
  
  const territories = createTerritoryDisplayMap(gameState.board, territoryData);
  const players = gameState.players;
  const currentPlayer = gameState.currentPlayer;
  const currentPhase = gameState.phase;

  const getTerritoryColor = useCallback((territoryId: string): string => {
    const territory = territories[territoryId];
    if (!territory || !territory.owner) {
      return '#F5F5F5'; // Neutral color
    }
    
    const player = players.find(p => p.id === territory.owner);
    return player?.color || '#F5F5F5';
  }, [territories, players]);

  const handleTerritoryClick = useCallback((territoryId: string) => {
    // If clicking the same territory, deselect it
    if (selectedTerritory === territoryId) {
      dispatch(selectTerritory(null));
      return;
    }
    
    // If we have a selected territory and this is a valid target, select as target
    if (selectedTerritory && validTargets.includes(territoryId)) {
      dispatch(selectTargetTerritory(territoryId));
      // Set pending action based on current phase
      if (currentPhase === 'reinforcement') {
        dispatch(setPendingAction('deploy'));
      } else if (currentPhase === 'attack') {
        dispatch(setPendingAction('attack'));
      } else if (currentPhase === 'fortify') {
        dispatch(setPendingAction('fortify'));
      }
    } else {
      // Select this territory
      dispatch(selectTerritory(territoryId));
      dispatch(selectTargetTerritory(null));
    }
    
    onTerritoryClick?.(territoryId);
  }, [selectedTerritory, validTargets, currentPhase, dispatch, onTerritoryClick]);

  const handleEndTurn = useCallback(() => {
    dispatch(endTurn());
  }, [dispatch]);

  const handleTerritoryHover = useCallback((territoryId: string | null) => {
    setHoveredTerritory(territoryId);
  }, []);

  const handleCloseGameOverModal = useCallback(() => {
    setShowGameOverModal(false);
  }, []);

  const handleNewGame = useCallback(() => {
    // TODO: Implement new game logic
    console.log('Starting new game...');
    setShowGameOverModal(false);
  }, []);

  const handleBackToMenu = useCallback(() => {
    // TODO: Implement navigation to menu
    console.log('Going back to menu...');
    setShowGameOverModal(false);
  }, []);

  const currentPlayerInfo = players.find(p => p.id === currentPlayer);

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg overflow-hidden shadow-lg">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-900 to-purple-900 text-white p-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              🏰 Fantasy Realms
            </h2>
            <div className="text-sm opacity-75 mt-1">
              Phase: {currentPhase.charAt(0).toUpperCase() + currentPhase.slice(1)} | Turn: {gameState.turn}
            </div>
          </div>
          {currentPlayerInfo && (
            <div className="flex items-center space-x-3">
              <span className="text-sm">Current Turn:</span>
              <div
                className="w-5 h-5 rounded-full border-2 border-white shadow-md"
                style={{ backgroundColor: currentPlayerInfo.color }}
              ></div>
              <span className="font-semibold text-lg">{currentPlayerInfo.username}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Game Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Map Area */}
        <div className="flex-1 relative p-4">
          <div className="relative w-full h-full">
            <SimpleMapSVG
              territories={territories}
              onTerritoryClick={handleTerritoryClick}
              onTerritoryHover={handleTerritoryHover}
              getTerritoryColor={getTerritoryColor}
              hoveredTerritory={hoveredTerritory}
              selectedTerritory={selectedTerritory}
              selectedTargetTerritory={selectedTargetTerritory}
              validTargets={validTargets}
              pendingAction={pendingAction}
            />
            
            {/* Army Count Overlays */}
            {Object.entries(territories).map(([territoryId, territory]) => {
              if (!territory.armies) return null;
              
              const hasMoved = gameState.movementTracking?.[territoryId] || false;
              
              return (
                <div
                  key={`army-${territoryId}`}
                  className="absolute pointer-events-none"
                  style={{
                    left: `${(territory.armyPosition.x / 600) * 100}%`,
                    top: `${(territory.armyPosition.y / 450) * 100}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <div className={`bg-white border-2 rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold shadow-lg ${
                    hasMoved ? 'border-yellow-500 bg-yellow-100' : 'border-gray-800'
                  }`}>
                    {territory.armies}
                    {hasMoved && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-500 rounded-full border border-white">
                        <div className="text-xs text-white font-bold leading-none">✓</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-80 bg-white border-l border-gray-300 flex flex-col shadow-lg">
          {/* Game Phase Controls */}
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <GamePhaseControls onEndTurn={handleEndTurn} />
          </div>

          {/* Players Legend */}
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              👥 Players
            </h3>
            <div className="space-y-2">
              {players.map((player) => {
                const territoriesOwned = Object.values(territories).filter(
                  t => t.owner === player.id
                ).length;
                const totalArmies = Object.values(territories)
                  .filter(t => t.owner === player.id)
                  .reduce((sum, t) => sum + (t.armies || 0), 0);

                return (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between p-3 rounded-lg transition-all ${
                      player.id === currentPlayer 
                        ? 'bg-gradient-to-r from-blue-100 to-purple-100 border-2 border-blue-300' 
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className="w-5 h-5 rounded-full border-2 border-gray-400 shadow-sm"
                        style={{ backgroundColor: player.color }}
                      ></div>
                      <span className="font-medium">{player.username}</span>
                    </div>
                    <div className="text-sm text-gray-600 text-right">
                      <span className="font-medium">{territoriesOwned}</span> realms
                      <br />
                      <span className="font-medium">{totalArmies}</span> armies
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Current Action */}
          {(selectedTerritory || pendingAction) && (
            <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-yellow-50 to-orange-50">
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                ⚔️ Current Action
              </h3>
              {selectedTerritory && (
                <div className="mb-2 p-2 bg-white rounded border">
                  <span className="text-sm font-medium text-blue-600">Selected: </span>
                  <span className="text-sm font-semibold">{territories[selectedTerritory]?.name}</span>
                </div>
              )}
              {selectedTargetTerritory && (
                <div className="mb-2 p-2 bg-white rounded border">
                  <span className="text-sm font-medium text-red-600">Target: </span>
                  <span className="text-sm font-semibold">{territories[selectedTargetTerritory]?.name}</span>
                </div>
              )}
              {pendingAction && (
                <div className="mb-2">
                  <span className="text-sm font-medium">Action: </span>
                  <span className="text-sm font-bold capitalize bg-yellow-200 px-2 py-1 rounded">
                    {pendingAction}
                  </span>
                </div>
              )}
              {validTargets.length > 0 && (
                <div className="text-xs text-gray-600 bg-green-100 p-2 rounded">
                  {validTargets.length} valid target(s) available
                </div>
              )}
            </div>
          )}

          {/* Territory Info */}
          {(hoveredTerritory || selectedTerritory) && (
            <div className="p-4 border-b border-gray-200 bg-blue-50">
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                🏯 Territory Info
              </h3>
              {(() => {
                const territoryId = hoveredTerritory || selectedTerritory;
                const territory = territories[territoryId!];
                const owner = players.find(p => p.id === territory?.owner);
                const continentInfo = territoryData.continents[territory?.continent as keyof typeof territoryData.continents];
                
                return (
                  <div className="space-y-3">
                    <div className="p-3 bg-white rounded-lg">
                      <span className="font-bold text-lg">{territory?.name}</span>
                    </div>
                    <div className="text-sm text-gray-700 p-2 bg-white rounded">
                      <strong>Continent:</strong> {continentInfo?.name} 
                      <span className="text-green-600 font-semibold"> (+{continentInfo?.bonus} bonus)</span>
                    </div>
                    {owner && (
                      <div className="flex items-center space-x-2 p-2 bg-white rounded">
                        <span className="text-sm font-medium">Ruler:</span>
                        <div
                          className="w-4 h-4 rounded-full border border-gray-400"
                          style={{ backgroundColor: owner.color }}
                        ></div>
                        <span className="text-sm font-bold">{owner.username}</span>
                      </div>
                    )}
                    <div className="flex justify-between p-2 bg-white rounded">
                      <span className="text-sm">
                        <strong>Armies:</strong> {territory?.armies || 0}
                      </span>
                      <span className="text-sm text-gray-600">
                        <strong>Borders:</strong> {territory?.adjacentTerritories.length}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Continent Bonuses */}
          <div className="p-4 flex-1 overflow-y-auto">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              🏆 Realm Bonuses
            </h3>
            <div className="space-y-3">
              {Object.entries(territoryData.continents).map(([continentId, continent]) => (
                <div
                  key={continentId}
                  className="p-3 rounded-lg border-2 border-gray-200 bg-gradient-to-r from-white to-gray-50"
                >
                  <div className="font-medium text-gray-800">{continent.name}</div>
                  <div className="text-sm text-green-600 font-semibold">+{continent.bonus} armies per turn</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Game Over Modal */}
      {gameState && (
        <GameOverModal
          isOpen={showGameOverModal}
          winner={gameState.players.find(p => !p.isEliminated) || null}
          eliminatedPlayers={gameState.players.filter(p => p.isEliminated).map(p => p.id)}
          onClose={handleCloseGameOverModal}
          onNewGame={handleNewGame}
          onBackToMenu={handleBackToMenu}
        />
      )}
    </div>
  );
};