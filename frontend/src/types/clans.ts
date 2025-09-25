export type ClanRecruitmentPolicy = 'open' | 'application' | 'invite'
export type ClanRecruitmentStatus = 'active' | 'closed'
export type ClanPrivacy = 'public' | 'hidden'

export interface ClanSummary {
  id: string
  name: string
  tag: string
  slug: string
  motto?: string | null
  description?: string | null
  crestAssetUrl?: string | null
  bannerAssetUrl?: string | null
  recruitmentPolicy: ClanRecruitmentPolicy
  recruitmentStatus: ClanRecruitmentStatus
  language?: string | null
  region?: string | null
  timeZone?: string | null
  privacy: ClanPrivacy
  totalXp: number
  level: number
  memberCount: number
  createdAt: string
  updatedAt: string
}

export interface ClanMember {
  id: string
  clanId: string
  userId: string
  roleId: string | null
  roleName?: string | null
  roleHierarchy?: number | null
  joinedAt: string
  probationUntil?: string | null
  lastActiveAt?: string | null
  status: 'active' | 'banned' | 'left' | 'kicked'
  lastRoleChangeAt?: string | null
  contributionXp: number
  contributionMatches: number
  username?: string | null
  avatarUrl?: string | null
}

export interface ClanAnnouncement {
  id: string
  clanId: string
  authorUserId: string
  title: string
  bodyMarkdown: string
  pinned: boolean
  createdAt: string
  updatedAt: string
  expiresAt?: string | null
}

export interface ClanProgressionSummary {
  clanId: string
  totalXp: number
  level: number
  currentLevelXp: number
  nextLevelXp: number
  xpIntoLevel: number
  xpToNextLevel: number
  progressPercent: number
}

export type ClanObjectiveType = 'earn_xp' | 'play_matches' | 'win_matches'

export interface ClanObjective {
  id: string
  clanId: string
  objectiveType: ClanObjectiveType
  targetValue: number
  progressValue: number
  startAt: string
  endAt: string
  reward: Record<string, unknown>
}

export interface ClanActivityEvent {
  id: string
  clanId: string
  actorUserId?: string | null
  actorUsername?: string | null
  actionType: string
  metadata: Record<string, unknown>
  targetId?: string | null
  createdAt: string
}

export interface ClanDetails extends ClanSummary {
  ownerUserId: string
  ownerUsername?: string | null
  minimumRank?: number | null
  autoAcceptThresholds: Record<string, unknown>
  deletedAt?: string | null
  members: ClanMember[]
  recentAnnouncements: ClanAnnouncement[]
  progression: ClanProgressionSummary
  activeObjectives: ClanObjective[]
  recentActivity: ClanActivityEvent[]
}

export interface ClanListFilters {
  search?: string
  region?: string
  recruitmentStatus?: ClanRecruitmentStatus
  privacy?: ClanPrivacy
  limit?: number
  cursor?: string
}

export interface ClanListResponse {
  clans: ClanSummary[]
  nextCursor?: string | null
}

export interface ClanObjectiveProgressUpdate {
  objectiveId: string
  progressValue: number
  completed: boolean
}

export interface ClanProgressionSocketPayload {
  clanId: string
  gameId: string
  userId: string
  xpAwarded: number
  matchesPlayed: number
  matchesWon: number
  placement: number
  territories: number
  armies: number
  eliminated: boolean
  progression: ClanProgressionSummary
  objectiveUpdates: ClanObjectiveProgressUpdate[]
}
