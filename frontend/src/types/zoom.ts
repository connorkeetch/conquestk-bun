export interface ZoomControls {
  zoom: number
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
}

export type ZoomControlsReadyHandler = (controls: ZoomControls | null) => void
