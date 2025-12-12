import { Schema, type } from '@colyseus/schema'

/**
 * Territory Schema for Colyseus
 *
 * Note: Fog-of-war filtering is handled at the Room level using
 * onStateFilter() rather than @filter decorators (changed in Schema v3)
 */
export class Territory extends Schema {
  @type('string') id: string = ''
  @type('string') name: string = ''
  @type('string') sector: string = ''
  @type('string') ownerId: string = '' // empty = neutral
  @type('number') armies: number = 0
  @type('boolean') hasCapital: boolean = false

  // Coordinates for rendering
  @type('number') armyPositionX: number = 0
  @type('number') armyPositionY: number = 0
}
