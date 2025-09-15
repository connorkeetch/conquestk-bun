import { useEffect, useState } from 'react'
import { featureFlagService } from '../services/featureFlagService'

export const useFeatureFlag = (flagName: string): boolean => {
  const [isEnabled, setIsEnabled] = useState(() => featureFlagService.isEnabled(flagName as any))

  useEffect(() => {
    // Subscribe to flag updates
    const unsubscribe = featureFlagService.subscribe((flags) => {
      setIsEnabled(flags[flagName] || false)
    })

    // Check current value
    setIsEnabled(featureFlagService.isEnabled(flagName as any))

    return unsubscribe
  }, [flagName])

  return isEnabled
}
