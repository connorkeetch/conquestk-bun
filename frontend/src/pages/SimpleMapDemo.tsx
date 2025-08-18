import { useState } from 'react';
import { SimpleMapSVG } from '../components/SimpleMapSVG';
import territoryData from '../data/simple-territories.json';

// Demo territory data
const demoTerritories = {
  frozen_wastes: { id: 'frozen_wastes', name: 'Frozen Wastes', continent: 'northern_lands', adjacentTerritories: ['ice_peaks', 'tundra_plains'], armyPosition: { x: 150, y: 80 }, owner: 'player1', armies: 3 },
  ice_peaks: { id: 'ice_peaks', name: 'Ice Peaks', continent: 'northern_lands', adjacentTerritories: ['frozen_wastes', 'tundra_plains', 'mountain_pass'], armyPosition: { x: 300, y: 80 }, owner: 'player2', armies: 5 },
  tundra_plains: { id: 'tundra_plains', name: 'Tundra Plains', continent: 'northern_lands', adjacentTerritories: ['frozen_wastes', 'ice_peaks', 'forest_realm', 'mountain_pass'], armyPosition: { x: 225, y: 140 }, owner: 'player1', armies: 2 },
  forest_realm: { id: 'forest_realm', name: 'Forest Realm', continent: 'central_kingdoms', adjacentTerritories: ['tundra_plains', 'mountain_pass', 'river_valley', 'crystal_caverns'], armyPosition: { x: 150, y: 200 }, owner: 'player3', armies: 4 },
  mountain_pass: { id: 'mountain_pass', name: 'Mountain Pass', continent: 'central_kingdoms', adjacentTerritories: ['ice_peaks', 'tundra_plains', 'forest_realm', 'golden_fields', 'dragon_spine'], armyPosition: { x: 300, y: 200 }, owner: 'player2', armies: 6 },
  river_valley: { id: 'river_valley', name: 'River Valley', continent: 'central_kingdoms', adjacentTerritories: ['forest_realm', 'crystal_caverns', 'coastal_haven'], armyPosition: { x: 75, y: 260 }, owner: 'player3', armies: 1 },
  golden_fields: { id: 'golden_fields', name: 'Golden Fields', continent: 'central_kingdoms', adjacentTerritories: ['mountain_pass', 'dragon_spine', 'trade_crossroads'], armyPosition: { x: 375, y: 260 }, owner: 'player4', armies: 3 },
  crystal_caverns: { id: 'crystal_caverns', name: 'Crystal Caverns', continent: 'southern_realms', adjacentTerritories: ['forest_realm', 'river_valley', 'coastal_haven', 'burning_sands'], armyPosition: { x: 150, y: 320 }, owner: 'player3', armies: 2 },
  coastal_haven: { id: 'coastal_haven', name: 'Coastal Haven', continent: 'southern_realms', adjacentTerritories: ['river_valley', 'crystal_caverns', 'burning_sands'], armyPosition: { x: 75, y: 380 }, owner: 'player1', armies: 4 },
  burning_sands: { id: 'burning_sands', name: 'Burning Sands', continent: 'southern_realms', adjacentTerritories: ['crystal_caverns', 'coastal_haven', 'trade_crossroads', 'jade_peaks'], armyPosition: { x: 225, y: 380 }, owner: 'player4', armies: 2 },
  trade_crossroads: { id: 'trade_crossroads', name: 'Trade Crossroads', continent: 'southern_realms', adjacentTerritories: ['golden_fields', 'burning_sands', 'dragon_spine', 'jade_peaks', 'mystic_isles'], armyPosition: { x: 375, y: 380 }, owner: 'player4', armies: 7 },
  dragon_spine: { id: 'dragon_spine', name: 'Dragon Spine', continent: 'eastern_empire', adjacentTerritories: ['mountain_pass', 'golden_fields', 'trade_crossroads', 'jade_peaks', 'mystic_isles'], armyPosition: { x: 450, y: 260 }, owner: 'player2', armies: 5 },
  jade_peaks: { id: 'jade_peaks', name: 'Jade Peaks', continent: 'eastern_empire', adjacentTerritories: ['burning_sands', 'trade_crossroads', 'dragon_spine', 'mystic_isles'], armyPosition: { x: 450, y: 350 }, owner: 'player4', armies: 3 },
  mystic_isles: { id: 'mystic_isles', name: 'Mystic Isles', continent: 'eastern_empire', adjacentTerritories: ['trade_crossroads', 'dragon_spine', 'jade_peaks'], armyPosition: { x: 525, y: 320 }, owner: 'player2', armies: 1 }
};

