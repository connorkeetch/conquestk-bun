import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from './index'

export type PanelId = 'player-stats' | 'chat' | 'game-log'

// Zones for snap-to-zone system
export type PanelZone = 'sidebar-left' | 'sidebar-right' | 'below-map' | 'drawer'
// Side helper for resize logic
export type PanelSide = 'left' | 'right'

export type PanelLayout = 'vertical-stack' | 'horizontal-row'

export interface PanelConfig {
  id: PanelId
  zone: PanelZone // where it's positioned
  order: number // stacking order within zone
  isMinimized: boolean
  width: number // for sidebars
}

export interface PanelsState {
  panels: Record<PanelId, PanelConfig>
  belowMapLayout: PanelLayout
}

// Default panel configurations
const DEFAULT_PANEL_WIDTH = 360
const MIN_PANEL_WIDTH = 280
const MAX_PANEL_WIDTH = 600

function getDefaultPanels(): Record<PanelId, PanelConfig> {
  return {
    'player-stats': {
      id: 'player-stats',
      zone: 'sidebar-left',
      order: 0,
      isMinimized: false,
      width: DEFAULT_PANEL_WIDTH,
    },
    chat: {
      id: 'chat',
      zone: 'drawer',
      order: 0,
      isMinimized: false,
      width: DEFAULT_PANEL_WIDTH,
    },
    'game-log': {
      id: 'game-log',
      zone: 'drawer',
      order: 1,
      isMinimized: false,
      width: DEFAULT_PANEL_WIDTH,
    },
  }
}

function defaultZoneForPanel(id: PanelId): PanelZone {
  if (id === 'player-stats') return 'sidebar-left'
  if (id === 'chat') return 'sidebar-right'
  return 'sidebar-right'
}

// Load panel layout from localStorage with migration support
function loadPanelLayout(): {
  panels: Record<PanelId, PanelConfig>
  belowMapLayout: PanelLayout
} | null {
  try {
    const stored = localStorage.getItem('conquestk.panel-layout.default')
    if (!stored) return null

    const parsed = JSON.parse(stored) as
      | { version: 1; panels: unknown }
      | { version: 2; panels: Record<PanelId, PanelConfig>; belowMapLayout?: PanelLayout }

    // v2: zone-based
    if ('version' in parsed && parsed.version === 2) {
      return {
        panels: parsed.panels,
        belowMapLayout: parsed.belowMapLayout || 'vertical-stack',
      }
    }

    // v1 -> v2 migration
    if ('version' in parsed && parsed.version === 1) {
      const v1Panels = parsed.panels as Record<
        PanelId,
        {
          id: PanelId
          isPinned: boolean
          isMinimized: boolean
          width: number
          position: 'left' | 'right'
          order: number
        }
      >

      const migrated: Record<PanelId, PanelConfig> = {
        'player-stats': {
          id: 'player-stats',
          zone: v1Panels['player-stats']?.isPinned
            ? v1Panels['player-stats'].position === 'left'
              ? 'sidebar-left'
              : 'sidebar-right'
            : 'drawer',
          order: v1Panels['player-stats']?.order ?? 0,
          isMinimized: v1Panels['player-stats']?.isMinimized ?? false,
          width: v1Panels['player-stats']?.width ?? DEFAULT_PANEL_WIDTH,
        },
        chat: {
          id: 'chat',
          zone: v1Panels.chat?.isPinned
            ? v1Panels.chat.position === 'left'
              ? 'sidebar-left'
              : 'sidebar-right'
            : 'drawer',
          order: v1Panels.chat?.order ?? 0,
          isMinimized: v1Panels.chat?.isMinimized ?? false,
          width: v1Panels.chat?.width ?? DEFAULT_PANEL_WIDTH,
        },
        'game-log': {
          id: 'game-log',
          zone: v1Panels['game-log']?.isPinned
            ? v1Panels['game-log'].position === 'left'
              ? 'sidebar-left'
              : 'sidebar-right'
            : 'drawer',
          order: v1Panels['game-log']?.order ?? 1,
          isMinimized: v1Panels['game-log']?.isMinimized ?? false,
          width: v1Panels['game-log']?.width ?? DEFAULT_PANEL_WIDTH,
        },
      }

      return { panels: migrated, belowMapLayout: 'vertical-stack' }
    }

    return null
  } catch {
    return null
  }
}

// Save panel layout to localStorage
function savePanelLayout(state: PanelsState): void {
  try {
    const data = {
      version: 2,
      panels: state.panels,
      belowMapLayout: state.belowMapLayout,
      lastUpdated: Date.now(),
    }
    localStorage.setItem('conquestk.panel-layout.default', JSON.stringify(data))
  } catch {
    // Ignore storage errors (quota, privacy, SSR)
  }
}

