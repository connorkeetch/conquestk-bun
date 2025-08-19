import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store';
import { deployArmies, executeAttack, executeFortify, goBackToReinforcement } from '../store/gameActions';
import { selectTerritory, selectTargetTerritory, setPendingAction, setBattleResult } from '../store/gameSlice';
import { BattleModal } from './BattleModal';
import { getContinentBonusArmies, calculatePlayerContinentStatus } from '../utils/continentBonuses';

interface GamePhaseControlsProps {
  onEndTurn: () => void;
}

export const GamePhaseControls: React.FC<GamePhaseControlsProps> = ({ onEndTurn }) => {
  const dispatch = useDispatch<AppDispatch>();
  const gameState = useSelector((state: RootState) => state.game.currentGame);
  const selectedTerritory = useSelector((state: RootState) => state.game.selectedTerritory);
  const selectedTargetTerritory = useSelector((state: RootState) => state.game.selectedTargetTerritory);
  const pendingAction = useSelector((state: RootState) => state.game.pendingAction);
  const validTargets = useSelector((state: RootState) => state.game.validTargets);
  const battleResult = useSelector((state: RootState) => state.game.battleResult);
  const reinforcementArmiesFromStore = useSelector((state: RootState) => state.game.reinforcementArmies);
  const currentUser = useSelector((state: RootState) => state.auth.user);

  const [reinforcementArmies, setReinforcementArmies] = useState(1);
  const [fortifyArmies, setFortifyArmies] = useState(1);

  if (!gameState || !currentUser) return null;

  const isCurrentPlayerTurn = gameState.currentPlayer === currentUser.id;
  const currentPlayer = gameState.players.find(p => p.id === currentUser.id);
  
  // Calculate reinforcement armies
  const calculateReinforcementArmies = () => {
    if (reinforcementArmiesFromStore > 0) {
      return reinforcementArmiesFromStore;
    }
    
    if (!currentPlayer) return 0;
    
    const territoryCount = gameState.board.filter(t => t.ownerId === currentPlayer.id).length;
    const baseArmies = Math.max(3, Math.floor(territoryCount / 3));
    
    // Add continent bonuses
    const continentBonuses = getContinentBonusArmies(currentPlayer.id, gameState.board);
    
    return baseArmies + continentBonuses;
  };

  // Get detailed continent status for current player
  const currentPlayerContinentStatus = currentPlayer ? 
    calculatePlayerContinentStatus(currentPlayer.id, gameState.board) : null;

  const selectedTerritoryData = selectedTerritory ? 
    gameState.board.find(t => t.id === selectedTerritory) : null;
  const selectedTargetData = selectedTargetTerritory ? 
    gameState.board.find(t => t.id === selectedTargetTerritory) : null;

  const handleDeploy = () => {
    if (selectedTerritory && reinforcementArmies > 0) {
      dispatch(deployArmies({ territoryId: selectedTerritory, armies: reinforcementArmies }));
    }
  };

  const handleAttack = () => {
    if (selectedTerritory && selectedTargetTerritory) {
      dispatch(executeAttack({ 
        fromTerritoryId: selectedTerritory, 
        toTerritoryId: selectedTargetTerritory 
      }));
    }
  };

  const handleFortify = () => {
    if (selectedTerritory && selectedTargetTerritory && fortifyArmies > 0) {
      dispatch(executeFortify({ 
        fromTerritoryId: selectedTerritory, 
        toTerritoryId: selectedTargetTerritory,
        armies: fortifyArmies
      }));
    }
  };

  const handleClearSelection = () => {
    dispatch(selectTerritory(null));
    dispatch(selectTargetTerritory(null));
    dispatch(setPendingAction(null));
  };

  if (!isCurrentPlayerTurn) {
    return (
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-2 text-gray-300">Waiting for Turn</h3>
        <p className="text-sm text-gray-400">
          It's {gameState.players.find(p => p.id === gameState.currentPlayer)?.username}'s turn
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-white">
          {gameState.phase.charAt(0).toUpperCase() + gameState.phase.slice(1)} Phase
        </h3>
        <button
          onClick={onEndTurn}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium"
          disabled={!isCurrentPlayerTurn}
        >
          End Turn
        </button>
      </div>

      {/* Reinforcement Phase Controls */}
      {gameState.phase === 'reinforcement' && (
        <div className="space-y-3">
          <div className="bg-green-900/30 border border-green-600/50 p-3 rounded">
            <h4 className="font-medium text-green-300 mb-2">Deploy New Armies</h4>
            <div className="text-sm text-green-200 mb-3">
              <p className="font-medium mb-2">
                You have {calculateReinforcementArmies()} new armies to deploy this turn
              </p>
              
              {/* Army breakdown */}
              <div className="text-xs space-y-1 bg-green-800/30 p-2 rounded">
                {(() => {
                  if (!currentPlayer) return null;
                  const territoryCount = gameState.board.filter(t => t.ownerId === currentPlayer.id).length;
                  const baseArmies = Math.max(3, Math.floor(territoryCount / 3));
                  const continentBonuses = getContinentBonusArmies(currentPlayer.id, gameState.board);
                  
                  return (
                    <>
                      <div className="flex justify-between">
                        <span>Base armies ({territoryCount} territories):</span>
                        <span>+{baseArmies}</span>
                      </div>
                      {continentBonuses > 0 && (
                        <div className="flex justify-between">
                          <span>Continent bonuses:</span>
                          <span>+{continentBonuses}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-medium border-t border-green-600/50 pt-1">
                        <span>Total:</span>
                        <span>{baseArmies + continentBonuses}</span>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Continent control details */}
              {currentPlayerContinentStatus && currentPlayerContinentStatus.totalBonusArmies > 0 && (
                <div className="mt-2 text-xs">
                  <div className="font-medium text-green-300 mb-1">Controlled Continents:</div>
                  <div className="space-y-1">
                    {currentPlayerContinentStatus.controlledContinents
                      .filter(cc => cc.controlled)
                      .map(cc => (
                        <div key={cc.continent.id} className="flex justify-between items-center">
                          <span className="flex items-center">
                            <div 
                              className="w-3 h-3 rounded-full mr-2" 
                              style={{ backgroundColor: cc.continent.color }}
                            />
                            {cc.continent.name}
                          </span>
                          <span className="font-medium">+{cc.continent.bonusArmies}</span>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
            
            {selectedTerritory ? (
              <div className="space-y-2">
                <p className="text-sm">
                  Deploying to: <strong>{selectedTerritoryData?.name}</strong> 
                  (Current: {selectedTerritoryData?.armies} armies)
                </p>
                <div className="flex items-center space-x-2">
                  <label className="text-sm">Armies to deploy:</label>
                  <input
                    type="number"
                    min="1"
                    max={calculateReinforcementArmies()}
                    value={reinforcementArmies}
                    onChange={(e) => setReinforcementArmies(parseInt(e.target.value) || 1)}
                    className="w-20 px-2 py-1 border border-slate-600 bg-slate-700 text-white rounded text-center"
                  />
                  <button
                    onClick={handleDeploy}
                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm"
                  >
                    Deploy
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-green-400">
                Click on one of your territories to deploy armies
              </p>
            )}
          </div>
        </div>
      )}

      {/* Attack Phase Controls */}
      {gameState.phase === 'attack' && (
        <div className="space-y-3">
          {/* Go Back Button - Only show if no attacks made yet */}
          {!gameState.hasAttackedThisTurn && (
            <div className="bg-yellow-900/30 border border-yellow-600/50 p-2 rounded">
              <button
                onClick={() => dispatch(goBackToReinforcement())}
                className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-sm w-full"
              >
                ← Go Back to Reinforcement Phase
              </button>
              <p className="text-xs text-yellow-300 mt-1">
                You can return to deploy more armies before attacking
              </p>
            </div>
          )}
          
          <div className="bg-red-900/30 border border-red-600/50 p-3 rounded">
            <h4 className="font-medium text-red-300 mb-2">Attack Territories</h4>
            
            {!selectedTerritory ? (
              <p className="text-sm text-red-400">
                Select one of your territories with 2+ armies to attack from
              </p>
            ) : !selectedTargetTerritory ? (
              <div className="space-y-2">
                <p className="text-sm">
                  Attacking from: <strong>{selectedTerritoryData?.name}</strong> 
                  ({selectedTerritoryData?.armies} armies)
                </p>
                <p className="text-sm text-red-400">
                  {validTargets.length > 0 
                    ? `Select a target territory (${validTargets.length} available)`
                    : 'No adjacent enemy territories to attack'
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm">
                  <strong>{selectedTerritoryData?.name}</strong> ({selectedTerritoryData?.armies} armies) 
                  attacking <strong>{selectedTargetData?.name}</strong> ({selectedTargetData?.armies} armies)
                </p>
                <div className="flex space-x-2">
                  <button
                    onClick={handleAttack}
                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
                  >
                    Attack!
                  </button>
                  <button
                    onClick={handleClearSelection}
                    className="bg-gray-400 hover:bg-gray-500 text-white px-3 py-1 rounded text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fortification Phase Controls */}
      {gameState.phase === 'fortify' && (
        <div className="space-y-3">
          {/* Movement Type Info */}
          <div className="bg-indigo-900/30 border border-indigo-600/50 p-2 rounded">
            <div className="text-xs font-medium text-indigo-300 mb-1">Movement Rules:</div>
            <div className="text-xs text-indigo-200">
              {gameState.gameConfig?.movementType === 'classic_adjacent' && 'One territory → Adjacent only (1 move per turn)'}
              {gameState.gameConfig?.movementType === 'adjacent_multi' && 'Multiple territories → Adjacent only'}
              {gameState.gameConfig?.movementType === 'path_single' && 'One territory → Any connected territory (1 move per turn)'}
              {gameState.gameConfig?.movementType === 'path_multi' && 'Multiple territories → Any connected territories'}
            </div>
          </div>
          
          <div className="bg-blue-900/30 border border-blue-600/50 p-3 rounded">
            <h4 className="font-medium text-blue-300 mb-2">Fortify Territories</h4>
            
            {/* Show movement restrictions */}
            {(gameState.gameConfig?.movementType === 'classic_adjacent' || gameState.gameConfig?.movementType === 'path_single') && 
             Object.keys(gameState.movementTracking || {}).length > 0 && (
              <div className="bg-yellow-900/30 border border-yellow-600/50 rounded p-2 mb-3">
                <p className="text-xs text-yellow-300 font-medium">
                  ⚠️ Only one move allowed per fortify phase (already used)
                </p>
              </div>
            )}
            
            {!selectedTerritory ? (
              <div className="space-y-2">
                <p className="text-sm text-blue-400">
                  Select one of your territories with 2+ armies to move armies from
                </p>
                {Object.keys(gameState.movementTracking || {}).length > 0 && (
                  <div className="text-xs text-gray-400">
                    <strong>Already moved:</strong>{' '}
                    {Object.keys(gameState.movementTracking || {}).map(territoryId => {
                      const territory = gameState.board.find(t => t.id === territoryId);
                      return territory?.name;
                    }).join(', ')}
                  </div>
                )}
              </div>
            ) : !selectedTargetTerritory ? (
              <div className="space-y-2">
                <p className="text-sm">
                  Moving from: <strong>{selectedTerritoryData?.name}</strong> 
                  ({selectedTerritoryData?.armies} armies)
                  {gameState.movementTracking?.[selectedTerritory] && (
                    <span className="ml-2 text-xs bg-yellow-200 px-1 rounded">Already moved</span>
                  )}
                </p>
                <p className="text-sm text-blue-400">
                  {validTargets.length > 0 
                    ? `Select a destination territory (${validTargets.length} available)`
                    : gameState.gameConfig?.movementType?.includes('path') 
                      ? 'No connected territories to fortify'
                      : 'No adjacent territories to fortify'
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm">
                  Moving from <strong>{selectedTerritoryData?.name}</strong> ({selectedTerritoryData?.armies} armies) 
                  to <strong>{selectedTargetData?.name}</strong> ({selectedTargetData?.armies} armies)
                </p>
                <div className="flex items-center space-x-2">
                  <label className="text-sm">Armies to move:</label>
                  <input
                    type="number"
                    min="1"
                    max={(selectedTerritoryData?.armies || 1) - 1}
                    value={fortifyArmies}
                    onChange={(e) => setFortifyArmies(parseInt(e.target.value) || 1)}
                    className="w-20 px-2 py-1 border border-slate-600 bg-slate-700 text-white rounded text-center"
                  />
                  <button
                    onClick={handleFortify}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                  >
                    Move
                  </button>
                  <button
                    onClick={handleClearSelection}
                    className="bg-gray-400 hover:bg-gray-500 text-white px-3 py-1 rounded text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Battle Modal */}
      <BattleModal
        isOpen={!!battleResult}
        battleResult={battleResult}
        onClose={() => dispatch(setBattleResult(null))}
        onContinueAttack={
          selectedTerritory && selectedTargetTerritory && 
          battleResult?.fromTerritory?.armies > 1 && 
          !battleResult?.conquered
            ? handleAttack
            : undefined
        }
      />

      {/* Current Selection Info */}
      {(selectedTerritory || selectedTargetTerritory) && (
        <div className="text-xs text-gray-400 pt-2 border-t border-slate-600">
          {selectedTerritory && <p>Selected: {selectedTerritoryData?.name}</p>}
          {selectedTargetTerritory && <p>Target: {selectedTargetData?.name}</p>}
          {pendingAction && <p>Action: {pendingAction}</p>}
        </div>
      )}
    </div>
  );
};