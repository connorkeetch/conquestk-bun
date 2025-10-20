import type { DbMove, FogView } from '../logEmitter.js'
import { renderLogText } from '../logEmitter.js'

const baseFog: FogView = {
  canSeeFrom: true,
  canSeeTo: true,
  showCounts: true,
  fogActive: false,
}

describe('renderLogText', () => {
  it('formats attack moves with stacks, player names, and conquest context', () => {
    const move: DbMove = {
      id: 'atk-1',
      game_id: 'g1',
      turn_number: 3,
      phase: 'attack',
      move_type: 'attack',
      actor_id: 'attacker',
      created_at: new Date(),
      payload: {
        actorName: 'test2',
        fromId: 'egypt',
        toId: 'e-africa',
        fromName: 'Egypt',
        toName: 'E. Africa',
        fromOwnerName: 'test2',
        toOwnerName: 'Keetch',
        defenderName: 'Keetch',
        kills: 2,
        losses: 0,
        initialFromArmies: 4,
        initialToArmies: 2,
        conquered: true,
      },
    }

    const text = renderLogText(move, baseFog)
    expect(text).toBe(
      'Egypt (test2 · 4) assaulted E. Africa (Keetch · 2) conquering it, killing 2, losing 0.',
    )
  })

  it('includes occupying troop counts for conquest moves', () => {
    const move: DbMove = {
      id: 'conq-1',
      game_id: 'g1',
      turn_number: 3,
      phase: 'attack',
      move_type: 'conquer',
      actor_id: 'attacker',
      created_at: new Date(),
      payload: {
        actorName: 'test2',
        fromId: 'egypt',
        toId: 'e-africa',
        fromName: 'Egypt',
        toName: 'E. Africa',
        fromOwnerName: 'test2',
        occupyArmies: 12,
      },
    }

    const text = renderLogText(move, baseFog)
    expect(text).toBe('Egypt (test2) conquered E. Africa. Occupied E. Africa with 12 troops.')
  })

  it('formats reinforcement deployments with actor names', () => {
    const move: DbMove = {
      id: 'rein-1',
      game_id: 'g1',
      turn_number: 3,
      phase: 'reinforcement',
      move_type: 'reinforce',
      actor_id: 'joey',
      created_at: new Date(),
      payload: {
        actorName: 'JoeySe7en',
        toId: 'xxxiv',
        toName: 'XXXIV',
        toOwnerName: 'JoeySe7en',
        armies: 3,
      },
    }

    const text = renderLogText(move, baseFog)
    expect(text).toBe('JoeySe7en deployed 3 troops to XXXIV (JoeySe7en).')
  })

  it('formats sector bonuses as troop grants', () => {
    const move: DbMove = {
      id: 'bonus-1',
      game_id: 'g1',
      turn_number: 3,
      phase: 'reinforcement',
      move_type: 'bonus',
      actor_id: 'joey',
      created_at: new Date(),
      payload: {
        actorName: 'JoeySe7en',
        bonus: 2,
        sector: 'Britannia',
      },
    }

    const text = renderLogText(move, baseFog)
    expect(text).toBe('JoeySe7en received 2 troops for holding Britannia.')
  })

  it('formats start of turn reinforcements summary', () => {
    const move: DbMove = {
      id: 'start-1',
      game_id: 'g1',
      turn_number: 4,
      phase: 'reinforcement',
      move_type: 'start_turn',
      actor_id: 'joey',
      created_at: new Date(),
      payload: {
        actorName: 'JoeySe7en',
        reinforcements: 11,
        territories: 35,
      },
    }

    const text = renderLogText(move, baseFog)
    expect(text).toBe('JoeySe7en received 11 troops for 35 territories.')
  })
})
