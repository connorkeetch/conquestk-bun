import type React from 'react'
import { useCallback } from 'react'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { type PanelId, selectPanelConfig, toggleMinimize, togglePin } from '@/store/panelsSlice'
import PanelHeader from './PanelHeader'

interface PanelContainerProps {
  panelId: PanelId
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  canMinimize?: boolean
  canClose?: boolean
  onClose?: () => void
  className?: string
}

/**
 * Container for panel content with header controls
 * Handles minimized state (show/hide body)
 */
export default function PanelContainer({
  panelId,
  title,
  icon,
  children,
  canMinimize = true,
  canClose = false,
  onClose,
  className = '',
}: PanelContainerProps) {
  const dispatch = useAppDispatch()
  const panelConfig = useAppSelector((state) => selectPanelConfig(state, panelId))

  const handleTogglePin = useCallback(() => {
    dispatch(togglePin(panelId))
  }, [dispatch, panelId])

  const handleToggleMinimize = useCallback(() => {
    dispatch(toggleMinimize(panelId))
  }, [dispatch, panelId])

  if (!panelConfig) {
    return null
  }

  const isPinned = panelConfig.zone !== 'drawer'
  const { isMinimized } = panelConfig

  return (
    <div
      className={`flex flex-col bg-[color:var(--surface-1)] border border-[color:var(--panel-border)] rounded-lg shadow-lg overflow-hidden ${className}`}
    >
      <PanelHeader
        panelId={panelId}
        title={title}
        icon={icon}
        isPinned={isPinned}
        isMinimized={isMinimized}
        canMinimize={canMinimize}
        canClose={canClose}
        onTogglePin={handleTogglePin}
        onToggleMinimize={handleToggleMinimize}
        onClose={onClose}
      />

      {/* Panel Body - Hidden when minimized */}
      {!isMinimized && <div className="flex-1 min-h-0 overflow-hidden">{children}</div>}
    </div>
  )
}
