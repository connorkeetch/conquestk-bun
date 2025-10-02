import { logger } from '@/utils/logger'
import { FEATURE_FLAGS, type FeatureFlagName } from '../constants/featureFlags'
import apiClient from './api'

export type FeatureFlagKey = FeatureFlagName | 'gunts_prescriptions'

type FeatureFlags = Record<string, boolean>

const DEFAULT_FLAGS: FeatureFlags = (() => {
  const defaults: FeatureFlags = {
    gunts_prescriptions: false,
  }

  Object.values(FEATURE_FLAGS).forEach((flagName) => {
    defaults[flagName] = false
  })

  return defaults
})()

class FeatureFlagService {
  private static instance: FeatureFlagService
  private flags: FeatureFlags = { ...DEFAULT_FLAGS }
  private listeners: Set<(flags: FeatureFlags) => void> = new Set()

  private constructor() {
    this.loadFlags()
  }

  public static getInstance(): FeatureFlagService {
    if (!FeatureFlagService.instance) {
      FeatureFlagService.instance = new FeatureFlagService()
    }
    return FeatureFlagService.instance
  }

  private async loadFlags(): Promise<void> {
    try {
      const response = await apiClient.get('/feature-flags')
      const fetchedFlags: FeatureFlags = response.data.flags || {}
      this.flags = {
        ...DEFAULT_FLAGS,
        ...fetchedFlags,
      }
      this.notifyListeners()
    } catch (error) {
      logger.error('Failed to load feature flags', error)
    }
  }

  public isEnabled(flagName: FeatureFlagKey): boolean {
    return this.flags[flagName] || false
  }

  public getFlags(): FeatureFlags {
    return { ...this.flags }
  }

  public async refreshFlags(): Promise<void> {
    await this.loadFlags()
  }

  public subscribe(listener: (flags: FeatureFlags) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.getFlags())
    }
  }
}

export const featureFlagService = FeatureFlagService.getInstance()
