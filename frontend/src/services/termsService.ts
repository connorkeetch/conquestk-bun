import axios from 'axios'
import { logger } from '@/utils/logger'

const API_URL = '/api/terms'

export interface TermsCheckResponse {
  hasAccepted: boolean
  currentVersion: string
  termsContent?: {
    title: string
    version: string
    sections: Array<{
      title: string
      items: string[]
    }>
  }
}

export interface AcceptTermsResponse {
  success: boolean
  acceptance: {
    id: string
    userId: string
    featureType: string
    termsVersion: string
    acceptedAt: string
  }
}

class TermsService {
  /**
   * Check if user has accepted terms for a feature
   */
  async checkTermsAcceptance(featureType: string): Promise<TermsCheckResponse> {
    try {
      const response = await axios.get(`${API_URL}/check/${featureType}`)
      return response.data
    } catch (error) {
      logger.error('Error checking terms acceptance', error)
      throw error
    }
  }

  /**
   * Accept terms for a feature
   */
  async acceptTerms(featureType: string): Promise<AcceptTermsResponse> {
    try {
      const response = await axios.post(`${API_URL}/accept/${featureType}`)
      return response.data
    } catch (error) {
      logger.error('Error accepting terms', error)
      throw error
    }
  }

  /**
   * Get terms content for a feature (public)
   */
  async getTermsContent(featureType: string) {
    try {
      const response = await axios.get(`${API_URL}/content/${featureType}`)
      return response.data
    } catch (error) {
      logger.error('Error fetching terms content', error)
      throw error
    }
  }

  /**
   * Get user's terms acceptance history
   */
  async getTermsHistory() {
    try {
      const response = await axios.get(`${API_URL}/history`)
      return response.data
    } catch (error) {
      logger.error('Error fetching terms history', error)
      throw error
    }
  }
}

export const termsService = new TermsService()
