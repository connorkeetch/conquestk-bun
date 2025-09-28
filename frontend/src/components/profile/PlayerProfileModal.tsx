import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { type ProfileSummary, profileService } from '@/services/profileService'
import RankInsignia, { getConquestRank, getRankTierInfo } from '../RankInsignia'

interface PlayerProfileModalProps {
  open: boolean
  username: string | null
  onClose: () => void
}

export default function PlayerProfileModal({ open, username, onClose }: PlayerProfileModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProfileSummary | null>(null)

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) {
      document.addEventListener('keydown', onKey)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = 'unset'
    }
  }, [open, onClose])

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open, onClose])

  if (!open) return null

  const rank = profile ? getConquestRank(profile.elo) : null
  const rankTierInfo = profile
    ? getRankTierInfo({ minRating: profile.rank?.minRating, rating: profile.elo })
    : null
  const rankSegmentsFilled = rankTierInfo ? Math.min(rankTierInfo.index + 1, rankTierInfo.total) : 0
  const rankBarColor = profile?.rank?.color ?? rank?.color ?? 'var(--color-primary)'
  const rankRangeText = profile
    ? (() => {
        const min = profile.rank?.minRating ?? rank?.minRating ?? 0
        const max = profile.rank?.nextRank ? profile.rank.nextRank.minRating - 1 : undefined
        return max ? `${min}–${max} CP` : `${min}+ CP`
      })()
    : null

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
                  <div className="text-xs text-muted">Commander of the Conquest Realms</div>
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
                    {Array.from({ length: rankTierInfo.total }).map((_, index) => (
                      <span
                        key={`modal-rank-tier-${index}`}
                        className="h-1.5 flex-1 min-w-[10px] rounded-full"
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
                  {rankRangeText && <span className="text-[11px] text-white/40">{rankRangeText}</span>}
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

              <div className="flex items-center justify-end gap-2">
                <Link
                  to={`/profile/${encodeURIComponent(profile.username)}`}
                  className="btn btn-secondary btn-sm"
                  onClick={onClose}
                >
                  View Full Profile
                </Link>
                <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
                  Close
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center text-muted py-8">No profile</div>
          )}
        </div>
      </div>
    </div>
  )
}
