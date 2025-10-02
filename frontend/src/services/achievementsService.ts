import apiClient from './api'

export type AchievementRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export interface Achievement {
  id: string
  name: string
  description: string
  category: string
  points: number
  rarity: AchievementRarity
  icon?: string | null
  // Backward-compat: some responses may include iconEmoji or iconUrl
  iconEmoji?: string
  iconUrl?: string
}

export interface UserAchievement {
  id: string
  user_id: string
  achievement_id: string
  unlocked_at: string
  // Joined fields
  name?: string
  description?: string
  category?: string
  points?: number
  rarity?: AchievementRarity
  icon?: string | null
  iconEmoji?: string
}

export interface AchievementsResponse {
  unlocked: UserAchievement[]
  available: Achievement[]
}

const normalizeIcon = (obj: Partial<Achievement | UserAchievement>): string | undefined => {
  // Prefer explicit icon URL/path; fallback to emoji if provided
  const icon = (obj as Achievement).iconUrl || (obj as Achievement).icon || undefined
  if (icon && typeof icon === 'string' && icon.trim().length > 0) return icon
  const emoji = (obj as Achievement).iconEmoji || (obj as UserAchievement).iconEmoji
  return emoji && emoji.trim().length > 0 ? emoji : undefined
}

export const achievementsService = {
  async getMyAchievements(signal?: AbortSignal): Promise<AchievementsResponse> {
    const res = await apiClient.get('/profile/achievements', { signal })
    const data = (res.data || {}) as Partial<AchievementsResponse>
    const unlocked = Array.isArray(data.unlocked) ? data.unlocked : []
    const available = Array.isArray(data.available) ? data.available : []

    const normalizedUnlocked = unlocked.map((ua) => ({
      ...ua,
      icon: normalizeIcon(ua) ?? undefined,
    })) as UserAchievement[]

    const normalizedAvailable = available.map((a) => ({
      ...a,
      icon: normalizeIcon(a) ?? undefined,
    })) as Achievement[]

    return {
      unlocked: normalizedUnlocked,
      available: normalizedAvailable,
    }
  },
}

export default achievementsService
