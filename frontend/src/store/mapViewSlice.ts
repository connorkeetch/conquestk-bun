import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

// Allow arbitrary scale values; UI will clamp
export type DiscreteScale = number

export interface ViewportSize {
  w: number
  h: number
}

export interface ImageSize {
  w: number
  h: number
}

export interface MapViewState {
  scale: DiscreteScale
  tx: number
  ty: number
  viewport: ViewportSize
  image: ImageSize
}

export const allowedScales: DiscreteScale[] = [0.6, 0.8, 1, 1.2, 1.4, 1.6]

export function makeTransform(tx: number, ty: number, scale: number) {
  return `translate(${Math.round(tx)}px, ${Math.round(ty)}px) scale(${scale})`
}

export function centerPan({
  viewport,
  image,
  scale,
}: {
  viewport: ViewportSize
  image: ImageSize
  scale: number
}) {
  const w = image.w * scale
  const h = image.h * scale
  const tx = Math.round((viewport.w - w) / 2)
  const ty = Math.round((viewport.h - h) / 2)
  return { tx, ty }
}

export function clampPan(
  {
    tx,
    ty,
    scale,
    viewport,
    image,
  }: { tx: number; ty: number; scale: number; viewport: ViewportSize; image: ImageSize },
  minVisibleFraction = 0.25,
) {
  const scaledW = image.w * scale
  const scaledH = image.h * scale
  const minVisibleW = Math.max(0, Math.min(viewport.w, scaledW * minVisibleFraction))
  const minVisibleH = Math.max(0, Math.min(viewport.h, scaledH * minVisibleFraction))

  const minTx = minVisibleW - scaledW
  const maxTx = viewport.w - minVisibleW
  const minTy = minVisibleH - scaledH
  const maxTy = viewport.h - minVisibleH

  const clampedTx = Math.max(minTx, Math.min(maxTx, tx))
  const clampedTy = Math.max(minTy, Math.min(maxTy, ty))

  return { tx: Math.round(clampedTx), ty: Math.round(clampedTy) }
}

const initialState: MapViewState = {
  scale: 1,
  tx: 0,
  ty: 0,
  viewport: { w: 0, h: 0 },
  image: { w: 0, h: 0 },
}

const mapViewSlice = createSlice({
  name: 'mapView',
  initialState,
  reducers: {
    setScale(state, action: PayloadAction<DiscreteScale>) {
      state.scale = action.payload
      const { tx, ty } = clampPan({
        tx: state.tx,
        ty: state.ty,
        scale: state.scale,
        viewport: state.viewport,
        image: state.image,
      })
      state.tx = tx
      state.ty = ty
    },
    setPan(state, action: PayloadAction<{ tx: number; ty: number }>) {
      const next = clampPan({
        tx: action.payload.tx,
        ty: action.payload.ty,
        scale: state.scale,
        viewport: state.viewport,
        image: state.image,
      })
      state.tx = next.tx
      state.ty = next.ty
    },
    nudgePan(state, action: PayloadAction<{ dx: number; dy: number }>) {
      const next = clampPan({
        tx: state.tx + action.payload.dx,
        ty: state.ty + action.payload.dy,
        scale: state.scale,
        viewport: state.viewport,
        image: state.image,
      })
      state.tx = next.tx
      state.ty = next.ty
    },
    resetView(state) {
      state.scale = 1
      const { tx, ty } = centerPan({
        viewport: state.viewport,
        image: state.image,
        scale: state.scale,
      })
      state.tx = tx
      state.ty = ty
    },
    setViewport(state, action: PayloadAction<ViewportSize>) {
      state.viewport = action.payload
      const next = clampPan({
        tx: state.tx,
        ty: state.ty,
        scale: state.scale,
        viewport: state.viewport,
        image: state.image,
      })
      state.tx = next.tx
      state.ty = next.ty
    },
    setImageSize(state, action: PayloadAction<ImageSize>) {
      state.image = action.payload
      const next = clampPan({
        tx: state.tx,
        ty: state.ty,
        scale: state.scale,
        viewport: state.viewport,
        image: state.image,
      })
      state.tx = next.tx
      state.ty = next.ty
    },
  },
})

export const { setScale, setPan, nudgePan, resetView, setViewport, setImageSize } =
  mapViewSlice.actions

export default mapViewSlice.reducer
