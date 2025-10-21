import { describe, expect, it } from '@jest/globals'

import { convertQuestionMarksToPgPlaceholders } from '../config/database.js'

describe('convertQuestionMarksToPgPlaceholders', () => {
  it('preserves json containment operator usage', () => {
    const sql = "SELECT metadata ? 'featured' FROM maps WHERE id = ?"
    const params = ['map-123']

    const converted = convertQuestionMarksToPgPlaceholders(sql, params)

    expect(converted).toBe("SELECT metadata ? 'featured' FROM maps WHERE id = $1")
  })

  it('handles json operator with parameterized key lookup', () => {
    const sql = 'SELECT metadata ? ? FROM maps WHERE owner_id = ?'
    const params = ['featured', 'owner-456']

    const converted = convertQuestionMarksToPgPlaceholders(sql, params)

    expect(converted).toBe('SELECT metadata ? $1 FROM maps WHERE owner_id = $2')
  })

  it('does not rewrite json overlap operator tokens', () => {
    const sql = "SELECT metadata ?| array['featured', 'spotlight'] FROM maps WHERE published = ?"
    const params = [true]

    const converted = convertQuestionMarksToPgPlaceholders(sql, params)

    expect(converted).toBe("SELECT metadata ?| array['featured', 'spotlight'] FROM maps WHERE published = $1")
  })
})
