import React, { useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { WorldMapSVG } from './WorldMapSVG';
import { GamePhaseControls } from './GamePhaseControls';
import territoryData from '../data/territories.json';
import { RootState, AppDispatch } from '../store';
import { selectTerritory, selectTargetTerritory, setPendingAction } from '../store/gameSlice';
import { endTurn } from '../store/gameActions';
import { calculateAllPlayersContinentStatus } from '../utils/continentBonuses';

interface TerritoryDisplay {
  id: string;
  name: string;
  continent: string;
  adjacentTerritories: string[];
  armyPosition: { x: number; y: number };
  owner?: string;
  armies?: number;
}

interface RiskGameBoardProps {
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

export const RiskGameBoard: React.FC<RiskGameBoardProps> = ({
  onTerritoryClick,
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const gameState = useSelector((state: RootState) => state.game.currentGame);
  const selectedTerritory = useSelector((state: RootState) => state.game.selectedTerritory);
  const selectedTargetTerritory = useSelector((state: RootState) => state.game.selectedTargetTerritory);
  const validTargets = useSelector((state: RootState) => state.game.validTargets);
  const pendingAction = useSelector((state: RootState) => state.game.pendingAction);
  
  const [hoveredTerritory, setHoveredTerritory] = useState<string | null>(null);
  
  // Early return if no game state
  if (!gameState) {
    return (
      <div className="flex items-center justify-center h-full bg-blue-50 rounded-lg">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-600 mb-2">No Game in Progress</h2>
          <p className="text-gray-500">Join a game room to start playing!</p>
        </div>
      </div>
    );
  }
  
  const territories = createTerritoryDisplayMap(gameState.board, territoryData);
  const players = gameState.players;
  const currentPlayer = gameState.currentPlayer;
  const currentPhase = gameState.phase;
  
  // Calculate continent control status for all players
  const allPlayersContinentStatus = calculateAllPlayersContinentStatus(players, gameState.board);

  const getTerritoryColor = useCallback((territoryId: string): string => {
    const territory = territories[territoryId];
    if (!territory || !territory.owner) {
      return '#E0E0E0'; // Neutral color
    }
    
    const player = players.find(p => p.id === territory.owner);
    return player?.color || '#E0E0E0';
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

  const currentPlayerInfo = players.find(p => p.id === currentPlayer);

  return (
    <div className="flex flex-col h-full bg-blue-50 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-blue-900 text-white p-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold">Risk Game Board</h2>
            <div className="text-sm opacity-75 mt-1">
              Phase: {currentPhase.charAt(0).toUpperCase() + currentPhase.slice(1)} | Turn: {gameState.turn}
            </div>
          </div>
          {currentPlayerInfo && (
            <div className="flex items-center space-x-2">
              <span>Current Turn:</span>
              <div
                className="w-4 h-4 rounded-full border-2 border-white"
                style={{ backgroundColor: currentPlayerInfo.color }}
              ></div>
              <span className="font-semibold">{currentPlayerInfo.username}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Game Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Map Area */}
        <div className="flex-1 relative bg-blue-100 p-4">
          <div className="relative w-full h-full">
            <WorldMapSVG
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
              
              return (
                <div
                  key={`army-${territoryId}`}
                  className="absolute pointer-events-none"
                  style={{
                    left: `${(territory.armyPosition.x / 800) * 100}%`,
                    top: `${(territory.armyPosition.y / 500) * 100}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <div className="bg-white border-2 border-gray-800 rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold shadow-lg">
                    {territory.armies}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-80 bg-white border-l border-gray-300 flex flex-col">
          {/* Game Phase Controls */}
          <div className="p-4 border-b border-gray-200">
            <GamePhaseControls onEndTurn={handleEndTurn} />
          </div>

          {/* Players Legend */}
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold mb-3">Players</h3>
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
                    className={`flex items-center justify-between p-2 rounded ${
                      player.id === currentPlayer ? 'bg-blue-100 border border-blue-300' : ''
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-4 h-4 rounded-full border border-gray-400"
                        style={{ backgroundColor: player.color }}
                      ></div>
                      <span className="font-medium">{player.username}</span>
                    </div>
                    <div className="text-sm text-gray-600">
                      <span>{territoriesOwned} territories</span>
                      <br />
                      <span>{totalArmies} armies</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Game Actions */}
          {(selectedTerritory || pendingAction) && (
            <div className="p-4 border-b border-gray-200 bg-blue-50">
              <h3 className="text-lg font-semibold mb-2">Current Action</h3>
              {selectedTerritory && (
                <div className="mb-2">
                  <span className="text-sm font-medium">Selected: </span>
                  <span className="text-sm">{territories[selectedTerritory]?.name}</span>
                </div>
              )}
              {selectedTargetTerritory && (
                <div className="mb-2">
                  <span className="text-sm font-medium">Target: </span>
                  <span className="text-sm">{territories[selectedTargetTerritory]?.name}</span>
                </div>
              )}
              {pendingAction && (
                <div className="mb-2">
                  <span className="text-sm font-medium">Action: </span>
                  <span className="text-sm capitalize bg-yellow-200 px-2 py-1 rounded">
                    {pendingAction}
                  </span>
                </div>
              )}
              {validTargets.length > 0 && (
                <div className="text-xs text-gray-600">
                  {validTargets.length} valid target(s) available
                </div>
              )}
            </div>
          )}

          {/* Territory Info */}
          {(hoveredTerritory || selectedTerritory) && (
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold mb-2">Territory Info</h3>
              {(() => {
                const territoryId = hoveredTerritory || selectedTerritory;
                const territory = territories[territoryId!];
                const owner = players.find(p => p.id === territory?.owner);
                const continentInfo = territoryData.continents[territory?.continent as keyof typeof territoryData.continents];
                
                return (
                  <div className="space-y-2">
                    <div>
                      <span className="font-medium">{territory?.name}</span>
                    </div>
                    <div className="text-sm text-gray-600">
                      Continent: {continentInfo?.name} (+{continentInfo?.bonus} bonus)
                    </div>
                    {owner && (
                      <div className="flex items-center space-x-2">
                        <span className="text-sm">Owner:</span>
                        <div
                          className="w-3 h-3 rounded-full border border-gray-400"
                          style={{ backgroundColor: owner.color }}
                        ></div>
                        <span className="text-sm font-medium">{owner.username}</span>
                      </div>
                    )}
                    <div className="text-sm">
                      Armies: {territory?.armies || 0}
                    </div>
                    <div className="text-sm text-gray-600">
                      Adjacent to: {territory?.adjacentTerritories.length} territories
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Continent Control Status */}
          <div className="p-4 flex-1 overflow-y-auto">
            <h3 className="text-lg font-semibold mb-3">Continent Control</h3>
            <div className="space-y-3">
              {Object.entries(territoryData.continents).map(([continentId, continent]) => {
                // Find which player controls this continent (if any)
                const controllingPlayer = allPlayersContinentStatus.find(playerStatus =>
                  playerStatus.controlledContinents.some(cc => 
                    cc.continent.id === continentId && cc.controlled
                  )
                );
                
                const continentStatus = controllingPlayer?.controlledContinents.find(cc => 
                  cc.continent.id === continentId
                );

                return (
                  <div
                    key={continentId}
                    className={`p-3 rounded-lg border ${
                      controllingPlayer ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center">
                        <div 
                          className="w-4 h-4 rounded-full mr-2 border border-gray-300"
                          style={{ backgroundColor: continent.color }}
                        />
                        <span className="font-medium">{continent.name}</span>
                      </div>
                      <span className="text-sm font-semibold text-green-600">
                        +{continent.bonus} armies
                      </span>
                    </div>
                    
                    {controllingPlayer ? (
                      <div className="flex items-center text-sm">
                        <div
                          className="w-3 h-3 rounded-full mr-2 border border-gray-400"
                          style={{ 
                            backgroundColor: players.find(p => p.id === controllingPlayer.playerId)?.color 
                          }}
                        />
                        <span className="font-medium">
                          Controlled by {players.find(p => p.id === controllingPlayer.playerId)?.username}
                        </span>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">
                        <div className="mb-1">Not controlled by any player</div>
                        <div className="text-xs">
                          {/* Show partial control status */}
                          {allPlayersContinentStatus.map(playerStatus => {
                            const partialControl = playerStatus.controlledContinents.find(cc => 
                              cc.continent.id === continentId && !cc.controlled && cc.controlledTerritories > 0
                            );
                            
                            if (!partialControl) return null;
                            
                            const player = players.find(p => p.id === playerStatus.playerId);
                            return (
                              <div key={playerStatus.playerId} className="flex items-center mb-1">
                                <div
                                  className="w-2 h-2 rounded-full mr-1 border border-gray-400"
                                  style={{ backgroundColor: player?.color }}
                                />
                                <span>
                                  {player?.username}: {partialControl.controlledTerritories}/{partialControl.totalTerritories}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Total Bonuses Summary */}
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-medium text-blue-800 mb-2">Current Turn Bonuses</h4>
              <div className="space-y-1 text-sm">
                {allPlayersContinentStatus
                  .filter(playerStatus => playerStatus.totalBonusArmies > 0)
                  .map(playerStatus => {
                    const player = players.find(p => p.id === playerStatus.playerId);
                    return (
                      <div key={playerStatus.playerId} className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div
                            className="w-3 h-3 rounded-full mr-2 border border-gray-400"
                            style={{ backgroundColor: player?.color }}
                          />
                          <span>{player?.username}</span>
                        </div>
                        <span className="font-semibold text-green-600">
                          +{playerStatus.totalBonusArmies}
                        </span>
                      </div>
                    );
                  })}
                {allPlayersContinentStatus.every(ps => ps.totalBonusArmies === 0) && (
                  <div className="text-gray-500 italic">No continent bonuses this turn</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};