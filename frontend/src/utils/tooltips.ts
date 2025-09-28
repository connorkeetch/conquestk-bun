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
  const mode = cfg.payoutMode || 'triangular'
  if (mode === 'fixed') return 'Treasure rewards a fixed number of troops per set.'
  if (mode === 'classic') return 'Treasure follows classic Risk-style payouts that grow steadily.'
  // triangular or other (shown in UI as Progressive)
  return 'Treasure payouts grow progressively (triangular growth), increasing by +1 more each set.'
}
