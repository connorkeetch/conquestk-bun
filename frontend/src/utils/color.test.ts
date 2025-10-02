import { describe, expect, it } from 'vitest'
import {
  colorDistance,
  ensureReadableOnDark,
  getRelativeLuminance,
  hexToRgb,
  isGradientValue,
  pickTextOnColor,
  rgbToHex,
} from './color'

describe('color utils', () => {
  it('hexToRgb and rgbToHex roundtrip', () => {
    const rgb = hexToRgb('#ffffff')
    expect(rgb).toEqual({ r: 255, g: 255, b: 255 })
    expect(rgbToHex(255, 255, 255)).toBe('#ffffff')
  })

  it('relative luminance: white > black', () => {
    const white = getRelativeLuminance('#ffffff')
    const black = getRelativeLuminance('#000000')
    expect(white).toBeGreaterThan(black)
  })

  it('ensureReadableOnDark increases luminance for very dark colors', () => {
    const improved = ensureReadableOnDark('#111111', 0.3)
    expect(getRelativeLuminance(improved)).toBeGreaterThanOrEqual(0.3)
  })

  it('colorDistance detects large difference for black vs white', () => {
    expect(colorDistance('#000000', '#ffffff')).toBeGreaterThan(400)
  })

  it('isGradientValue identifies CSS gradients', () => {
    expect(isGradientValue('linear-gradient(90deg, #000, #fff)')).toBe(true)
    expect(isGradientValue('#ff0000')).toBe(false)
  })

  it('pickTextOnColor chooses contrasting text', () => {
    expect(pickTextOnColor('#ffffff')).toBe('#0f172a')
    expect(pickTextOnColor('#000000')).toBe('#F8FAFC')
  })
})
