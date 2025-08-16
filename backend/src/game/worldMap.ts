import { Territory } from '../types/game';

export class WorldMap {
  private territories: Territory[] = [
    {
      id: 'alaska',
      name: 'Alaska',
      continent: 'north-america',
      ownerId: null,
      armies: 0,
      adjacentTerritories: ['northwest-territory', 'alberta', 'kamchatka']
    },
    {
      id: 'northwest-territory',
      name: 'Northwest Territory',
      continent: 'north-america',
      ownerId: null,
      armies: 0,
      adjacentTerritories: ['alaska', 'alberta', 'ontario', 'greenland']
    },
    {
      id: 'alberta',
      name: 'Alberta',
      continent: 'north-america',
      ownerId: null,
      armies: 0,
      adjacentTerritories: ['alaska', 'northwest-territory', 'ontario', 'western-united-states']
    },
    {
      id: 'ontario',
      name: 'Ontario',
      continent: 'north-america',
      ownerId: null,
      armies: 0,
      adjacentTerritories: ['northwest-territory', 'alberta', 'western-united-states', 'eastern-united-states', 'quebec', 'greenland']
    },
    {
      id: 'greenland',
      name: 'Greenland',
      continent: 'north-america',
      ownerId: null,
      armies: 0,
      adjacentTerritories: ['northwest-territory', 'ontario', 'quebec', 'iceland']
    },
    {
      id: 'eastern-united-states',
      name: 'Eastern United States',
      continent: 'north-america',
      ownerId: null,
      armies: 0,
      adjacentTerritories: ['ontario', 'western-united-states', 'quebec', 'central-america']
    },
    {
      id: 'western-united-states',
      name: 'Western United States',
      continent: 'north-america',
      ownerId: null,
      armies: 0,
      adjacentTerritories: ['alberta', 'ontario', 'eastern-united-states', 'central-america']
    },
    {
      id: 'central-america',
      name: 'Central America',
      continent: 'north-america',
      ownerId: null,
      armies: 0,
      adjacentTerritories: ['western-united-states', 'eastern-united-states', 'venezuela']
    },
    {
      id: 'quebec',
      name: 'Quebec',
      continent: 'north-america',
      ownerId: null,
      armies: 0,
      adjacentTerritories: ['ontario', 'eastern-united-states', 'greenland']
    }
  ];

  getTerritories(): Territory[] {
    return this.territories.map(territory => ({ ...territory }));
  }

  getTerritoryById(id: string): Territory | undefined {
    return this.territories.find(territory => territory.id === id);
  }

  getContinentTerritories(continent: string): Territory[] {
    return this.territories.filter(territory => territory.continent === continent);
  }

  getContinents(): string[] {
    return [...new Set(this.territories.map(territory => territory.continent))];
  }
}