import { describe, expect, it } from 'vitest'

import { stableStringify } from '../stableJson.js'

describe('stableStringify', () => {
  it('serializes bigint values as decimal strings', () => {
    expect(stableStringify({ id: 9007199254740993n })).toBe('{"id":"9007199254740993"}')
  })

  it('serializes undefined values as null to guarantee string output', () => {
    expect(stableStringify(undefined)).toBe('null')
  })
})
