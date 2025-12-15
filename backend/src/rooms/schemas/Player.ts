import { ArraySchema, Schema, type } from '@colyseus/schema'

export class Card extends Schema {
  @type('string') id: string = ''
  @type('string') territoryId: string = ''
  @type('string') cardType: string = '' // infantry|cavalry|artillery|wild
}

export class Player extends Schema {
  @type('string') oderId: string = ''
  @type('string') username: string = ''
  @type('string') color: string = ''
  @type('number') teamId: number = 0
  @type('number') playerOrder: number = 0
  @type('boolean') isAi: boolean = false
  @type('string') aiDifficulty: string = '' // recruit|commander|grandmaster
  @type('boolean') isEliminated: boolean = false
  @type('string') eliminationReason: string = '' // defeated|timeout|disconnected|abandoned
  @type('boolean') isReady: boolean = false
  @type('boolean') isConnected: boolean = true
  @type('number') reinforcementArmies: number = 0
  @type([Card]) cards = new ArraySchema<Card>()
  @type('number') timeBankSeconds: number = 0
}
