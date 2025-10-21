import { describe, expect, it } from 'vitest'

import { stableStringify } from '../stableJson'

describe('stableStringify', () => {
  it('serializes bigint values as decimal strings', () => {
    expect(stableStringify({ id: 9007199254740993n })).toBe('{"id":"9007199254740993"}')
  })
})
