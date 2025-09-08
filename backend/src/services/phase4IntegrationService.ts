import { logger } from '@/utils/logger'
import { redisClusterService } from './redisClusterService'
import { databaseClusterService } from './databaseClusterService'
import { cdnService } from './cdnService'
import { performanceMonitorService } from './performanceMonitorService'
import { scalingService } from './scalingService'
import { enterpriseScalingService } from './enterpriseScalingService'
import { performanceTestingService } from './performanceTestingService'

interface Phase4Status {
  initialized: boolean
  services: {
    redisCluster: { status: string; details?: any }
    databaseCluster: { status: string; details?: any }
    cdn: { status: string; details?: any }
    performanceMonitor: { status: string; details?: any }
    scaling: { status: string; details?: any }
    enterpriseScaling: { status: string; details?: any }
    performanceTesting: { status: string; details?: any }
  }
  overallHealth: 'healthy' | 'degraded' | 'critical' | 'offline'
  initializedAt?: number
  environment: string
}

export class Phase4IntegrationService {
  private isInitialized = false
  private initializationStartTime = 0
  private status: Phase4Status = {
    initialized: false,
    services: {
      redisCluster: { status: 'not_initialized' },
      databaseCluster: { status: 'not_initialized' },
      cdn: { status: 'not_initialized' },
      performanceMonitor: { status: 'not_initialized' },
      scaling: { status: 'not_initialized' },
      enterpriseScaling: { status: 'not_initialized' },
      performanceTesting: { status: 'not_initialized' }
    },
    overallHealth: 'offline',
    environment: process.env.NODE_ENV || 'development'
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.info('📋 Phase 4 services already initialized')
      return
    }

    this.initializationStartTime = Date.now()
    
    logger.info('🚀 Starting Phase 4: Advanced Scaling & Performance Optimization')
    logger.info('📊 Initializing enterprise-grade performance systems...')

