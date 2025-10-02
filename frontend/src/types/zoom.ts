export interface ZoomControls {
  // Logical zoom multiplier applied on top of baseScale
  zoom: number
  // Effective rendered scale relative to the source image (baseScale * zoom)
  scale: number
  // Base scale required to fit the map in the viewport (clamped to <= 1)
  baseScale: number
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
}

export type ZoomControlsReadyHandler = (controls: ZoomControls | null) => void
