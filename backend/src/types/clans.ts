export type ClanRecruitmentPolicy = 'open' | 'application' | 'invite'
export type ClanRecruitmentStatus = 'active' | 'closed'
export type ClanPrivacy = 'public' | 'hidden'
export type ClanMemberStatus = 'active' | 'banned' | 'left' | 'kicked'
export type ClanApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn'
export type ClanInvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired'
export type ClanWarStatus = 'scheduled' | 'active' | 'completed' | 'cancelled'
export type ClanWarMatchResult = 'win' | 'loss' | 'draw'

export interface ClanRole {
  id: string
  clanId: string
  name: string
  permissions: Record<string, boolean>
  hierarchyRank: number
  displayOrder: number
  createdAt: string | Date
  updatedAt: string | Date
}

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
  createdAt: string | Date
  updatedAt: string | Date
}

export interface Clan extends ClanSummary {
  ownerUserId: string
  minimumRank?: number | null
  autoAcceptThresholds: Record<string, unknown>
  deletedAt?: string | Date | null
}

export interface ClanMember {
  id: string
  clanId: string
  userId: string
  roleId: string | null
  roleName?: string | null
  roleHierarchy?: number | null
  joinedAt: string | Date
  probationUntil?: string | Date | null
  lastActiveAt?: string | Date | null
  status: ClanMemberStatus
  lastRoleChangeAt?: string | Date | null
  contributionXp: number
  contributionMatches: number
  username?: string | null
  avatarUrl?: string | null
}

export interface ClanApplication {
  id: string
  clanId: string
  userId: string
  status: ClanApplicationStatus
  message?: string | null
  reviewedBy?: string | null
  reviewedAt?: string | Date | null
  createdAt: string | Date
  updatedAt: string | Date
}

export interface ClanInvitation {
  id: string
  clanId: string
  invitedUserId: string
  invitedBy: string
  token: string
  expiresAt?: string | Date | null
  status: ClanInvitationStatus
  createdAt: string | Date
  updatedAt: string | Date
}

export interface ClanAnnouncement {
  id: string
  clanId: string
  authorUserId: string
  title: string
  bodyMarkdown: string
  pinned: boolean
  createdAt: string | Date
  updatedAt: string | Date
  expiresAt?: string | Date | null
}

export interface ClanActivityEvent {
  id: string
  clanId: string
  actorUserId?: string | null
  actionType: string
  metadata: Record<string, unknown>
  targetId?: string | null
  createdAt: string | Date
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
  startAt: string | Date
  endAt: string | Date
  reward: Record<string, unknown>
}

export interface ClanObjectiveProgressUpdate {
  objectiveId: string
  progressValue: number
  completed: boolean
}

export interface ClanContributionResult {
  clanId: string
  totalXp: number
  level: number
  leveledUp: boolean
  progression: ClanProgressionSummary
  objectiveUpdates: ClanObjectiveProgressUpdate[]
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

export interface ClanDetails extends Clan {
  ownerUsername?: string | null
  memberCount: number
  members: ClanMember[]
  recentAnnouncements: ClanAnnouncement[]
  progression: ClanProgressionSummary
  activeObjectives: ClanObjective[]
}

export interface ClanListFilters {
  search?: string
  region?: string
  recruitmentStatus?: ClanRecruitmentStatus
  privacy?: ClanPrivacy
  limit?: number
  cursor?: string
}

export interface ClanListResult {
  clans: ClanSummary[]
  nextCursor?: string | null
}

export interface ClanCreateRequest {
  name: string
  tag: string
  motto?: string
  description?: string
  crestAssetUrl?: string
  bannerAssetUrl?: string
  recruitmentPolicy?: ClanRecruitmentPolicy
  recruitmentStatus?: ClanRecruitmentStatus
  minimumRank?: number
  autoAcceptThresholds?: Record<string, unknown>
  language?: string
  region?: string
  timeZone?: string
  privacy?: ClanPrivacy
}

export interface ClanMembershipContext {
  clanId: string
  clanSlug: string
  clanName: string
  roleName?: string | null
  status: ClanMemberStatus
}
