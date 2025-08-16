export interface GameState {
  roomId: string;
  players: GamePlayer[];
  currentPlayer: string;
  phase: 'setup' | 'reinforcement' | 'attack' | 'fortify' | 'finished';
  turn: number;
  board: Territory[];
  cards: Card[];
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
  type: 'deploy' | 'attack' | 'fortify' | 'end_turn' | 'trade_cards';
  roomId: string;
  playerId: string;
  payload: any;
}