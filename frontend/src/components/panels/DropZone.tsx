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
    'transition-colors rounded border-2 border-dashed border-[color:var(--panel-border)]/60 bg-[color:var(--surface-1)]/40'
  const styles = useMemo(() => {
    if (orientation === 'horizontal') {
      return active
        ? 'min-h-[100px] flex-1 border-[color:var(--color-accent)]/70 bg-[color:var(--color-accent)]/10'
        : 'min-h-[80px] flex-1'
    }
    // vertical
    return active
      ? 'h-8 border-[color:var(--color-accent)]/70 bg-[color:var(--color-accent)]/10'
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
      {label && active && (
        <div className="flex h-full w-full items-center justify-center text-xs text-muted">
          {label}
        </div>
      )}
    </button>
  )
}
