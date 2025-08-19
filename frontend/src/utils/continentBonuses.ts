import { Territory, Player } from '../types/game';

export interface Continent {
  id: string;
  name: string;
  territories: string[];
  bonusArmies: number;
  color: string;
}

// Continent definitions with bonus armies
export const CONTINENTS: Continent[] = [
  {
    id: 'north_america',
    name: 'North America',
    territories: [
      'alaska', 'northwest_territory', 'greenland', 'alberta', 'ontario', 
      'quebec', 'western_united_states', 'eastern_united_states', 'central_america'
    ],
    bonusArmies: 5,
    color: '#4CAF50'
  },
  {
    id: 'south_america', 
    name: 'South America',
    territories: ['venezuela', 'brazil', 'peru', 'argentina'],
    bonusArmies: 2,
    color: '#FF9800'
  },
  {
    id: 'europe',
    name: 'Europe', 
    territories: [
      'iceland', 'great_britain', 'scandinavia', 'ukraine', 'northern_europe',
      'western_europe', 'southern_europe'
    ],
    bonusArmies: 5,
    color: '#2196F3'
  },
  {
    id: 'africa',
    name: 'Africa',
    territories: [
      'north_africa', 'egypt', 'east_africa', 'congo', 'south_africa', 'madagascar'
    ],
    bonusArmies: 3,
    color: '#9C27B0'
  },
  {
    id: 'asia',
    name: 'Asia',
    territories: [
      'ural', 'siberia', 'yakutsk', 'kamchatka', 'irkutsk', 'mongolia', 
      'japan', 'afghanistan', 'china', 'middle_east', 'india', 'siam'
    ],
    bonusArmies: 7,
    color: '#F44336'
  },
  {
    id: 'australia',
    name: 'Australia',
    territories: [
      'indonesia', 'new_guinea', 'western_australia', 'eastern_australia'
    ],
    bonusArmies: 2,
    color: '#FFEB3B'
  }
];

export interface ContinentControl {
  continent: Continent;
  controlled: boolean;
  controlledTerritories: number;
  totalTerritories: number;
  missingTerritories: string[];
}

export interface PlayerContinentStatus {
  playerId: string;
  controlledContinents: ContinentControl[];
  totalBonusArmies: number;
}

/**
 * Calculate which continents a player controls and their bonus armies
 */
export function calculatePlayerContinentStatus(playerId: string, board: Territory[]): PlayerContinentStatus {
  const playerTerritories = board.filter(t => t.ownerId === playerId).map(t => t.id);
  
  const controlledContinents: ContinentControl[] = CONTINENTS.map(continent => {
    const controlledTerritories = continent.territories.filter(terrId => 
      playerTerritories.includes(terrId)
    );
    
    const controlled = controlledTerritories.length === continent.territories.length;
    const missingTerritories = continent.territories.filter(terrId => 
      !playerTerritories.includes(terrId)
    );
    
    return {
      continent,
      controlled,
      controlledTerritories: controlledTerritories.length,
      totalTerritories: continent.territories.length,
      missingTerritories
    };
  });
  
  const totalBonusArmies = controlledContinents
    .filter(cc => cc.controlled)
    .reduce((sum, cc) => sum + cc.continent.bonusArmies, 0);
  
  return {
    playerId,
    controlledContinents,
    totalBonusArmies
  };
}

/**
 * Calculate continent bonuses for all players
 */
export function calculateAllPlayersContinentStatus(players: Player[], board: Territory[]): PlayerContinentStatus[] {
  return players.map(player => calculatePlayerContinentStatus(player.id, board));
}

/**
 * Get continent bonus armies for a specific player
 */
export function getContinentBonusArmies(playerId: string, board: Territory[]): number {
  return calculatePlayerContinentStatus(playerId, board).totalBonusArmies;
}

/**
 * Get continent control summary for UI display
 */
export function getContinentControlSummary(playerId: string, board: Territory[]): string {
  const status = calculatePlayerContinentStatus(playerId, board);
  const controlled = status.controlledContinents.filter(cc => cc.controlled);
  
  if (controlled.length === 0) {
    return 'No continents controlled';
  }
  
  return controlled.map(cc => cc.continent.name).join(', ');
}

/**
 * Find which continent a territory belongs to
 */
export function getTerritoryContinent(territoryId: string): Continent | null {
  return CONTINENTS.find(continent => 
    continent.territories.includes(territoryId)
  ) || null;
}