import type { TreasureConfig } from '@shared/types'

export const getFogDescription = (mode?: string | null) => {
  switch (mode) {
    case 'adjacent':
      return 'Players can only see territories they own and those adjacent to them.'
    case 'persistent':
      return 'Explored territories remain visible, but enemy armies update only when adjacent.'
    case 'off':
    case undefined:
    case null:
      return 'All territories and armies are visible to everyone.'
    default:
      return 'Fog of war limits visibility of enemy territories and armies.'
  }
}

export const getCardTradeDescription = (mode?: string | null) => {
  if (!mode || mode === 'off') return 'Card trades are disabled.'
  const m = String(mode)
  if (m.includes('fixed')) return 'Card sets trade in for a constant number of troops.'
  if (m.includes('classic'))
    return 'Card set bonuses increase with the number of trades in a classic progression.'
  if (m.includes('escalating') || m.includes('progressive'))
    return 'Card set bonuses escalate over time, increasing each trade.'
  return 'Card trades award bonus troops based on the configured mode.'
}

export const getTreasureDescription = (cfg?: TreasureConfig | null) => {
  if (!cfg || cfg.enabled === false) return 'Treasure cards are disabled.'
  const mode = cfg.payoutMode || 'classic'
  const handCap = typeof cfg.handCap === 'number' ? Math.max(1, Math.trunc(cfg.handCap)) : 5
  const diamondBonus = typeof cfg.diamondSetBonus === 'number' ? Math.max(0, Math.trunc(cfg.diamondSetBonus)) : 0

  const baseText = `Valid sets: one of each (bronze, silver, gold) or three of a kind. Diamonds are wild. Sets with a diamond grant an extra +${diamondBonus} troops. Hand cap: ${handCap}.`

  if (mode === 'fixed') {
    const fixed = typeof cfg.fixedValue === 'number' ? Math.max(1, Math.min(50, Math.trunc(cfg.fixedValue))) : 8
    return `${baseText} Payout mode: Fixed (+${fixed} per set).`
  }
  if (mode === 'classic') {
    return `${baseText} Payout mode: Classic progression (4, 6, 8, 10, 12, 15, 20, 25, 30, 35, then +5 each set).`
  }
  // triangular or other (shown in UI as Progressive)
  return `${baseText} Payout mode: Progressive (triangular growth: 4, 6, 9, 13, 18, …).`
}
