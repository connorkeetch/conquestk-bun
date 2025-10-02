import { useEffect, useState } from 'react'
import { type FeatureFlagKey, featureFlagService } from '../services/featureFlagService'

export const useFeatureFlag = (flagName: FeatureFlagKey): boolean => {
  const [isEnabled, setIsEnabled] = useState(() => featureFlagService.isEnabled(flagName))

  useEffect(() => {
    // Subscribe to flag updates
    const unsubscribe = featureFlagService.subscribe((flags) => {
      setIsEnabled(flags[flagName] || false)
    })

    // Check current value
    setIsEnabled(featureFlagService.isEnabled(flagName))

    return unsubscribe
  }, [flagName])

  return isEnabled
}
