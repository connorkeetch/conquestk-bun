import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import blockService from '@/services/blockService'
import friendsService, { type RelationshipStatus } from '@/services/friendsService'
import { type ProfileSummary, profileService } from '@/services/profileService'
import { ensureDirectConversation, messagesActions } from '@/store/messagesSlice'
import { toggleMuteUser } from '@/store/uiRoomSlice'
import { openInbox } from '@/store/uiSlice'
import RankInsignia, { getConquestRank, getRankTierInfo } from '../RankInsignia'
import ReportUserModal from './ReportUserModal'

interface PlayerProfileModalProps {
  open: boolean
  username: string | null
  onClose: () => void
  // Optional rendering context to tailor actions (e.g., show mute in game)
  context?: 'game' | 'global'
}

export default function PlayerProfileModal({
  open,
  username,
  onClose,
  context = 'global',
}: PlayerProfileModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProfileSummary | null>(null)
  const dispatch = useAppDispatch()
  const currentUser = useAppSelector((s) => s.auth.user)
  const mutedSet = useAppSelector((s) => new Set(s.uiRoom.mutedUserIds ?? []))
  const [relationship, setRelationship] = useState<RelationshipStatus>('none')
  const [actionBusy, setActionBusy] = useState<string>('')
  const [moreOpen, setMoreOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  useEffect(() => {
    if (!open || !username) {
      setProfile(null)
      setError(null)
      setLoading(false)
      return
    }

    let isActive = true
    const controller = new AbortController()

    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await profileService.getProfileByUsername(username, {
          signal: controller.signal,
        })
        if (!isActive) return
        setProfile(data)
      } catch (_e) {
        if (!isActive) return
        setError('Unable to load profile')
        setProfile(null)
      } finally {
        if (isActive) setLoading(false)
      }
    }

    void load()

    return () => {
      isActive = false
      controller.abort()
    }
  }, [open, username])

  // Load relationship status once profile is available
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const loadRel = async () => {
      if (!profile?.id) return
      try {
        const info = await friendsService.status(profile.id)
        if (!active) return
        setRelationship(info.status)
      } catch {
        // ignore
      }
    }
    if (open && profile?.id) void loadRel()
    return () => {
      active = false
      controller.abort()
    }
  }, [open, profile?.id])

  const onEscape = useEffectEvent(() => {
    onClose()
  })
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = 'unset'
    }
  }, [open])

  const onOutside = useEffectEvent(() => {
    onClose()
  })
  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onOutside()
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const rank = profile ? getConquestRank(profile.elo) : null
  const rankTierInfo = profile
    ? getRankTierInfo({ minRating: profile.rank?.minRating, rating: profile.elo })
    : null
  const rankSegmentsFilled = rankTierInfo ? Math.min(rankTierInfo.index + 1, rankTierInfo.total) : 0
  const rankBarColor = profile?.rank?.color ?? rank?.color ?? 'var(--color-primary)'
  // Range text removed per design request

  const isOwnProfile = Boolean(currentUser?.username && profile?.username === currentUser.username)
  const isMuted = Boolean(profile?.id && mutedSet.has(profile.id))

  const closeDropdown = useCallback(() => setMoreOpen(false), [])

  // Primary actions
  const handleStartDM = useCallback(async () => {
    if (!profile) return
    setActionBusy('dm')
    try {
      const detail = await dispatch(ensureDirectConversation(profile.id)).unwrap()
      dispatch(messagesActions.setActiveConversationId(detail.conversation.id))
      dispatch(openInbox())
      setMoreOpen(false)
    } catch {
      // ignore
    } finally {
      setActionBusy('')
    }
  }, [dispatch, profile])

  const handleSendFriendRequest = useCallback(async () => {
    if (!profile) return
    setActionBusy('add')
    try {
      await friendsService.sendRequest(profile.id)
      const info = await friendsService.status(profile.id)
      setRelationship(info.status)
      setMoreOpen(false)
    } finally {
      setActionBusy('')
    }
  }, [profile])

  const handleCancelRequest = useCallback(async () => {
    if (!profile) return
    setActionBusy('cancel')
    try {
      await friendsService.cancel(profile.id)
      const info = await friendsService.status(profile.id)
      setRelationship(info.status)
      setMoreOpen(false)
    } finally {
      setActionBusy('')
    }
  }, [profile])

  const handleAccept = useCallback(async () => {
    if (!profile) return
    setActionBusy('accept')
    try {
      await friendsService.accept(profile.id)
      const info = await friendsService.status(profile.id)
      setRelationship(info.status)
      setMoreOpen(false)
    } finally {
      setActionBusy('')
    }
  }, [profile])

  const handleDecline = useCallback(async () => {
    if (!profile) return
    setActionBusy('decline')
    try {
      await friendsService.decline(profile.id)
      const info = await friendsService.status(profile.id)
      setRelationship(info.status)
      setMoreOpen(false)
    } finally {
      setActionBusy('')
    }
  }, [profile])

  const handleUnfriend = useCallback(async () => {
    if (!profile) return
    setActionBusy('unfriend')
    try {
      await friendsService.unfriend(profile.id)
      const info = await friendsService.status(profile.id)
      setRelationship(info.status)
      setMoreOpen(false)
    } finally {
      setActionBusy('')
    }
  }, [profile])

  const handleBlockToggle = useCallback(async () => {
    if (!profile) return
    setActionBusy('block')
    try {
      if (relationship === 'blocked_by_you') {
        await blockService.unblock(profile.id)
      } else {
        await blockService.block(profile.id)
      }
      const info = await friendsService.status(profile.id)
      setRelationship(info.status)
      setMoreOpen(false)
    } finally {
      setActionBusy('')
    }
  }, [profile, relationship])

  const handleToggleMute = useCallback(() => {
    if (!profile?.id) return
    dispatch(toggleMuteUser(profile.id))
    setMoreOpen(false)
  }, [dispatch, profile?.id])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        ref={modalRef}
        className="w-full max-w-md rounded-xl shadow-2xl border border-white/10 bg-[color:var(--surface-1)] text-white overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-[color:var(--surface-2)]/60">
          <h3 className="text-lg font-semibold">Player Profile</h3>
          <button type="button" className="btn btn-tertiary btn-sm" onClick={onClose}>
            ✖ Close
          </button>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="text-center text-muted py-8">Loading…</div>
          ) : error ? (
            <div className="panel-muted text-[color:var(--color-danger)]">{error}</div>
          ) : profile ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full overflow-hidden border border-white/20 flex items-center justify-center bg-[color:var(--surface-2)]">
                  {profile.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt={profile.username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xl font-bold">
                      {profile.username.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold truncate">{profile.username}</div>
                  <div className="text-xs text-muted">
                    {profile.tagline && profile.tagline.trim().length > 0
                      ? profile.tagline
                      : 'Commander of the Conquest Realms'}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <RankInsignia rating={profile.elo} size="md" showLabel={true} showRating={false} />
                <div className="text-right">
                  <div className="text-xs text-muted uppercase tracking-widest">CP</div>
                  <div className="text-xl font-bold">{profile.elo}</div>
                </div>
              </div>

              {rankTierInfo && (
                <div className="space-y-1 text-xs text-muted">
                  <span className="font-semibold text-white/80">{rankTierInfo.label}</span>
                  <div
                    className="flex items-center gap-1"
                    role="img"
                    aria-label={`${rankSegmentsFilled} of ${rankTierInfo.total} rank tiers completed`}
                  >
                    {Array.from(
                      { length: rankTierInfo.total },
                      (_, i) => `modal-rank-tier-${i}`,
                    ).map((tierId, index) => (
                      <span
                        key={tierId}
                        className="h-1.5 w-6 rounded-full"
                        style={
                          index < rankSegmentsFilled
                            ? {
                                background: rankBarColor,
                                boxShadow: '0 0 4px rgba(255,255,255,0.35)',
                              }
                            : { backgroundColor: 'rgba(255,255,255,0.12)' }
                        }
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="panel-muted">
                  <div className="text-xs text-muted">Games</div>
                  <div className="text-lg font-semibold">{profile.gamesPlayed}</div>
                </div>
                <div className="panel-muted">
                  <div className="text-xs text-muted">Wins</div>
                  <div className="text-lg font-semibold">{profile.wins}</div>
                </div>
                <div className="panel-muted">
                  <div className="text-xs text-muted">Win Rate</div>
                  <div className="text-lg font-semibold">{profile.winRate.toFixed(1)}%</div>
                </div>
              </div>

              {/* Action Bar */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Link
                    to={`/profile/${encodeURIComponent(profile.username)}`}
                    className="btn btn-secondary btn-sm"
                    onClick={onClose}
                  >
                    View Full Profile
                  </Link>
                  {isOwnProfile && (
                    <Link to="/settings" className="btn btn-tertiary btn-sm" onClick={onClose}>
                      Settings
                    </Link>
                  )}
                </div>

                {!isOwnProfile && (
                  <div className="flex items-center gap-2 relative">
                    {/* Primary contextual CTA */}
                    {relationship === 'pending_incoming' ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => void handleAccept()}
                        disabled={actionBusy === 'accept'}
                      >
                        {actionBusy === 'accept' ? 'Accepting…' : 'Accept Request'}
                      </button>
                    ) : relationship === 'friends' ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => void handleStartDM()}
                        disabled={actionBusy === 'dm'}
                      >
                        {actionBusy === 'dm' ? 'Opening…' : 'Message'}
                      </button>
                    ) : relationship === 'pending_outgoing' ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => void handleCancelRequest()}
                        disabled={actionBusy === 'cancel'}
                      >
                        {actionBusy === 'cancel' ? 'Canceling…' : 'Cancel Request'}
                      </button>
                    ) : relationship === 'blocked_you' ? (
                      <button type="button" className="btn btn-tertiary btn-sm" disabled>
                        Interaction restricted
                      </button>
                    ) : relationship === 'blocked_by_you' ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => void handleBlockToggle()}
                        disabled={actionBusy === 'block'}
                      >
                        {actionBusy === 'block' ? 'Updating…' : 'Unblock'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => void handleSendFriendRequest()}
                        disabled={actionBusy === 'add'}
                      >
                        {actionBusy === 'add' ? 'Sending…' : 'Add Friend'}
                      </button>
                    )}

                    {/* More dropdown */}
                    <div className="relative">
                      <button
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={moreOpen}
                        className="btn btn-tertiary btn-sm"
                        onClick={() => setMoreOpen((v) => !v)}
                      >
                        More ▾
                      </button>
                      {moreOpen && (
                        <div className="dropdown-menu right-0" role="menu">
                          {relationship === 'pending_incoming' && (
                            <button
                              type="button"
                              className="dropdown-item"
                              onClick={() => void handleDecline()}
                              disabled={actionBusy === 'decline'}
                            >
                              {actionBusy === 'decline' ? 'Declining…' : 'Decline request'}
                            </button>
                          )}
                          {relationship === 'friends' && (
                            <button
                              type="button"
                              className="dropdown-item"
                              onClick={() => void handleUnfriend()}
                              disabled={actionBusy === 'unfriend'}
                            >
                              {actionBusy === 'unfriend' ? 'Removing…' : 'Unfriend'}
                            </button>
                          )}
                          {(relationship === 'none' ||
                            relationship === 'pending_outgoing' ||
                            relationship === 'friends') && (
                            <button
                              type="button"
                              className="dropdown-item"
                              onClick={() => void handleStartDM()}
                              disabled={actionBusy === 'dm'}
                            >
                              {actionBusy === 'dm' ? 'Opening…' : 'Message'}
                            </button>
                          )}
                          {context === 'game' && (
                            <button
                              type="button"
                              className="dropdown-item"
                              onClick={handleToggleMute}
                            >
                              {isMuted ? 'Unmute in this game' : 'Mute in this game'}
                            </button>
                          )}
                          <hr className="dropdown-separator" />
                          <button
                            type="button"
                            className="dropdown-item"
                            onClick={() => {
                              setReportOpen(true)
                              setMoreOpen(false)
                            }}
                          >
                            Report user…
                          </button>
                          <hr className="dropdown-separator" />
                          <button
                            type="button"
                            className="dropdown-item"
                            onClick={() => void handleBlockToggle()}
                            disabled={actionBusy === 'block'}
                          >
                            {relationship === 'blocked_by_you'
                              ? actionBusy === 'block'
                                ? 'Updating…'
                                : 'Unblock user'
                              : actionBusy === 'block'
                                ? 'Updating…'
                                : 'Block user'}
                          </button>
                        </div>
                      )}
                    </div>
                    {/* Close dropdown on outside click within modal area */}
                    {moreOpen && (
                      <div
                        className="fixed inset-0 z-40"
                        onClick={closeDropdown}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center text-muted py-8">No profile</div>
          )}
        </div>
      </div>
      {!isOwnProfile && profile && (
        <ReportUserModal
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          reportedUserId={profile.id}
          reportedUsername={profile.username}
        />
      )}
    </div>
  )
}
