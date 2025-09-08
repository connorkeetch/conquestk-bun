import { query } from '../config/database'
import { logger } from '../utils/logger'

export interface TermsAcceptance {
  id: string
  userId: string
  featureType: string
  termsVersion: string
  acceptedAt: Date
  ipAddress?: string
  userAgent?: string
}

type FeatureType = 'map_editor' | 'tournament' | 'general'

export class TermsService {
  private static readonly CURRENT_VERSIONS: Record<FeatureType, string> = {
    map_editor: '1.0',
    tournament: '1.0',
    general: '1.0',
  }

  /**
   * Check if user has accepted the current terms for a feature
   */
  async hasAcceptedTerms(userId: string, featureType: string): Promise<boolean> {
    try {
      const currentVersion = this.getCurrentVersion(featureType)

      const result = await query(
        `SELECT * FROM user_terms_acceptance 
         WHERE user_id = $1 AND feature_type = $2 AND terms_version = $3`,
        [userId, featureType, currentVersion],
      )

      return result.rows.length > 0
    } catch (error) {
      logger.error('Error checking terms acceptance:', error)
      return false
    }
  }

  /**
   * Record user's acceptance of terms
   */
  async acceptTerms(
    userId: string,
    featureType: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<TermsAcceptance> {
    try {
      const currentVersion = this.getCurrentVersion(featureType)

      const result = await query(
        `INSERT INTO user_terms_acceptance 
         (user_id, feature_type, terms_version, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, feature_type, terms_version) 
         DO UPDATE SET accepted_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [userId, featureType, currentVersion, ipAddress, userAgent],
      )

      return result.rows[0]
    } catch (error) {
      logger.error('Error accepting terms:', error)
      throw error
    }
  }

  /**
   * Get all terms acceptances for a user
   */
  async getUserTermsHistory(userId: string): Promise<TermsAcceptance[]> {
    try {
      const result = await query(
        `SELECT * FROM user_terms_acceptance 
         WHERE user_id = $1
         ORDER BY accepted_at DESC`,
        [userId],
      )

      return result.rows
    } catch (error) {
      logger.error('Error fetching terms history:', error)
      throw error
    }
  }

  /**
   * Get the current terms version for a feature
   */
  getCurrentVersion(featureType: string): string {
    const validFeatureType = featureType as FeatureType
    return TermsService.CURRENT_VERSIONS[validFeatureType] || '1.0'
  }

  /**
   * Get the terms content for display
   */
  getTermsContent(featureType: string): {
    title: string
    version: string
    sections: Array<{
      title: string
      items: string[]
    }>
  } {
    const terms: Record<string, ReturnType<TermsService['getTermsContent']>> = {
      map_editor: {
        title: 'Map Editor Terms & Conditions',
        version: '1.0',
        sections: [
          {
            title: 'Content Guidelines',
            items: [
              'You will not upload copyrighted material without permission',
              'You will not create maps containing offensive or inappropriate content',
              'You will not upload images that you do not have the right to use',
              'You will ensure your maps are suitable for all ages',
            ],
          },
          {
            title: 'Intellectual Property',
            items: [
              'By uploading a map, you grant ConquestK a license to use, modify, and distribute it',
              'You retain ownership of your original creative work',
              'ConquestK may feature your maps without additional compensation',
              'You may request removal of your maps at any time',
            ],
          },
          {
            title: 'Quality Standards',
            items: [
              'Maps must be playable and balanced',
              'Territory boundaries must be clear and unambiguous',
              'Maps must have proper adjacency connections',
              'Continent bonuses must be reasonable',
            ],
          },
          {
            title: 'Moderation',
            items: [
              'All maps are subject to review before publication',
              'ConquestK reserves the right to reject or remove maps',
              'Repeated violations may result in loss of map editor privileges',
              'Decisions by moderators are final',
            ],
          },
        ],
      },
      general: {
        title: 'Terms of Service',
        version: '1.0',
        sections: [
          {
            title: 'General Terms',
            items: [
              'You must be 13 years or older to use this service',
              'You are responsible for your account security',
              'You will not abuse or exploit the game systems',
              'You will treat other players with respect',
            ],
          },
        ],
      },
    }

    return terms[featureType] || terms.general
  }
}

export const termsService = new TermsService()
