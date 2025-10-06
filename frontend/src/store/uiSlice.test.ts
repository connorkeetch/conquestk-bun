import { describe, expect, it } from 'vitest'
import reducer, {
  clearInteraction,
  setEligible,
  setHover,
  setPhase,
  setSelected,
  setTarget,
  type UIState,
} from './uiSlice'

describe('uiSlice interaction state', () => {
  it('initializes with idle phase and empty highlights', () => {
    const initial = reducer(undefined, { type: '@@INIT' }) as UIState
    expect(initial.phase).toBe('idle')
    expect(initial.selectedId).toBeUndefined()
    expect(initial.targetId).toBeUndefined()
    expect(initial.hoverId).toBeUndefined()
    expect(initial.eligibleIds).toEqual([])
  })

  it('sets phase, selection, target, hover and eligible', () => {
    let state = reducer(undefined, { type: '@@INIT' }) as UIState
    state = reducer(state, setPhase('attack'))
    state = reducer(state, setSelected('a'))
    state = reducer(state, setEligible(['b', 'c']))
    state = reducer(state, setHover('b'))
    state = reducer(state, setTarget('c'))
    expect(state.phase).toBe('attack')
    expect(state.selectedId).toBe('a')
    expect(state.eligibleIds).toEqual(['b', 'c'])
    expect(state.hoverId).toBe('b')
    expect(state.targetId).toBe('c')
  })

  it('clears interaction and resets to idle', () => {
    let state = reducer(undefined, { type: '@@INIT' }) as UIState
    state = reducer(state, setPhase('fortify'))
    state = reducer(state, setSelected('x'))
    state = reducer(state, setTarget('y'))
    state = reducer(state, setHover('z'))
    state = reducer(state, setEligible(['k']))
    state = reducer(state, clearInteraction())
    expect(state.phase).toBe('idle')
    expect(state.selectedId).toBeUndefined()
    expect(state.targetId).toBeUndefined()
    expect(state.hoverId).toBeUndefined()
    expect(state.eligibleIds).toEqual([])
  })
})
