import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from './index'

export type PanelId = 'player-stats' | 'chat' | 'game-log'
export type PanelPosition = 'left' | 'right'

export interface PanelConfig {
  id: PanelId
  isPinned: boolean // true = visible on room, false = in drawer only
  isMinimized: boolean // true = collapsed to title bar
  width: number // in pixels (for resizing)
  position: PanelPosition // which side of screen
  order: number // stacking order for multiple panels on same side
}

export interface PanelsState {
  panels: Record<PanelId, PanelConfig>
}

// Default panel configurations
const DEFAULT_PANEL_WIDTH = 360
const MIN_PANEL_WIDTH = 280
const MAX_PANEL_WIDTH = 600

function getDefaultPanels(): Record<PanelId, PanelConfig> {
  return {
    'player-stats': {
      id: 'player-stats',
      isPinned: true, // Pinned by default on desktop+
      isMinimized: false,
      width: DEFAULT_PANEL_WIDTH,
      position: 'left',
      order: 0,
    },
    chat: {
      id: 'chat',
      isPinned: false, // Unpinned by default (drawer only)
      isMinimized: false,
      width: DEFAULT_PANEL_WIDTH,
      position: 'right',
      order: 0,
    },
    'game-log': {
      id: 'game-log',
      isPinned: false, // Unpinned by default (drawer only)
      isMinimized: false,
      width: DEFAULT_PANEL_WIDTH,
      position: 'right',
      order: 1,
    },
  }
}

// Load panel layout from localStorage
function loadPanelLayout(): Record<PanelId, PanelConfig> | null {
  try {
    const stored = localStorage.getItem('conquestk.panel-layout.default')
    if (!stored) return null

    const parsed = JSON.parse(stored)
    if (!parsed.version || parsed.version !== 1) return null

    return parsed.panels
  } catch {
    return null
  }
}

// Save panel layout to localStorage
function savePanelLayout(panels: Record<PanelId, PanelConfig>): void {
  try {
    const data = {
      version: 1,
      panels,
      lastUpdated: Date.now(),
    }
    localStorage.setItem('conquestk.panel-layout.default', JSON.stringify(data))
  } catch {
    // Ignore storage errors (quota, privacy, SSR)
  }
}

const initialState: PanelsState = {
  panels: loadPanelLayout() || getDefaultPanels(),
}

const panelsSlice = createSlice({
  name: 'panels',
  initialState,
  reducers: {
    togglePin(state, action: PayloadAction<PanelId>) {
      const panel = state.panels[action.payload]
      if (panel) {
        panel.isPinned = !panel.isPinned
        // Reset minimized state when unpinning
        if (!panel.isPinned) {
          panel.isMinimized = false
        }
        savePanelLayout(state.panels)
      }
    },

    toggleMinimize(state, action: PayloadAction<PanelId>) {
      const panel = state.panels[action.payload]
      if (panel?.isPinned) {
        panel.isMinimized = !panel.isMinimized
        savePanelLayout(state.panels)
      }
    },

    resizePanel(state, action: PayloadAction<{ panelId: PanelId; width: number }>) {
      const panel = state.panels[action.payload.panelId]
      if (panel) {
        // Clamp width to min/max bounds
        panel.width = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, action.payload.width))
        savePanelLayout(state.panels)
      }
    },

    setPanelPosition(state, action: PayloadAction<{ panelId: PanelId; position: PanelPosition }>) {
      const panel = state.panels[action.payload.panelId]
      if (panel) {
        panel.position = action.payload.position
        savePanelLayout(state.panels)
      }
    },

    setPanelOrder(state, action: PayloadAction<{ panelId: PanelId; order: number }>) {
      const panel = state.panels[action.payload.panelId]
      if (panel) {
        panel.order = action.payload.order
        savePanelLayout(state.panels)
      }
    },

    resetLayout(state) {
      state.panels = getDefaultPanels()
      savePanelLayout(state.panels)
    },

    unpinAll(state) {
      Object.values(state.panels).forEach((panel) => {
        panel.isPinned = false
        panel.isMinimized = false
      })
      savePanelLayout(state.panels)
    },
  },
})

export const {
  togglePin,
  toggleMinimize,
  resizePanel,
  setPanelPosition,
  setPanelOrder,
  resetLayout,
  unpinAll,
} = panelsSlice.actions

// Selectors
export const selectPanels = (state: RootState) => Object.values(state.panels.panels)

export const selectPanelConfig = (state: RootState, panelId: PanelId) =>
  state.panels.panels[panelId]

export const selectPinnedPanels = (state: RootState) =>
  Object.values(state.panels.panels).filter((panel) => panel.isPinned)

export const selectUnpinnedPanels = (state: RootState) =>
  Object.values(state.panels.panels).filter((panel) => !panel.isPinned)

export const selectPinnedPanelsByPosition = (state: RootState, position: PanelPosition) =>
  Object.values(state.panels.panels)
    .filter((panel) => panel.isPinned && panel.position === position)
    .sort((a, b) => a.order - b.order)

export default panelsSlice.reducer

// Export constants for use in components
export { MIN_PANEL_WIDTH, MAX_PANEL_WIDTH, DEFAULT_PANEL_WIDTH }
