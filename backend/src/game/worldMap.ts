import classicMap from '../../../shared/maps/territories-classic.json'
import type { ContinentBonus, Territory } from '../types/game'

type ClassicMap = {
  continents: Record<
    string,
    {
      name: string
      bonus: number
      color?: string
    }
  >
  territories: Record<
    string,
    {
      id: string
      name: string
      continent: string
      adjacentTerritories: string[]
      armyPosition: { x: number; y: number }
    }
  >
}

const mapData = classicMap as ClassicMap

export class WorldMap {
  private readonly territories: Territory[]
  private readonly continentBonuses: ContinentBonus[]

  constructor() {
    const continentTerritories = new Map<string, string[]>()
    const territories: Territory[] = []

    Object.values(mapData.territories).forEach((territory) => {
      const rawContinentId = territory.continent
      const normalizedContinentId = rawContinentId.replace(/_/g, '-')
      const entry = continentTerritories.get(rawContinentId) ?? []
      entry.push(territory.id)
      continentTerritories.set(rawContinentId, entry)

      territories.push({
        id: territory.id,
        name: territory.name,
        continent: normalizedContinentId,
        ownerId: null,
        armies: 0,
        adjacentTerritories: [...territory.adjacentTerritories],
        coordinates: {
          x: territory.armyPosition.x,
          y: territory.armyPosition.y,
        },
      })
    })

    this.territories = territories

    this.continentBonuses = Object.entries(mapData.continents).map(([continentId, data]) => ({
      id: continentId.replace(/_/g, '-'),
      name: data.name,
      bonusArmies: data.bonus,
      territories: continentTerritories.get(continentId) ?? [],
    }))
  }

  getTerritories(): Territory[] {
    return this.territories.map((territory) => ({
      ...territory,
      adjacentTerritories: [...territory.adjacentTerritories],
      coordinates: territory.coordinates ? { ...territory.coordinates } : undefined,
    }))
  }

  getContinentBonuses(): ContinentBonus[] {
    return this.continentBonuses.map((continent) => ({
      id: continent.id,
      name: continent.name,
      bonusArmies: continent.bonusArmies,
      territories: [...continent.territories],
    }))
  }

  getTerritoryById(id: string): Territory | undefined {
    return this.territories.find((territory) => territory.id === id)
  }

  getContinentTerritories(continent: string): Territory[] {
    return this.territories.filter((territory) => territory.continent === continent)
  }

  getContinents(): string[] {
    return [...new Set(this.territories.map((territory) => territory.continent))]
  }
}
