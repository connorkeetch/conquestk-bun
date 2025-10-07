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
  const isSidebar = zone === 'sidebar-left' || zone === 'sidebar-right'
  const side = zone === 'sidebar-right' ? 'right' : 'left'

  const { width, isDragging, resizeHandleProps } = usePanelResize({
    initialWidth: panelConfig?.width ?? 360,
    side,
    onResize: handleResize,
    disabled: !canResize || !isSidebar,
  })

  if (!panelConfig) {
    return null
  }

  const { zone: panelZone, isMinimized } = panelConfig

  return (
    <div
      className={`relative flex ${className}`}
      style={{
        width: `${width}px`,
        transition: isDragging ? 'none' : 'width 0.2s ease-out',
      }}
    >
      {/* Resize Handle - Left side for right panels, right side for left panels */}
      {canResize && isSidebar && !isMinimized && (
        <div
          {...resizeHandleProps}
          className={`absolute top-0 bottom-0 w-1 cursor-ew-resize hover:bg-[color:var(--color-accent)] transition-colors z-10 ${
            panelZone === 'sidebar-left' ? 'right-0' : 'left-0'
          } ${isDragging ? 'bg-[color:var(--color-accent)]' : 'bg-transparent'}`}
          style={{
            // Add a wider invisible hit area for easier grabbing
            width: '4px',
            marginLeft: panelZone === 'sidebar-right' ? '-2px' : 0,
            marginRight: panelZone === 'sidebar-left' ? '-2px' : 0,
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
