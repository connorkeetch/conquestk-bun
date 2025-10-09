import type React from 'react'
import { useCallback } from 'react'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { usePanelResize } from '@/hooks/usePanelResize'
import { type PanelId, resizePanel, selectPanelConfig } from '@/store/panelsSlice'
import PanelContainer from './PanelContainer'

interface ResizablePanelProps {
  panelId: PanelId
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  canMinimize?: boolean
  canClose?: boolean
  canResize?: boolean
  onClose?: () => void
  className?: string
  isEditingLayout?: boolean
}

/**
 * Resizable panel wrapper with drag-to-resize functionality
 * Wraps PanelContainer and adds resize handle
 */
export default function ResizablePanel({
  panelId,
  title,
  icon,
  children,
  canMinimize = true,
  canClose = false,
  canResize = true,
  onClose,
  className = '',
  isEditingLayout = false,
}: ResizablePanelProps) {
  const dispatch = useAppDispatch()
  const panelConfig = useAppSelector((state) => selectPanelConfig(state, panelId))

  const handleResize = useCallback(
    (newWidth: number) => {
      dispatch(resizePanel({ panelId, width: newWidth }))
    },
    [dispatch, panelId],
  )

  const zone = panelConfig?.zone
  const side = zone === 'sidebar-right' ? 'right' : 'left'

  const { width, isDragging, resizeHandleProps } = usePanelResize({
    initialWidth: panelConfig?.width ?? 360,
    side,
    onResize: handleResize,
    disabled: !canResize,
  })

  if (!panelConfig) {
    return null
  }

  const { isMinimized } = panelConfig

  return (
    <div
      className={`relative flex ${className}`}
      style={{
        width: `${width}px`,
        transition: isDragging ? 'none' : 'width 0.2s ease-out',
      }}
    >
      {/* Left edge resize handle - always available for popped-out panels */}
      {canResize && !isMinimized && (
        <div
          {...resizeHandleProps}
          className={`absolute top-0 bottom-0 left-0 w-1 cursor-ew-resize hover:bg-[color:var(--color-accent)] transition-colors z-10 ${isDragging ? 'bg-[color:var(--color-accent)]' : 'bg-transparent'}`}
          style={{
            width: '4px',
            marginLeft: '-2px',
          }}
        />
      )}

      {/* Right edge resize handle - always available for popped-out panels */}
      {canResize && !isMinimized && (
        <div
          {...resizeHandleProps}
          className={`absolute top-0 bottom-0 right-0 w-1 cursor-ew-resize hover:bg-[color:var(--color-accent)] transition-colors z-10 ${isDragging ? 'bg-[color:var(--color-accent)]' : 'bg-transparent'}`}
          style={{
            width: '4px',
            marginRight: '-2px',
          }}
        />
      )}

      {/* Panel Container */}
      <PanelContainer
        panelId={panelId}
        title={title}
        icon={icon}
        canMinimize={canMinimize}
        canClose={canClose}
        onClose={onClose}
        className="flex-1"
        isEditingLayout={isEditingLayout}
      >
        {children}
      </PanelContainer>
    </div>
  )
}
