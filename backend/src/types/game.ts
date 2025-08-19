export interface GameState {
  roomId: string;
  players: GamePlayer[];
  currentPlayer: string;
  phase: 'setup' | 'reinforcement' | 'attack' | 'fortify' | 'finished';
  turn: number;
  board: Territory[];
  cards: Card[];
  hasAttackedThisTurn?: boolean;
  lastBattleResult?: BattleResult;
  gameConfig: GameConfiguration;
  movementTracking?: { [territoryId: string]: boolean }; // Track territories that have moved this phase
}

export interface GamePlayer {
  id: string;
  username: string;
  color: string;
  armies: number;
  territories: string[];
  cards: Card[];
  isEliminated: boolean;
}

export interface Territory {
  id: string;
  name: string;
  continent: string;
  ownerId: string | null;
  armies: number;
  adjacentTerritories: string[];
}

export interface Card {
  id: string;
  type: 'infantry' | 'cavalry' | 'artillery' | 'wild';
  territory?: string;
}

export interface GameAction {
  type: 'deploy' | 'attack' | 'fortify' | 'end_turn' | 'begin_turn' | 'trade_cards' | 'go_back_to_reinforcement';
  roomId: string;
  playerId: string;
  payload: any;
}

export interface BattleResult {
  attackerDice: number[];
  defenderDice: number[];
  attackerLosses: number;
  defenderLosses: number;
  conquered: boolean;
  fromTerritory: {
    id: string;
    name: string;
    armies: number;
  };
  toTerritory: {
    id: string;
    name: string;
    armies: number;
    ownerId: string;
  };
  gameEnded?: boolean;
  winner?: GamePlayer | null;
  eliminatedPlayers?: string[];
}

export interface GameConfiguration {
  movementType: 'classic_adjacent' | 'adjacent_multi' | 'path_single' | 'path_multi';
  allowTeamPlay?: boolean;
  maxPlayers: number;
  mapId?: string;
  gameMode?: string;
  continentBonuses?: ContinentBonus[];
}

export interface ContinentBonus {
  id: string;
  name: string;
  bonusArmies: number;
  territories: string[];
}

export type MovementType = 'classic_adjacent' | 'adjacent_multi' | 'path_single' | 'path_multi';