const demoPlayers = [
  { id: 'player1', username: 'IceQueen', color: '#3B82F6' },
  { id: 'player2', username: 'DragonLord', color: '#EF4444' },
  { id: 'player3', username: 'ForestWarden', color: '#10B981' },
  { id: 'player4', username: 'DesertKing', color: '#F59E0B' }
];

export default function SimpleMapDemo() {
  const [selectedTerritory, setSelectedTerritory] = useState<string | null>(null);
  const [hoveredTerritory, setHoveredTerritory] = useState<string | null>(null);
  const [selectedTargetTerritory, setSelectedTargetTerritory] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const getTerritoryColor = (territoryId: string): string => {
    const territory = demoTerritories[territoryId as keyof typeof demoTerritories];
    if (!territory?.owner) return '#F5F5F5';
    
    const player = demoPlayers.find(p => p.id === territory.owner);
    return player?.color || '#F5F5F5';
  };

  const handleTerritoryClick = (territoryId: string) => {
    if (selectedTerritory === territoryId) {
      setSelectedTerritory(null);
      setSelectedTargetTerritory(null);
      setPendingAction(null);
    } else if (selectedTerritory && selectedTerritory !== territoryId) {
      setSelectedTargetTerritory(territoryId);
      setPendingAction('attack');
    } else {
      setSelectedTerritory(territoryId);
      setSelectedTargetTerritory(null);
      setPendingAction(null);
    }
  };

  const getValidTargets = (): string[] => {
    if (!selectedTerritory) return [];
    const territory = demoTerritories[selectedTerritory as keyof typeof demoTerritories];
    if (!territory) return [];
    
    // Return adjacent territories owned by different players
    return territory.adjacentTerritories.filter(adjId => {
      const adjTerritory = demoTerritories[adjId as keyof typeof demoTerritories];
      return adjTerritory && adjTerritory.owner !== territory.owner;
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 to-blue-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">🏰 Fantasy Realms - Simple Map Demo</h1>
          <p className="text-lg text-gray-600">Interactive 14-territory Risk-style game map</p>
          <div className="mt-4 p-4 bg-white rounded-lg shadow-md">
            <p className="text-sm text-gray-700">
              <strong>Instructions:</strong> Click territories to select them. 
              Click adjacent enemy territories to attack. Hover for territory names.
            </p>
          </div>
        </div>

        {/* Map Section */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {/* Main Map */}
          <div className="xl:col-span-3">
            <div className="bg-white rounded-xl shadow-lg p-6 h-[600px]">
              <SimpleMapSVG
                territories={demoTerritories}
                onTerritoryClick={handleTerritoryClick}
                onTerritoryHover={setHoveredTerritory}
                getTerritoryColor={getTerritoryColor}
                hoveredTerritory={hoveredTerritory}
                selectedTerritory={selectedTerritory}
                selectedTargetTerritory={selectedTargetTerritory}
                validTargets={getValidTargets()}
                pendingAction={pendingAction}
              />
              
              {/* Army Count Overlays */}
              {Object.entries(demoTerritories).map(([territoryId, territory]) => (
                <div
                  key={`army-${territoryId}`}
                  className="absolute pointer-events-none"
                  style={{
                    position: 'relative',
                    left: `${(territory.armyPosition.x / 600) * 100}%`,
                    top: `${(territory.armyPosition.y / 450) * 100}%`,
                    transform: 'translate(-50%, -50%)',
                    marginTop: '-500px', // Adjust based on map height
                  }}
                >
                  <div className="bg-white border-2 border-gray-800 rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold shadow-lg">
                    {territory.armies}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Info Panel */}
          <div className="space-y-6">
            {/* Players */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                👥 Players
              </h3>
              <div className="space-y-3">
                {demoPlayers.map((player) => {
                  const territoriesOwned = Object.values(demoTerritories).filter(
                    t => t.owner === player.id
                  ).length;
                  const totalArmies = Object.values(demoTerritories)
                    .filter(t => t.owner === player.id)
                    .reduce((sum, t) => sum + t.armies, 0);

                  return (
                    <div
                      key={player.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-gray-50"
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className="w-5 h-5 rounded-full border-2 border-gray-400"
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

            {/* Selected Territory Info */}
            {(selectedTerritory || hoveredTerritory) && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  🏯 Territory Info
                </h3>
                {(() => {
                  const territoryId = hoveredTerritory || selectedTerritory;
                  const territory = demoTerritories[territoryId! as keyof typeof demoTerritories];
                  const owner = demoPlayers.find(p => p.id === territory?.owner);
                  const continentInfo = territoryData.continents[territory?.continent as keyof typeof territoryData.continents];
                  
                  return (
                    <div className="space-y-3">
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <span className="font-bold text-lg">{territory?.name}</span>
                      </div>
                      <div className="text-sm p-2 bg-gray-50 rounded">
                        <strong>Continent:</strong> {continentInfo?.name} 
                        <span className="text-green-600 font-semibold"> (+{continentInfo?.bonus} bonus)</span>
                      </div>
                      {owner && (
                        <div className="flex items-center space-x-2 p-2 bg-gray-50 rounded">
                          <span className="text-sm font-medium">Ruler:</span>
                          <div
                            className="w-4 h-4 rounded-full border border-gray-400"
                            style={{ backgroundColor: owner.color }}
                          ></div>
                          <span className="text-sm font-bold">{owner.username}</span>
                        </div>
                      )}
                      <div className="flex justify-between p-2 bg-gray-50 rounded">
                        <span className="text-sm">
                          <strong>Armies:</strong> {territory?.armies}
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

            {/* Current Action */}
            {(selectedTerritory || pendingAction) && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl shadow-lg p-6">
                <h3 className="text-xl font-bold mb-4 text-yellow-800 flex items-center gap-2">
                  ⚔️ Current Action
                </h3>
                {selectedTerritory && (
                  <div className="mb-2 p-2 bg-white rounded border">
                    <span className="text-sm font-medium text-blue-600">Selected: </span>
                    <span className="text-sm font-semibold">{demoTerritories[selectedTerritory as keyof typeof demoTerritories]?.name}</span>
                  </div>
                )}
                {selectedTargetTerritory && (
                  <div className="mb-2 p-2 bg-white rounded border">
                    <span className="text-sm font-medium text-red-600">Target: </span>
                    <span className="text-sm font-semibold">{demoTerritories[selectedTargetTerritory as keyof typeof demoTerritories]?.name}</span>
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
                {getValidTargets().length > 0 && (
                  <div className="text-xs text-gray-600 bg-green-100 p-2 rounded">
                    {getValidTargets().length} valid target(s) available
                  </div>
                )}
              </div>
            )}

            {/* Continent Bonuses */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                🏆 Realm Bonuses
              </h3>
              <div className="space-y-3">
                {Object.entries(territoryData.continents).map(([continentId, continent]) => (
                  <div
                    key={continentId}
                    className="p-3 rounded-lg border border-gray-200 bg-gray-50"
                  >
                    <div className="font-medium">{continent.name}</div>
                    <div className="text-sm text-green-600 font-semibold">+{continent.bonus} armies per turn</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}