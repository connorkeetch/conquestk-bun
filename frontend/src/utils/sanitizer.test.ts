import { describe, expect, it } from 'vitest'

import { sanitizeMapData } from './sanitizer'

describe('sanitizeMapData', () => {
  it('sanitizes territory sector fields and drops legacy continent data', () => {
    const sanitized = sanitizeMapData({
      territories: [
        {
          name: '<script>alert(1)</script>',
          sector: '<img src=x onerror=alert(1)>',
          continent: '<b>Northlands</b>',
        },
      ],
    })

    const territory = sanitized?.territories?.[0]
    expect(territory?.name).toBe('')
    expect(territory?.sector).toBe('')
    expect(territory && 'continent' in territory).toBe(false)
  })

  it('ignores legacy continent values when sector is missing', () => {
    const sanitized = sanitizeMapData({
      territories: [
        {
          continent: 'Asia',
        },
      ],
    })

    const territory = sanitized?.territories?.[0]
    expect(territory?.sector).toBe('')
    expect(territory && 'continent' in territory).toBe(false)
  })
})
