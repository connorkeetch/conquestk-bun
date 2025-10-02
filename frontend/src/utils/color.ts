// Color utilities shared across the frontend
// Keep functions small and dependency-free for easy reuse and testing

export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max)
}

export const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const normalized = hex.replace('#', '')
  if (normalized.length !== 6) return null
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  if ([r, g, b].some((c) => Number.isNaN(c))) return null
  return { r, g, b }
}

const rgbComponentToHex = (component: number): string => {
  return clamp(Math.round(component), 0, 255).toString(16).padStart(2, '0')
}

export const rgbToHex = (r: number, g: number, b: number): string => {
  return `#${rgbComponentToHex(r)}${rgbComponentToHex(g)}${rgbComponentToHex(b)}`
}

export const hexToRgba = (hex: string, alpha = 1): string => {
  const normalized = hex.replace('#', '')
  if (normalized.length !== 6) return `rgba(220, 38, 38, ${alpha})`
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const mixColors = (hexA: string, hexB: string, amount: number): string => {
  const a = hexToRgb(hexA)
  const b = hexToRgb(hexB)
  if (!a || !b) return hexA
  const ratio = clamp(amount, 0, 1)
  return rgbToHex(a.r + (b.r - a.r) * ratio, a.g + (b.g - a.g) * ratio, a.b + (b.b - a.b) * ratio)
}

export const lightenColor = (hex: string, amount: number): string => {
  return mixColors(hex, '#FFFFFF', amount)
}

export const getRelativeLuminance = (hex: string): number => {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const transform = (channel: number) => {
    const srgb = channel / 255
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  }
  const r = transform(rgb.r)
  const g = transform(rgb.g)
  const b = transform(rgb.b)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export const ensureReadableOnDark = (hex: string, minLuminance = 0.3): string => {
  const base = getRelativeLuminance(hex)
  if (base >= minLuminance) return hex
  const adjustments = [0.35, 0.55, 0.75]
  for (const amt of adjustments) {
    const candidate = lightenColor(hex, amt)
    if (getRelativeLuminance(candidate) >= minLuminance) return candidate
  }
  return lightenColor(hex, 0.85)
}

export const isGradientValue = (value: string): boolean => {
  return value.startsWith('linear-gradient') || value.startsWith('radial-gradient')
}

export const extractFirstHexColor = (value: string): string | null => {
  const match = value.match(/#([0-9a-fA-F]{6})/)
  return match ? `#${match[1]}` : null
}

export const colorDistance = (hexA: string, hexB: string): number => {
  const a = hexToRgb(hexA)
  const b = hexToRgb(hexB)
  if (!a || !b) return Infinity
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

// Quick text color picker for colored backgrounds
export const pickTextOnColor = (hex: string): '#F8FAFC' | '#0f172a' => {
  return getRelativeLuminance(hex) > 0.55 ? '#0f172a' : '#F8FAFC'
}
