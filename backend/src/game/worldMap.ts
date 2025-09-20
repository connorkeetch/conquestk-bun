import classicMap from '../../../shared/maps/territories-classic.json'
import type { Territory } from '../types/game'

type ClassicMap = {
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

  constructor() {
    this.territories = Object.values(mapData.territories).map((territory) => ({
      id: territory.id,
      name: territory.name,
      continent: territory.continent,
      ownerId: null,
      armies: 0,
      adjacentTerritories: [...territory.adjacentTerritories],
      coordinates: {
        x: territory.armyPosition.x,
        y: territory.armyPosition.y,
      },
    }))
  }

  getTerritories(): Territory[] {
    return this.territories.map((territory) => ({
      ...territory,
      adjacentTerritories: [...territory.adjacentTerritories],
      coordinates: territory.coordinates
        ? { ...territory.coordinates }
        : undefined,
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