    try {
      // Initialize services in optimal order (dependencies first)
      await this.initializeInfrastructureServices()
      await this.initializeMonitoringServices()
      await this.initializeScalingServices()
      await this.initializeTestingServices()
      await this.initializeMasterOrchestration()

      // Final health check
      await this.performInitialHealthCheck()

      this.isInitialized = true
      this.status.initialized = true
      this.status.initializedAt = Date.now()

      const initTime = Date.now() - this.initializationStartTime

      logger.info('✅ Phase 4 initialization completed successfully!', {
        initializationTime: `${initTime}ms`,
        environment: this.status.environment,
        servicesCount: Object.keys(this.status.services).length,
        overallHealth: this.status.overallHealth
      })

      // Log capabilities summary
      this.logCapabilitiesSummary()

    } catch (error) {
      logger.error('❌ Phase 4 initialization failed:', error)
      this.status.overallHealth = 'critical'
      throw error
    }
  }

  private async initializeInfrastructureServices(): Promise<void> {
    logger.info('🏗️ Initializing infrastructure services...')
    
    const infraTasks = [
      {
        name: 'redisCluster',
        service: redisClusterService,
        description: 'Redis Cluster with tiered caching'
      },
      {
        name: 'databaseCluster',
        service: databaseClusterService,
        description: 'Database cluster with load balancing'
      },
      {
        name: 'cdn',
        service: cdnService,
        description: 'CDN with multi-provider support'
      }
    ]

    const results = await Promise.allSettled(
      infraTasks.map(async task => {
        try {
          await task.service.initialize()
          this.status.services[task.name as keyof typeof this.status.services] = { 
            status: 'initialized' 
          }
          logger.info(`  ✅ ${task.description} - Ready`)
          return { name: task.name, success: true }
        } catch (error) {
          this.status.services[task.name as keyof typeof this.status.services] = { 
            status: 'failed',
            details: error
          }
          logger.error(`  ❌ ${task.description} - Failed:`, error)
          return { name: task.name, success: false, error }
        }
      })
    )

    const successful = results.filter(result => 
      result.status === 'fulfilled' && result.value.success
    ).length

    logger.info(`🏗️ Infrastructure services: ${successful}/${infraTasks.length} initialized`)
  }

  private async initializeMonitoringServices(): Promise<void> {
    logger.info('📊 Initializing monitoring services...')

    try {
      await performanceMonitorService.initialize()
      this.status.services.performanceMonitor = { status: 'initialized' }
      logger.info('  ✅ Performance monitoring with real-time alerts - Ready')
    } catch (error) {
      this.status.services.performanceMonitor = { status: 'failed', details: error }
      logger.error('  ❌ Performance monitoring failed:', error)
    }
  }

  private async initializeScalingServices(): Promise<void> {
    logger.info('⚡ Initializing scaling services...')

    try {
      await scalingService.initialize()
      this.status.services.scaling = { status: 'initialized' }
      logger.info('  ✅ Horizontal scaling with auto-scaling - Ready')
    } catch (error) {
      this.status.services.scaling = { status: 'failed', details: error }
      logger.error('  ❌ Scaling service failed:', error)
    }
  }

  private async initializeTestingServices(): Promise<void> {
    logger.info('🧪 Initializing performance testing...')

    try {
      // Performance testing service doesn't need async initialization
      this.status.services.performanceTesting = { status: 'initialized' }
      logger.info('  ✅ Load testing and benchmarking suite - Ready')
    } catch (error) {
      this.status.services.performanceTesting = { status: 'failed', details: error }
      logger.error('  ❌ Performance testing failed:', error)
    }
  }

  private async initializeMasterOrchestration(): Promise<void> {
    logger.info('🎯 Initializing master orchestration...')

    try {
      await enterpriseScalingService.initialize()
      this.status.services.enterpriseScaling = { status: 'initialized' }
      logger.info('  ✅ Enterprise scaling orchestration - Ready')
    } catch (error) {
      this.status.services.enterpriseScaling = { status: 'failed', details: error }
      logger.error('  ❌ Enterprise scaling failed:', error)
    }
  }

  private async performInitialHealthCheck(): Promise<void> {
    logger.info('🔍 Performing initial system health check...')

    const healthChecks = await Promise.allSettled([
      redisClusterService.healthCheck(),
      databaseClusterService.healthCheck(),
      cdnService.healthCheck(),
      performanceMonitorService.healthCheck(),
      scalingService.healthCheck(),
      enterpriseScalingService.healthCheck()
    ])

    const healthyServices = healthChecks.filter(check => 
      check.status === 'fulfilled' && 
      check.value.status === 'healthy'
    ).length

    const totalServices = healthChecks.length

    // Determine overall health
    if (healthyServices === totalServices) {
      this.status.overallHealth = 'healthy'
    } else if (healthyServices >= totalServices * 0.8) {
      this.status.overallHealth = 'degraded'
    } else if (healthyServices >= totalServices * 0.5) {
      this.status.overallHealth = 'critical'
    } else {
      this.status.overallHealth = 'offline'
    }

    logger.info(`🔍 Initial health check: ${healthyServices}/${totalServices} services healthy`, {
      overallHealth: this.status.overallHealth
    })
  }

  private logCapabilitiesSummary(): void {
    logger.info('🌟 Phase 4 Capabilities Summary:')
    logger.info('  🗄️  Advanced Caching: Multi-tier Redis cluster with intelligent TTL management')
    logger.info('  🎯  Load Balancing: Database cluster with multiple balancing strategies')
    logger.info('  🌐  CDN Integration: Multi-provider asset optimization and edge caching')
    logger.info('  📊  Real-time Monitoring: Comprehensive metrics with automated alerting')
    logger.info('  ⚡  Auto-scaling: Horizontal scaling based on resource thresholds')
    logger.info('  🎮  Game Optimization: Specialized caching and processing for game state')
    logger.info('  🧪  Performance Testing: Load testing, stress testing, and benchmarking')
    logger.info('  🚨  Health Monitoring: Automatic failure detection and recovery')
    logger.info('  📈  Enterprise Management: Unified orchestration and optimization')

    // Log environment-specific optimizations
    if (this.status.environment === 'production') {
      logger.info('🏭  Production Optimizations:')
      logger.info('    • Aggressive caching for static assets')
      logger.info('    • Database read replicas for load distribution')
      logger.info('    • CDN edge locations for global performance')
      logger.info('    • Advanced monitoring with SLA compliance tracking')
    } else {
      logger.info('🔬  Development Mode:')
      logger.info('    • Reduced cache TTLs for faster development')
      logger.info('    • Enhanced logging for debugging')
      logger.info('    • Performance testing tools available')
    }
  }

  // Public API methods
  getStatus(): Phase4Status {
    return { ...this.status }
  }

  async getDetailedStatus(): Promise<Phase4Status & { serviceDetails: any }> {
    const serviceDetails: Record<string, any> = {}

    if (this.status.services.redisCluster.status === 'initialized') {
      try {
        serviceDetails['redisCluster'] = await redisClusterService.healthCheck()
      } catch (error) {
        serviceDetails['redisCluster'] = { status: 'error', error: (error as Error).message }
      }
    }

    if (this.status.services.performanceMonitor.status === 'initialized') {
      try {
        serviceDetails['performanceMonitor'] = await performanceMonitorService.healthCheck()
      } catch (error) {
        serviceDetails['performanceMonitor'] = { status: 'error', error: (error as Error).message }
      }
    }

    return {
      ...this.status,
      serviceDetails
    }
  }

  async runDiagnostics(): Promise<{
    systemHealth: any
    performanceMetrics: any
    scalingStatus: any
    recommendations: string[]
  }> {
    logger.info('🔧 Running Phase 4 system diagnostics...')

    const diagnostics = {
      systemHealth: null as any,
      performanceMetrics: null as any,
      scalingStatus: null as any,
      recommendations: [] as string[]
    }

    try {
      // Get system health from enterprise scaling service
      if (this.status.services.enterpriseScaling.status === 'initialized') {
        diagnostics.systemHealth = await enterpriseScalingService.getSystemStatus()
      }

      // Get current performance metrics
      if (this.status.services.performanceMonitor.status === 'initialized') {
        diagnostics.performanceMetrics = performanceMonitorService.getCurrentMetrics()
      }

      // Get scaling status
      if (this.status.services.scaling.status === 'initialized') {
        diagnostics.scalingStatus = scalingService.getMetrics()
      }

      // Generate recommendations based on diagnostics
      diagnostics.recommendations = this.generateRecommendations(diagnostics)

      logger.info('✅ Phase 4 diagnostics completed', {
        systemHealth: diagnostics.systemHealth?.overall || 'unknown',
        activeWorkers: diagnostics.scalingStatus?.activeWorkers || 0,
        avgResponseTime: diagnostics.performanceMetrics?.database?.avgResponseTime || 0
      })

    } catch (error) {
      logger.error('❌ Phase 4 diagnostics failed:', error)
      diagnostics.recommendations.push('Run system diagnostics to identify issues')
    }

    return diagnostics
  }

  private generateRecommendations(diagnostics: any): string[] {
    const recommendations: string[] = []

    // System health recommendations
    if (diagnostics.systemHealth?.overall === 'critical') {
      recommendations.push('CRITICAL: System health is critical - immediate attention required')
    }

    if (diagnostics.systemHealth?.overall === 'degraded') {
      recommendations.push('System health is degraded - review performance metrics')
    }

    // Performance recommendations
    if (diagnostics.performanceMetrics?.database?.avgResponseTime > 1000) {
      recommendations.push('Database response time is high - consider query optimization')
    }

    if (diagnostics.performanceMetrics?.cache?.hitRate < 85) {
      recommendations.push('Cache hit rate is below optimal - review caching strategy')
    }

    // Scaling recommendations
    if (diagnostics.scalingStatus?.activeWorkers === diagnostics.scalingStatus?.totalWorkers) {
      recommendations.push('All workers are active - consider horizontal scaling')
    }

    // Default recommendation if system is healthy
    if (recommendations.length === 0) {
      recommendations.push('System performance is optimal - continue monitoring')
    }

    return recommendations
  }

  // Emergency operations
  async emergencyShutdown(): Promise<void> {
    logger.warn('🚨 Emergency shutdown initiated for Phase 4 services...')

    const shutdownPromises = []

    if (this.status.services.enterpriseScaling.status === 'initialized') {
      shutdownPromises.push(enterpriseScalingService.shutdown())
    }

    if (this.status.services.performanceMonitor.status === 'initialized') {
      shutdownPromises.push(performanceMonitorService.shutdown())
    }

    if (this.status.services.scaling.status === 'initialized') {
      shutdownPromises.push(scalingService.shutdown())
    }

    await Promise.allSettled(shutdownPromises)

    this.isInitialized = false
    this.status.initialized = false
    this.status.overallHealth = 'offline'

    logger.info('✅ Phase 4 emergency shutdown completed')
  }

  // Performance testing shortcuts
  async runQuickBenchmark(): Promise<any> {
    if (this.status.services.performanceTesting.status !== 'initialized') {
      throw new Error('Performance testing service not initialized')
    }

    logger.info('🏃 Running quick performance benchmark...')
    return await performanceTestingService.runLoadTest('api_health_check')
  }

  async generatePerformanceReport(): Promise<any> {
    if (this.status.services.performanceTesting.status !== 'initialized') {
      throw new Error('Performance testing service not initialized')
    }

    return performanceTestingService.generateBenchmarkReport()
  }

  isReady(): boolean {
    return this.isInitialized && this.status.overallHealth !== 'offline'
  }
}

// Export singleton instance
export const phase4IntegrationService = new Phase4IntegrationService()