import apiClient from './api'

interface FeatureFlags {
  gunts_prescriptions: boolean
  [key: string]: boolean
}

class FeatureFlagService {
  private static instance: FeatureFlagService
  private flags: FeatureFlags = {
    gunts_prescriptions: false,
  }
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
      this.flags = response.data.flags || {}
      this.notifyListeners()
    } catch (error) {
      console.error('Failed to load feature flags:', error)
    }
  }

  public isEnabled(flagName: keyof FeatureFlags): boolean {
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
    this.listeners.forEach((listener) => listener(this.getFlags()))
  }
}

export const featureFlagService = FeatureFlagService.getInstance()