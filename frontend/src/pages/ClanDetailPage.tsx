import { type ClanProgressionSocketPayload, subscribeToClanProgress } from '@conquestk/shared/types'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Loader2,
  MapPin,
  Megaphone,
  Shield,
  Sparkles,
  Target,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react'
import { type ReactElement, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
// Clan detail is generally available
import { clanApi } from '@/services/clanService'
import { socketService } from '@/services/socketService'
import type {
  ClanActivityEvent,
  ClanAnnouncement,
  ClanDetails,
  ClanMember,
  ClanObjective,
  ClanProgressionSummary,
} from '@/types/clans'
import { logger } from '@/utils/logger'

const limitMembers = (members: ClanMember[], count = 12): ClanMember[] => members.slice(0, count)

const formatDate = (value: string | null | undefined): string | null => {
  if (!value) return null
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(value))
  } catch (error) {
    logger.warn('Failed to format date', error)
    return null
  }
}

const formatNumber = (value: number): string => {
  return new Intl.NumberFormat().format(value)
}

const formatRelativeTime = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return formatDate(value) ?? ''
  }

  const diffMs = Date.now() - date.getTime()
  const isPast = diffMs >= 0
  const absMs = Math.abs(diffMs)

  if (absMs < 30 * 1000) {
    return 'just now'
  }

  const units: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [1000 * 60 * 60 * 24 * 365, 'year'],
    [1000 * 60 * 60 * 24 * 30, 'month'],
    [1000 * 60 * 60 * 24 * 7, 'week'],
    [1000 * 60 * 60 * 24, 'day'],
    [1000 * 60 * 60, 'hour'],
    [1000 * 60, 'minute'],
    [1000, 'second'],
  ]

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  for (const [unitMs, unit] of units) {
    if (absMs >= unitMs || unit === 'second') {
      const rawValue = absMs / unitMs
      const rounded = rawValue < 1 ? 1 : Math.round(rawValue)
      return rtf.format(isPast ? -rounded : rounded, unit)
    }
  }

  return formatDate(value) ?? ''
}

const humanizeSource = (source?: string | null): string | null => {
  if (!source) return null
  return source.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

type ActivityDescription = {
  title: string
  subtitle?: string
  icon: ReactElement
  accentClass?: string
}

const describeActivityEvent = (event: ClanActivityEvent): ActivityDescription => {
  const actor = event.actorUsername ?? 'A member'
  const metadata = event.metadata ?? {}

  const coerceNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value)
      if (!Number.isNaN(parsed)) return parsed
    }
    return null
  }

  switch (event.actionType) {
    case 'clan_xp_awarded': {
      const amount = coerceNumber(metadata.amount) ?? 0
      const placement = coerceNumber(metadata.placement)
      const matchesPlayed = coerceNumber(metadata.matchesPlayed)
      const matchesWon = coerceNumber(metadata.matchesWon)
      const territories = coerceNumber(metadata.territories)
      const source = humanizeSource((metadata.source as string | undefined) ?? 'match result')

      const detailParts: string[] = []
      if (source) detailParts.push(source)
      if (typeof placement === 'number') detailParts.push(`Placement #${placement}`)
      if (typeof matchesWon === 'number' && matchesWon > 0) {
        detailParts.push(`${matchesWon} win${matchesWon === 1 ? '' : 's'}`)
      }
      if (typeof matchesPlayed === 'number') {
        detailParts.push(`${matchesPlayed} match${matchesPlayed === 1 ? '' : 'es'}`)
      }
      if (typeof territories === 'number') {
        detailParts.push(`${territories} territories held`)
      }

      const subtitle = detailParts.join(' • ')

      return {
        title: `${actor} earned +${formatNumber(Math.max(amount, 0))} clan XP`,
        ...(subtitle.length > 0 ? { subtitle } : {}),
        icon: <Trophy className="w-4 h-4" />,
        accentClass: 'text-primary-soft',
      }
    }
    case 'clan_level_up': {
      const toLevel = coerceNumber(metadata.toLevel)
      return {
        title: `Clan reached level ${toLevel ?? '?'}`,
        subtitle: `${actor}'s efforts pushed the clan over the threshold.`,
        icon: <Sparkles className="w-4 h-4" />,
        accentClass: 'text-success',
      }
    }
    case 'clan_objective_completed': {
      const objectiveType = humanizeSource(metadata.objectiveType as string | undefined)
      return {
        title: `${actor} completed a ${objectiveType ?? 'clan objective'}`,
        subtitle: 'Weekly goals now grant their rewards.',
        icon: <Target className="w-4 h-4" />,
        accentClass: 'text-warning',
      }
    }
    case 'member_joined':
      return {
        title: `${actor} joined the clan`,
        subtitle: 'A fresh recruit just landed in the roster.',
        icon: <Users className="w-4 h-4" />,
        accentClass: 'text-primary-soft',
      }
    default:
      return {
        title: `${actor} logged ${event.actionType.replace(/_/g, ' ')}`,
        icon: <Megaphone className="w-4 h-4" />,
        accentClass: 'text-muted',
      }
  }
}