const initialState: PanelsState = (() => {
  const loaded = loadPanelLayout()
  if (loaded) return { panels: loaded.panels, belowMapLayout: loaded.belowMapLayout }
  return { panels: getDefaultPanels(), belowMapLayout: 'vertical-stack' }
})()

function renumberOrdersForZone(panels: Record<PanelId, PanelConfig>, zone: PanelZone) {
  const zonePanels = Object.values(panels)
    .filter((p) => p.zone === zone)
    .sort((a, b) => a.order - b.order)
  zonePanels.forEach((p, idx) => {
    panels[p.id].order = idx
  })
}

const panelsSlice = createSlice({
  name: 'panels',
  initialState,
  reducers: {
    // Convenience action: toggle between drawer and default zone for the panel
    togglePin(state, action: PayloadAction<PanelId>) {
      const panel = state.panels[action.payload]
      if (!panel) return
      const wasDrawer = panel.zone === 'drawer'
      panel.zone = wasDrawer ? defaultZoneForPanel(panel.id) : 'drawer'
      panel.isMinimized = false
      // Move to end of target zone stack
      const targetZone = panel.zone
      panel.order = Object.values(state.panels).filter((p) => p.zone === targetZone).length
      renumberOrdersForZone(state.panels, targetZone)
      savePanelLayout(state)
    },

    toggleMinimize(state, action: PayloadAction<PanelId>) {
      const panel = state.panels[action.payload]
      if (panel && panel.zone !== 'drawer') {
        panel.isMinimized = !panel.isMinimized
        savePanelLayout(state)
      }
    },

    resizePanel(state, action: PayloadAction<{ panelId: PanelId; width: number }>) {
      const panel = state.panels[action.payload.panelId]
      if (panel) {
        // Clamp width to min/max bounds
        panel.width = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, action.payload.width))
        savePanelLayout(state)
      }
    },

    // Set the zone and optional order
    setPanelZone(
      state,
      action: PayloadAction<{ panelId: PanelId; zone: PanelZone; order?: number }>,
    ) {
      const { panelId, zone, order } = action.payload
      const panel = state.panels[panelId]
      if (!panel) return
      const prevZone = panel.zone
      panel.zone = zone
      panel.isMinimized = false
      // Determine new order
      if (typeof order === 'number') {
        panel.order = order
      } else {
        panel.order = Object.values(state.panels).filter((p) => p.zone === zone).length
      }
      // Renumber both zones to keep contiguous order values
      renumberOrdersForZone(state.panels, zone)
      renumberOrdersForZone(state.panels, prevZone)
      savePanelLayout(state)
    },

    // Change order within its current zone
    setPanelOrder(state, action: PayloadAction<{ panelId: PanelId; order: number }>) {
      const { panelId, order } = action.payload
      const panel = state.panels[panelId]
      if (!panel) return
      panel.order = Math.max(0, Math.floor(order))
      renumberOrdersForZone(state.panels, panel.zone)
      savePanelLayout(state)
    },

    // Update the layout (stack vs row) of the below-map zone
    setBelowMapLayout(state, action: PayloadAction<PanelLayout>) {
      state.belowMapLayout = action.payload
      savePanelLayout(state)
    },

    resetLayout(state) {
      state.panels = getDefaultPanels()
      state.belowMapLayout = 'vertical-stack'
      savePanelLayout(state)
    },

    // Move all panels to drawer (used for mobile/tablet)
    unpinAll(state) {
      Object.values(state.panels).forEach((panel) => {
        panel.zone = 'drawer'
        panel.isMinimized = false
        panel.order = 0
      })
      savePanelLayout(state)
    },
  },
})

export const {
  togglePin,
  toggleMinimize,
  resizePanel,
  setPanelZone,
  setPanelOrder,
  setBelowMapLayout,
  resetLayout,
  unpinAll,
} = panelsSlice.actions

// Selectors
export const selectPanels = (state: RootState) => Object.values(state.panels.panels)

export const selectPanelConfig = (state: RootState, panelId: PanelId) =>
  state.panels.panels[panelId]

export const selectPanelsByZone = (state: RootState, zone: PanelZone) =>
  Object.values(state.panels.panels)
    .filter((panel) => panel.zone === zone)
    .sort((a, b) => a.order - b.order)

export const selectBelowMapLayout = (state: RootState) => state.panels.belowMapLayout

export default panelsSlice.reducer

// Export constants for use in components
export { MIN_PANEL_WIDTH, MAX_PANEL_WIDTH, DEFAULT_PANEL_WIDTH }
