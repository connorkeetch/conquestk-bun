import type { GamePlayer, Territory } from '../types/game'

export interface ContinentBonusInput {
  id: string
  name: string
  territories: string[]
  bonusArmies: number
  color?: string
}

export interface ContinentDefinition extends ContinentBonusInput {
  color: string
}

const FALLBACK_COLORS = ['#4CAF50', '#FF9800', '#2196F3', '#9C27B0', '#F44336', '#FFEB3B']

const DEFAULT_CONTINENT_DEFINITIONS: ContinentDefinition[] = [
  {
    id: 'north_america',
    name: 'North America',
    territories: [
      'alaska',
      'northwest_territory',
      'greenland',
      'alberta',
      'ontario',
      'quebec',
      'western_united_states',
      'eastern_united_states',
      'central_america',
    ],
    bonusArmies: 5,
    color: '#4CAF50',
  },
  {
    id: 'south_america',
    name: 'South America',
    territories: ['venezuela', 'brazil', 'peru', 'argentina'],
    bonusArmies: 2,
    color: '#FF9800',
  },
  {
    id: 'europe',
    name: 'Europe',
    territories: [
      'iceland',
      'great_britain',
      'scandinavia',
      'ukraine',
      'northern_europe',
      'western_europe',
      'southern_europe',
    ],
    bonusArmies: 5,
    color: '#2196F3',
  },
  {
    id: 'africa',
    name: 'Africa',
    territories: ['north_africa', 'egypt', 'east_africa', 'congo', 'south_africa', 'madagascar'],
    bonusArmies: 3,
    color: '#9C27B0',
  },
  {
    id: 'asia',
    name: 'Asia',
    territories: [
      'ural',
      'siberia',
      'yakutsk',
      'kamchatka',
      'irkutsk',
      'mongolia',
      'japan',
      'afghanistan',
      'china',
      'middle_east',
      'india',
      'siam',
    ],
    bonusArmies: 7,
    color: '#F44336',
  },
  {
    id: 'australia',
    name: 'Australia',
    territories: ['indonesia', 'new_guinea', 'western_australia', 'eastern_australia'],
    bonusArmies: 2,
    color: '#FFEB3B',
  },
]

export interface ContinentControl {
  continent: ContinentDefinition
  controlled: boolean
  controlledTerritories: number
  totalTerritories: number
  missingTerritories: string[]
}

export interface PlayerContinentStatus {
  playerId: string
  controlledContinents: ContinentControl[]
  totalBonusArmies: number
}

export const resolveContinentDefinitions = (
  continentBonuses?: ContinentBonusInput[] | null,
): ContinentDefinition[] => {
  if (!continentBonuses || continentBonuses.length === 0) {
    return DEFAULT_CONTINENT_DEFINITIONS
  }

  return continentBonuses.map((bonus, index) => ({
    id: bonus.id,
    name: bonus.name,
    territories: [...bonus.territories],
    bonusArmies: bonus.bonusArmies,
    color: bonus.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length],
  }))
}

export function calculatePlayerContinentStatus(
  playerId: string,
  board: Territory[],
  continentDefinitions: ContinentDefinition[] = DEFAULT_CONTINENT_DEFINITIONS,
): PlayerContinentStatus {
  const playerTerritories = new Set(
    board.filter((territory) => territory.ownerId === playerId).map((territory) => territory.id),
  )

  const controlledContinents: ContinentControl[] = continentDefinitions.map((continent) => {
    const controlledTerritories = continent.territories.filter((territoryId) =>
      playerTerritories.has(territoryId),
    )

    const controlled = controlledTerritories.length === continent.territories.length
    const missingTerritories = continent.territories.filter(
      (territoryId) => !playerTerritories.has(territoryId),
    )

    return {
      continent,
      controlled,
      controlledTerritories: controlledTerritories.length,
      totalTerritories: continent.territories.length,
      missingTerritories,
    }
  })

  const totalBonusArmies = controlledContinents
    .filter((continentControl) => continentControl.controlled)
    .reduce((sum, continentControl) => sum + continentControl.continent.bonusArmies, 0)

  return {
    playerId,
    controlledContinents,
    totalBonusArmies,
  }
}

export function calculateAllPlayersContinentStatus(
  players: GamePlayer[],
  board: Territory[],
  continentDefinitions: ContinentDefinition[] = DEFAULT_CONTINENT_DEFINITIONS,
): PlayerContinentStatus[] {
  return players.map((player) =>
    calculatePlayerContinentStatus(player.id, board, continentDefinitions),
  )
}

export function getContinentBonusArmies(
  playerId: string,
  board: Territory[],
  continentDefinitions: ContinentDefinition[] = DEFAULT_CONTINENT_DEFINITIONS,
): number {
  return calculatePlayerContinentStatus(playerId, board, continentDefinitions).totalBonusArmies
}

export function getContinentControlSummary(
  playerId: string,
  board: Territory[],
  continentDefinitions: ContinentDefinition[] = DEFAULT_CONTINENT_DEFINITIONS,
): string {
  const status = calculatePlayerContinentStatus(playerId, board, continentDefinitions)
  const controlled = status.controlledContinents.filter((continent) => continent.controlled)

  if (controlled.length === 0) {
    return 'No continents controlled'
  }

  return controlled.map((continent) => continent.continent.name).join(', ')
}

export function getTerritoryContinent(
  territoryId: string,
  continentDefinitions: ContinentDefinition[] = DEFAULT_CONTINENT_DEFINITIONS,
): ContinentDefinition | null {
  return (
    continentDefinitions.find((continent) => continent.territories.includes(territoryId)) ?? null
  )
}
