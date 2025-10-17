import type { GamePlayer, Territory } from '../types/game'

export interface SectorBonusInput {
  id: string
  name: string
  territories: string[]
  bonusArmies: number
  color?: string
}

export interface SectorDefinition extends SectorBonusInput {
  color: string
}

const FALLBACK_COLORS = ['#4CAF50', '#FF9800', '#2196F3', '#9C27B0', '#F44336', '#FFEB3B']

const DEFAULT_SECTOR_DEFINITIONS: SectorDefinition[] = [
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

export interface SectorControl {
  sector: SectorDefinition
  controlled: boolean
  controlledTerritories: number
  totalTerritories: number
  missingTerritories: string[]
}

export interface PlayerSectorStatus {
  playerId: string
  controlledSectors: SectorControl[]
  totalBonusArmies: number
}

export const resolveSectorDefinitions = (
  sectorBonuses?: SectorBonusInput[] | null,
): SectorDefinition[] => {
  if (!sectorBonuses || sectorBonuses.length === 0) {
    return DEFAULT_SECTOR_DEFINITIONS
  }

  return sectorBonuses.map((bonus, index) => ({
    id: bonus.id,
    name: bonus.name,
    territories: [...bonus.territories],
    bonusArmies: bonus.bonusArmies,
    color: bonus.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length],
  }))
}

export function calculatePlayerSectorStatus(
  playerId: string,
  board: Territory[],
  sectorDefinitions: SectorDefinition[] = DEFAULT_SECTOR_DEFINITIONS,
): PlayerSectorStatus {
  const playerTerritories = new Set(
    board.filter((territory) => territory.ownerId === playerId).map((territory) => territory.id),
  )

  const controlledSectors: SectorControl[] = sectorDefinitions.map((sector) => {
    const controlledTerritories = sector.territories.filter((territoryId) =>
      playerTerritories.has(territoryId),
    )

    const controlled = controlledTerritories.length === sector.territories.length
    const missingTerritories = sector.territories.filter(
      (territoryId) => !playerTerritories.has(territoryId),
    )

    return {
      sector,
      controlled,
      controlledTerritories: controlledTerritories.length,
      totalTerritories: sector.territories.length,
      missingTerritories,
    }
  })

  const totalBonusArmies = controlledSectors
    .filter((sectorControl) => sectorControl.controlled)
    .reduce((sum, sectorControl) => sum + sectorControl.sector.bonusArmies, 0)

  return {
    playerId,
    controlledSectors,
    totalBonusArmies,
  }
}

export function calculateAllPlayersSectorStatus(
  players: GamePlayer[],
  board: Territory[],
  sectorDefinitions: SectorDefinition[] = DEFAULT_SECTOR_DEFINITIONS,
): PlayerSectorStatus[] {
  return players.map((player) => calculatePlayerSectorStatus(player.id, board, sectorDefinitions))
}

export function getSectorBonusArmies(
  playerId: string,
  board: Territory[],
  sectorDefinitions: SectorDefinition[] = DEFAULT_SECTOR_DEFINITIONS,
): number {
  return calculatePlayerSectorStatus(playerId, board, sectorDefinitions).totalBonusArmies
}

export function getSectorControlSummary(
  playerId: string,
  board: Territory[],
  sectorDefinitions: SectorDefinition[] = DEFAULT_SECTOR_DEFINITIONS,
): string {
  const status = calculatePlayerSectorStatus(playerId, board, sectorDefinitions)
  const controlled = status.controlledSectors.filter((sector) => sector.controlled)

  if (controlled.length === 0) {
    return 'No sectors controlled'
  }

  return controlled.map((sector) => sector.sector.name).join(', ')
}

export function getTerritorySector(
  territoryId: string,
  sectorDefinitions: SectorDefinition[] = DEFAULT_SECTOR_DEFINITIONS,
): SectorDefinition | null {
  return sectorDefinitions.find((sector) => sector.territories.includes(territoryId)) ?? null
}
