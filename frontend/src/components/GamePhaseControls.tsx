import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store';
import { deployArmies, executeAttack, executeFortify } from '../store/gameActions';
import { selectTerritory, selectTargetTerritory, setPendingAction, setBattleResult } from '../store/gameSlice';
import { BattleModal } from './BattleModal';

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
    
    // TODO: Add continent bonuses
    // const continentBonuses = calculateContinentBonuses(currentPlayer.id);
    
    return baseArmies;
  };

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
      <div className="bg-gray-100 border rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-2 text-gray-600">Waiting for Turn</h3>
        <p className="text-sm text-gray-500">
          It's {gameState.players.find(p => p.id === gameState.currentPlayer)?.username}'s turn
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border rounded-lg p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">
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
          <div className="bg-green-50 p-3 rounded border">
            <h4 className="font-medium text-green-800 mb-2">Deploy New Armies</h4>
            <p className="text-sm text-green-700 mb-3">
              You have {calculateReinforcementArmies()} new armies to deploy this turn
            </p>
            
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
                    className="w-20 px-2 py-1 border rounded text-center"
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
              <p className="text-sm text-green-600">
                Click on one of your territories to deploy armies
              </p>
            )}
          </div>
        </div>
      )}

      {/* Attack Phase Controls */}
      {gameState.phase === 'attack' && (
        <div className="space-y-3">
          <div className="bg-red-50 p-3 rounded border">
            <h4 className="font-medium text-red-800 mb-2">Attack Territories</h4>
            
            {!selectedTerritory ? (
              <p className="text-sm text-red-600">
                Select one of your territories with 2+ armies to attack from
              </p>
            ) : !selectedTargetTerritory ? (
              <div className="space-y-2">
                <p className="text-sm">
                  Attacking from: <strong>{selectedTerritoryData?.name}</strong> 
                  ({selectedTerritoryData?.armies} armies)
                </p>
                <p className="text-sm text-red-600">
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
          <div className="bg-blue-50 p-3 rounded border">
            <h4 className="font-medium text-blue-800 mb-2">Fortify Territories</h4>
            
            {!selectedTerritory ? (
              <p className="text-sm text-blue-600">
                Select one of your territories with 2+ armies to move armies from
              </p>
            ) : !selectedTargetTerritory ? (
              <div className="space-y-2">
                <p className="text-sm">
                  Moving from: <strong>{selectedTerritoryData?.name}</strong> 
                  ({selectedTerritoryData?.armies} armies)
                </p>
                <p className="text-sm text-blue-600">
                  {validTargets.length > 0 
                    ? `Select an adjacent territory you own (${validTargets.length} available)`
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
                    className="w-20 px-2 py-1 border rounded text-center"
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
        <div className="text-xs text-gray-500 pt-2 border-t">
          {selectedTerritory && <p>Selected: {selectedTerritoryData?.name}</p>}
          {selectedTargetTerritory && <p>Target: {selectedTargetData?.name}</p>}
          {pendingAction && <p>Action: {pendingAction}</p>}
        </div>
      )}
    </div>
  );
};