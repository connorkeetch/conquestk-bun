import { describe, expect, it } from 'vitest'
import { centerPan, clampPan, makeTransform } from './mapViewSlice'

describe('mapView utils', () => {
  it('makeTransform formats correctly', () => {
    expect(makeTransform(0, 0, 1)).toBe('translate(0px, 0px) scale(1)')
    expect(makeTransform(12.4, -7.9, 1.2)).toBe('translate(12px, -8px) scale(1.2)')
  })

  it('clamps pan to keep 25% visible (basic)', () => {
    const viewport = { w: 1000, h: 800 }
    const image = { w: 1200, h: 800 }
    const scale = 1

    // Far left/up beyond clamp
    let { tx, ty } = clampPan({ tx: -5000, ty: -5000, scale, viewport, image })
    // At least 25% (300x200) must remain visible
    expect(tx).toBeGreaterThanOrEqual(300 - 1200) // minTx = minVisible - scaledW
    expect(ty).toBeGreaterThanOrEqual(200 - 800)

    // Far right/down beyond clamp
    ;({ tx, ty } = clampPan({ tx: 5000, ty: 5000, scale, viewport, image }))
    expect(tx).toBeLessThanOrEqual(1000 - 300) // maxTx = viewport - minVisible
    expect(ty).toBeLessThanOrEqual(800 - 200)
  })

  it('centerPan centers the image', () => {
    const viewport = { w: 1000, h: 800 }
    const image = { w: 1200, h: 600 }
    const scale = 1
    const p = centerPan({ viewport, image, scale })
    expect(p.tx).toBe(Math.round((1000 - 1200) / 2))
    expect(p.ty).toBe(Math.round((800 - 600) / 2))
  })
})
