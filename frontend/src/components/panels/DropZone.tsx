import type React from 'react'
import { useMemo } from 'react'

interface DropZoneProps {
  onDragOver?: (e: React.DragEvent) => void
  onDragLeave?: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  active?: boolean
  orientation?: 'vertical' | 'horizontal'
  className?: string
  label?: string
}

export default function DropZone({
  onDragOver,
  onDragLeave,
  onDrop,
  active = false,
  orientation = 'vertical',
  className = '',
  label,
}: DropZoneProps) {
  const base =
    'relative overflow-hidden rounded border-2 border-dashed border-[color:var(--panel-border)]/60 bg-[color:var(--surface-1)]/40 transition-all duration-200 ease-out hover:bg-[color:var(--surface-2)]/50 hover:border-[color:var(--panel-border)]/80'
  const styles = useMemo(() => {
    if (orientation === 'horizontal') {
      return active
        ? 'min-h-[100px] flex-1 ring-2 ring-[color:var(--color-accent)]/50 bg-[color:var(--color-accent)]/10 shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_20%,transparent)] scale-[1.01]'
        : 'min-h-[80px] flex-1'
    }
    // vertical
    return active
      ? 'h-8 ring-2 ring-[color:var(--color-accent)]/50 bg-[color:var(--color-accent)]/10 shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_20%,transparent)] scale-[1.01]'
      : 'h-6'
  }, [active, orientation])

  return (
    <button
      type="button"
      onDragOver={(e) => {
        e.preventDefault()
        onDragOver?.(e)
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault()
        onDrop(e)
      }}
      className={`${base} ${styles} ${className}`}
      aria-label={label || 'Drop zone'}
    >
      {/* Soft animated glow overlay when active */}
      {active && (
        <span
          aria-hidden="true"
          className={
            'pointer-events-none absolute inset-0 animate-pulse ' +
            (orientation === 'horizontal'
              ? 'bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--color-accent)_15%,transparent),transparent)]'
              : 'bg-[linear-gradient(to_right,color-mix(in_srgb,var(--color-accent)_15%,transparent),transparent)]')
          }
        />
      )}
      {label && active && (
        <div className="relative z-10 flex h-full w-full items-center justify-center text-[11px] tracking-wide text-[color:var(--color-accent)]/80">
          {label}
        </div>
      )}
    </button>
  )
}
