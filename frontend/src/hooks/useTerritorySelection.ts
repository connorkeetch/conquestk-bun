import { useCallback, useMemo } from 'react'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { setHoveredTarget } from '@/store/gameInteractionSlice'

interface Territory {
  id: string
  owner?: string | null
}

interface UseTerritorySelectionArgs {
  territories: Territory[]
}

export default function useTerritorySelection({ territories }: UseTerritorySelectionArgs) {
  const dispatch = useAppDispatch()
  const game = useAppSelector((s) => s.game.currentGame)
  const selectedId = useAppSelector((s) => s.game.selectedTerritory)
  const validTargets = useAppSelector((s) => s.game.validTargets)
  const pendingAction = useAppSelector((s) => s.game.pendingAction)
  const myId = useAppSelector((s) => s.auth.user?.id)

  const owned = useMemo(
    () => new Set(territories.filter((t) => t.owner === myId).map((t) => t.id)),
    [territories, myId],
  )
  const valid = useMemo(() => new Set(validTargets), [validTargets])

  const isOwned = useCallback((id: string) => owned.has(id), [owned])
  const isValidTarget = useCallback((id: string) => valid.has(id), [valid])

  const setHovered = useCallback((id: string | null) => dispatch(setHoveredTarget(id)), [dispatch])

  return {
    game,
    selectedId,
    validTargets,
    pendingAction,
    isOwned,
    isValidTarget,
    setHovered,
  }
}