const ActivityFeed = ({ events }: { events: ClanActivityEvent[] }) => {
  if (!events.length) {
    return (
      <div className="glass-box-lg p-6">
        <h2 className="text-xl font-semibold text-white">Recent activity</h2>
        <p className="text-sm text-muted mt-3">
          Match history is warming up—complete clan games to see contribution logs here.
        </p>
      </div>
    )
  }

  return (
    <div className="glass-box-lg p-6">
      <h2 className="text-xl font-semibold text-white">Recent activity</h2>
      <ul className="mt-4 space-y-4">
        {events.map((event) => {
          const { title, subtitle, icon, accentClass } = describeActivityEvent(event)
          return (
            <li key={`${event.id}-${event.createdAt}`} className="flex items-start gap-4">
              <div
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-surface-2 ${accentClass ?? 'text-primary-soft'}`}
              >
                {icon}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">{title}</p>
                {subtitle ? <p className="text-xs text-muted mt-1">{subtitle}</p> : null}
              </div>
              <span className="text-xs text-muted whitespace-nowrap">
                {formatRelativeTime(event.createdAt)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const clampProgress = (value: number): number => {
  if (Number.isNaN(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

const ProgressBar = ({ value }: { value: number }) => {
  const safeValue = clampProgress(value)
  return (
    <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
      <div
        className="h-full bg-primary-soft transition-all duration-500"
        style={{ width: `${safeValue * 100}%` }}
      />
    </div>
  )
}

const ProgressionCard = ({ progression }: { progression: ClanProgressionSummary }) => {
  const percent = clampProgress(progression.progressPercent)
  return (
    <div className="glass-box-lg p-6 h-full flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Clan level</p>
          <div className="flex items-center gap-2 mt-1">
            <Sparkles className="w-5 h-5 text-primary-soft" />
            <h3 className="text-3xl font-semibold text-white">Level {progression.level}</h3>
          </div>
        </div>
        <div className="text-right text-sm text-muted">
          <p>Total XP</p>
          <p className="text-lg font-semibold text-white">{formatNumber(progression.totalXp)}</p>
        </div>
      </div>

      <div className="space-y-3">
        <ProgressBar value={percent} />
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            {formatNumber(progression.xpIntoLevel)} / {formatNumber(progression.xpToNextLevel)} this
            level
          </span>
          <span>
            {Math.round(percent * 100)}% to Level {progression.level + 1}
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-white/5 bg-surface-3/40 p-4 text-xs text-muted">
        Next milestone at{' '}
        <span className="text-white">{formatNumber(progression.nextLevelXp)}</span> XP
      </div>
    </div>
  )
}

const getObjectiveCopy = (
  objective: ClanObjective,
): { title: string; description: string; icon: ReactElement } => {
  const percent = objective.targetValue
    ? clampProgress(objective.progressValue / objective.targetValue)
    : 0

  switch (objective.objectiveType) {
    case 'earn_xp':
      return {
        title: 'Boost clan influence',
        description: `Earn ${formatNumber(objective.targetValue)} clan XP this week to rank up faster. (${Math.round(
          percent * 100,
        )}% complete)`,
        icon: <Sparkles className="w-5 h-5" />,
      }
    case 'win_matches':
      return {
        title: 'Secure decisive victories',
        description: `Win ${objective.targetValue} clan matches before rotation for a bonus drop. (${Math.round(
          percent * 100,
        )}% complete)`,
        icon: <Trophy className="w-5 h-5" />,
      }
    default:
      return {
        title: 'Rally the roster',
        description: `Play ${objective.targetValue} games with clanmates to stay battle ready. (${Math.round(
          percent * 100,
        )}% complete)`,
        icon: <Users className="w-5 h-5" />,
      }
  }
}

const formatReward = (reward: Record<string, unknown>): string => {
  const entries = Object.entries(reward ?? {})
  if (entries.length === 0) {
    return 'Surprise reward pending'
  }
  return entries.map(([key, value]) => `${value} ${key.replace(/_/g, ' ')}`).join(', ')
}

const ObjectiveCard = ({ objective }: { objective: ClanObjective }) => {
  const { title, description, icon } = getObjectiveCopy(objective)
  const progress = objective.targetValue
    ? clampProgress(objective.progressValue / objective.targetValue)
    : 0
  return (
    <div className="glass-box-lg p-5 border border-white/5 h-full flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-primary-soft/20 text-primary-soft flex items-center justify-center">
          {icon}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="text-sm text-muted leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="space-y-2">
        <ProgressBar value={progress} />
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            {formatNumber(objective.progressValue)} / {formatNumber(objective.targetValue)} progress
          </span>
          <span>{Math.round(progress * 100)}% complete</span>
        </div>
      </div>
      <div className="text-xs uppercase tracking-[0.3em] text-primary-soft">
        Reward: {formatReward(objective.reward)}
      </div>
    </div>
  )
}

const ObjectiveList = ({ objectives }: { objectives: ClanObjective[] }) => {
  if (objectives.length === 0) {
    return (
      <div className="glass-box-lg p-6 text-center text-muted">
        <Target className="w-8 h-8 mx-auto mb-2 opacity-60" />
        <p>Objectives rotate weekly. Check back after the first clan operation.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {objectives.map((objective) => (
        <ObjectiveCard key={objective.id} objective={objective} />
      ))}
    </div>
  )
}

const AnnouncementList = ({ announcements }: { announcements: ClanAnnouncement[] }) => {
  if (announcements.length === 0) {
    return (
      <div className="glass-box-lg p-6 text-center text-muted">
        <Megaphone className="w-8 h-8 mx-auto mb-2 opacity-60" />
        <p>No announcements yet. Check back soon!</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {announcements.map((announcement) => (
        <article key={announcement.id} className="glass-box-lg p-5 border border-white/5">
          <header className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 className="text-lg font-semibold text-white">{announcement.title}</h3>
            <span className="text-xs uppercase tracking-[0.3em] text-muted">
              {formatDate(announcement.createdAt) ?? 'Recent update'}
            </span>
          </header>
          <p className="text-muted leading-relaxed whitespace-pre-line">
            {announcement.bodyMarkdown}
          </p>
          {announcement.expiresAt && (
            <p className="mt-3 text-xs text-warning flex items-center gap-2">
              <CalendarClock className="w-4 h-4" />
              Expires {formatDate(announcement.expiresAt)}
            </p>
          )}
        </article>
      ))}
    </div>
  )
}

const MemberGrid = ({ members }: { members: ClanMember[] }) => {
  if (members.length === 0) {
    return (
      <div className="glass-box-lg p-6 text-center text-muted">
        <Users className="w-8 h-8 mx-auto mb-2 opacity-60" />
        <p>No active members yet. This clan was just created!</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {limitMembers(members).map((member) => (
        <div key={member.id} className="glass-box-lg p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-surface-3 flex items-center justify-center border border-white/10">
            <span className="text-lg font-semibold text-white">
              {(member.username ?? '??').slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">
              {member.username ?? 'Unknown commander'}
            </p>
            <p className="text-xs text-muted uppercase tracking-[0.3em]">
              {member.roleName ?? 'Member'}
            </p>
          </div>
          <div className="text-xs text-muted text-right">
            <p>Joined {formatDate(member.joinedAt) ?? 'recently'}</p>
            <p>{member.contributionXp} XP</p>
          </div>
        </div>
      ))}
    </div>
  )
}

const ClanDetailPage = () => {
  const { slug } = useParams<{ slug: string }>()
  const [clan, setClan] = useState<ClanDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    const fetchClan = async () => {
      if (!slug) {
        setError('Missing clan identifier')
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        const response = await clanApi.getClanBySlug(slug)
        if (!isMounted) return
        setClan(response)
        setError(null)
      } catch (err) {
        if (!isMounted) return
        logger.error('Failed to load clan detail', err)
        const message = err instanceof Error ? err.message : 'Could not load this clan.'
        setError(message)
        setClan(null)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    fetchClan()

    return () => {
      isMounted = false
    }
  }, [slug])

  useEffect(() => {
    const handleProgressUpdate = (payload: ClanProgressionSocketPayload) => {
      setClan((current) => {
        if (!current || payload.clanId !== current.id) {
          return current
        }

        const objectives = current.activeObjectives.map((objective) => {
          const update = payload.objectiveUpdates.find((item) => item.objectiveId === objective.id)
          if (!update) {
            return objective
          }
          return {
            ...objective,
            progressValue: update.progressValue,
          }
        })

        const members = current.members.map((member) => {
          if (member.userId !== payload.userId) {
            return member
          }
          return {
            ...member,
            contributionXp: member.contributionXp + payload.xpAwarded,
            contributionMatches: member.contributionMatches + payload.matchesPlayed,
          }
        })

        const actorUsername =
          current.members.find((member) => member.userId === payload.userId)?.username ?? null

        const activityEntry: ClanActivityEvent = {
          id: `live-${payload.gameId}-${payload.userId}-${Date.now()}`,
          clanId: current.id,
          actorUserId: payload.userId,
          actorUsername,
          actionType: 'clan_xp_awarded',
          metadata: {
            amount: payload.xpAwarded,
            source: 'game_result',
            matchesPlayed: payload.matchesPlayed,
            matchesWon: payload.matchesWon,
            placement: payload.placement,
            territories: payload.territories,
            armies: payload.armies,
            eliminated: payload.eliminated,
            gameId: payload.gameId,
          },
          targetId: payload.gameId,
          createdAt: new Date().toISOString(),
        }

        return {
          ...current,
          progression: {
            ...current.progression,
            ...payload.progression,
          },
          activeObjectives: objectives,
          members,
          recentActivity: [activityEntry, ...(current.recentActivity ?? [])].slice(0, 20),
        }
      })
    }

    const unsubscribe = subscribeToClanProgress(socketService, handleProgressUpdate)
    return unsubscribe
  }, [])

  const clanCreatedAt = useMemo(() => (clan ? formatDate(clan.createdAt) : null), [clan])
  const objectiveResetAt = useMemo(() => {
    if (!clan || clan.activeObjectives.length === 0) {
      return null
    }
    const soonest = clan.activeObjectives.reduce<Date | null>((acc, objective) => {
      const endDate = new Date(objective.endAt)
      if (Number.isNaN(endDate.valueOf())) {
        return acc
      }
      if (!acc || endDate < acc) {
        return endDate
      }
      return acc
    }, null)
    return soonest ? soonest.toISOString() : null
  }, [clan])

  // No feature gating

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="glass-box-lg p-16 text-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary-soft mx-auto mb-4" />
          <p className="text-muted">Loading clan profile...</p>
        </div>
      </div>
    )
  }

  if (error || !clan) {
    return (
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="glass-box-lg p-10 text-center max-w-xl mx-auto">
          <AlertTriangle className="w-12 h-12 text-danger mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-white mb-2">We couldn't find that clan</h1>
          <p className="text-muted mb-6">
            {error ?? 'The clan dossier may have been removed or renamed.'}
          </p>
          <Link to="/community/clans" className="btn-primary inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to clan directory
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-5">
            {clan.crestAssetUrl ? (
              <img
                src={clan.crestAssetUrl}
                alt={`${clan.name} crest`}
                className="w-24 h-24 rounded-full border border-white/10 object-cover"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-surface-3 flex items-center justify-center border border-white/10">
                <Shield className="w-10 h-10 text-primary-soft" />
              </div>
            )}
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-primary-soft">
                Clan {clan.tag}
              </p>
              <h1 className="text-4xl font-bold text-white">{clan.name}</h1>
              {clan.motto && <p className="mt-2 text-lg text-muted">{clan.motto}</p>}
              <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted">
                <span className="inline-flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary-soft" /> {clan.memberCount} members
                </span>
                <span className="inline-flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary-soft" />{' '}
                  {clan.region ?? 'Region agnostic'}
                </span>
                <span className="inline-flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary-soft" /> Level {clan.progression.level}
                </span>
                <span className="inline-flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary-soft" />
                  {formatNumber(clan.progression.totalXp)} XP
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 text-sm text-muted">
            {clanCreatedAt && <span>Founded {clanCreatedAt}</span>}
            <span>Owner: {clan.ownerUsername ?? 'Unknown commander'}</span>
            <span>
              Recruitment:{' '}
              {clan.recruitmentPolicy === 'open' ? 'Open enrollment' : 'Applications required'} ·{' '}
              {clan.recruitmentStatus === 'active' ? 'Currently recruiting' : 'Closed'}
            </span>
          </div>
        </div>

        <div className="glass-box-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-3">About this clan</h2>
          <p className="text-muted leading-relaxed whitespace-pre-line">
            {clan.description ?? 'This clan has not published a description yet.'}
          </p>
        </div>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <ProgressionCard progression={clan.progression} />
          </div>
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-white">Weekly objectives</h2>
              {objectiveResetAt && (
                <span className="text-xs uppercase tracking-[0.3em] text-muted">
                  Resets {formatDate(objectiveResetAt) ?? 'soon'}
                </span>
              )}
            </div>
            <ObjectiveList objectives={clan.activeObjectives} />
          </div>
        </section>

        <div className="glass-box-lg p-6 border border-white/5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Request to join</h2>
              <p className="text-muted">
                Applications open soon. Follow this clan to get notified when officers begin
                reviewing recruits.
              </p>
            </div>
            <button type="button" className="btn-secondary flex items-center gap-2" disabled>
              <UserPlus className="w-4 h-4" /> Applications paused
            </button>
          </div>
        </div>

        <section className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-white">Roster</h2>
            {clan.members.length > 12 && (
              <span className="text-xs uppercase tracking-[0.3em] text-muted">
                Showing {Math.min(12, clan.members.length)} of {clan.members.length}
              </span>
            )}
          </div>
          <MemberGrid members={clan.members} />
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-white">Announcements</h2>
            <span className="text-xs uppercase tracking-[0.3em] text-muted">Latest updates</span>
          </div>
          <AnnouncementList announcements={clan.recentAnnouncements} />
        </section>

        <ActivityFeed events={clan.recentActivity ?? []} />

        <section className="glass-box-lg p-6 flex items-start gap-4 text-sm text-warning">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div>
            <h3 className="text-base font-semibold text-white mb-1">Early access notice</h3>
            <p className="text-muted leading-relaxed">
              Clan moderation tools and applications are rolling out gradually. Officers will
              receive an email when it's their turn to test the workflow.
            </p>
          </div>
        </section>

        <div>
          <Link to="/community/clans" className="btn-secondary inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to clan directory
          </Link>
        </div>
      </div>
    </div>
  )
}

export default ClanDetailPage
