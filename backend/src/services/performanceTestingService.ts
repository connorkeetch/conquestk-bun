import { logger } from '@/utils/logger'
import { performanceMonitorService } from './performanceMonitorService'
import { redisClusterService } from './redisClusterService'
import { databaseClusterService } from './databaseClusterService'
import { scalingService } from './scalingService'
import axios from 'axios'

interface LoadTestConfig {
  duration: number // seconds
  concurrency: number
  rampUp: number // seconds to reach full concurrency
  endpoints: Array<{
    path: string
    method: 'GET' | 'POST' | 'PUT' | 'DELETE'
    weight: number // relative frequency
    payload?: any
    headers?: Record<string, string>
  }>
}

interface GameScenarioConfig {
  players: number
  gameCount: number
  actionsPerMinute: number
  duration: number
  scenario: 'quick_game' | 'tournament' | 'peak_load' | 'stress_test'
}

interface BenchmarkResult {
  testId: string
  timestamp: number
  config: LoadTestConfig | GameScenarioConfig
  results: {
    totalRequests: number
    successfulRequests: number
    failedRequests: number
    avgResponseTime: number
    p95ResponseTime: number
    p99ResponseTime: number
    requestsPerSecond: number
    errorsPerSecond: number
    throughputMBps: number
  }
  systemMetrics: {
    cpuUsage: number[]
    memoryUsage: number[]
    dbConnections: number[]
    cacheHitRate: number[]
    activeWorkers: number[]
  }
  bottlenecks: Array<{
    component: string
    issue: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    recommendation: string
  }>
}

interface StressTestResult extends BenchmarkResult {
  breakingPoint: {
    maxConcurrentUsers: number
    maxRequestsPerSecond: number
    firstFailureAt: number
    recoveryTime: number
  }
  degradationPoints: Array<{
    concurrency: number
    responseTimeMs: number
    errorRate: number
  }>
}

export class PerformanceTestingService {
  private activeTests: Map<string, any> = new Map()
  private benchmarkHistory: BenchmarkResult[] = []
  private testScenarios: Map<string, LoadTestConfig> = new Map()

  constructor() {
    this.initializeTestScenarios()
  }

  private initializeTestScenarios(): void {
    // API Load Testing Scenarios
    this.testScenarios.set('api_health_check', {
      duration: 60,
      concurrency: 50,
      rampUp: 10,
      endpoints: [
        { path: '/health', method: 'GET', weight: 1 }
      ]
    })

    this.testScenarios.set('api_standard_load', {
      duration: 300, // 5 minutes
      concurrency: 100,
      rampUp: 30,
      endpoints: [
        { path: '/api/games', method: 'GET', weight: 3 },
        { path: '/api/games/:id', method: 'GET', weight: 2 },
        { path: '/api/users/me', method: 'GET', weight: 2 },
        { path: '/api/leaderboard', method: 'GET', weight: 1 },
      ]
    })

    this.testScenarios.set('api_peak_load', {
      duration: 600, // 10 minutes
      concurrency: 500,
      rampUp: 60,
      endpoints: [
        { path: '/api/games', method: 'GET', weight: 5 },
        { path: '/api/games', method: 'POST', weight: 1, payload: { name: 'Test Game', players: 4 } },
        { path: '/api/games/:id/join', method: 'POST', weight: 2 },
        { path: '/api/games/:id/move', method: 'POST', weight: 10, payload: { action: 'attack', from: 1, to: 2 } },
        { path: '/api/users/me', method: 'GET', weight: 3 },
        { path: '/api/leaderboard', method: 'GET', weight: 2 },
      ]
    })

    this.testScenarios.set('database_stress', {
      duration: 180, // 3 minutes
      concurrency: 200,
      rampUp: 20,
      endpoints: [
        { path: '/api/games/:id', method: 'GET', weight: 10 }, // Heavy DB reads
        { path: '/api/users/:id/stats', method: 'GET', weight: 5 },
        { path: '/api/games/:id/history', method: 'GET', weight: 3 },
        { path: '/api/leaderboard', method: 'GET', weight: 2 },
      ]
    })

    this.testScenarios.set('cache_performance', {
      duration: 120, // 2 minutes
      concurrency: 150,
      rampUp: 15,
      endpoints: [
        { path: '/api/games', method: 'GET', weight: 8 }, // Should hit cache
        { path: '/api/leaderboard', method: 'GET', weight: 5 },
        { path: '/api/maps', method: 'GET', weight: 3 },
        { path: '/api/users/search?q=test', method: 'GET', weight: 2 },
      ]
    })

    logger.info('✅ Performance test scenarios initialized', {
      scenarios: this.testScenarios.size
    })
  }

  async runLoadTest(scenarioName: string): Promise<BenchmarkResult> {
    const config = this.testScenarios.get(scenarioName)
    if (!config) {
      throw new Error(`Unknown test scenario: ${scenarioName}`)
    }

    const testId = `load-test-${scenarioName}-${Date.now()}`
    
    logger.info('🚀 Starting load test', {
      testId,
      scenario: scenarioName,
      duration: config.duration,
      concurrency: config.concurrency
    })

    // Track system metrics during test
    const metricsCollector = this.startMetricsCollection(testId)
    
    try {
      // Execute the load test
      const testResults = await this.executeLoadTest(testId, config)
      
      // Stop metrics collection
      const systemMetrics = await this.stopMetricsCollection(metricsCollector)
      
      // Analyze results and identify bottlenecks
      const bottlenecks = this.analyzeBottlenecks(testResults, systemMetrics)
      
      const benchmarkResult: BenchmarkResult = {
        testId,
        timestamp: Date.now(),
        config,
        results: testResults,
        systemMetrics,
        bottlenecks
      }

      this.benchmarkHistory.push(benchmarkResult)
      this.activeTests.delete(testId)

      logger.info('✅ Load test completed', {
        testId,
        successRate: (testResults.successfulRequests / testResults.totalRequests) * 100,
        avgResponseTime: testResults.avgResponseTime,
        rps: testResults.requestsPerSecond
      })

      return benchmarkResult

    } catch (error) {
      this.activeTests.delete(testId)
      await this.stopMetricsCollection(metricsCollector)
      throw error
    }
  }

  async runGameScenarioTest(config: GameScenarioConfig): Promise<BenchmarkResult> {
    const testId = `game-scenario-${config.scenario}-${Date.now()}`
    
    logger.info('🎮 Starting game scenario test', {
      testId,
      scenario: config.scenario,
      players: config.players,
      games: config.gameCount,
      duration: config.duration
    })

    const metricsCollector = this.startMetricsCollection(testId)
    
    try {
      const testResults = await this.executeGameScenario(testId, config)
      const systemMetrics = await this.stopMetricsCollection(metricsCollector)
      const bottlenecks = this.analyzeBottlenecks(testResults, systemMetrics)

      const benchmarkResult: BenchmarkResult = {
        testId,
        timestamp: Date.now(),
        config,
        results: testResults,
        systemMetrics,
        bottlenecks
      }

      this.benchmarkHistory.push(benchmarkResult)
      this.activeTests.delete(testId)

      logger.info('✅ Game scenario test completed', {
        testId,
        totalGames: config.gameCount,
        avgResponseTime: testResults.avgResponseTime
      })

      return benchmarkResult

    } catch (error) {
      this.activeTests.delete(testId)
      await this.stopMetricsCollection(metricsCollector)
      throw error
    }
  }

  async runStressTest(maxConcurrency: number = 1000): Promise<StressTestResult> {
    const testId = `stress-test-${Date.now()}`
    
    logger.info('💥 Starting stress test', {
      testId,
      maxConcurrency,
      strategy: 'gradual increase until failure'
    })

    const metricsCollector = this.startMetricsCollection(testId)
    const degradationPoints: StressTestResult['degradationPoints'] = []
    
    let currentConcurrency = 10
    let breakingPoint: StressTestResult['breakingPoint'] | null = null
    let testResults: any = null

    try {
      while (currentConcurrency <= maxConcurrency && !breakingPoint) {
        logger.info(`📈 Testing concurrency level: ${currentConcurrency}`)
        
        const stepConfig: LoadTestConfig = {
          duration: 60, // 1 minute per step
          concurrency: currentConcurrency,
          rampUp: 10,
          endpoints: [
            { path: '/api/games', method: 'GET', weight: 5 },
            { path: '/api/games/:id', method: 'GET', weight: 3 },
            { path: '/api/games/:id/move', method: 'POST', weight: 2, payload: { action: 'move', from: 1, to: 2 } },
          ]
        }

        const stepResults = await this.executeLoadTest(`${testId}-${currentConcurrency}`, stepConfig)
        testResults = stepResults // Keep latest results for final report

        const errorRate = (stepResults.failedRequests / stepResults.totalRequests) * 100
        
        degradationPoints.push({
          concurrency: currentConcurrency,
          responseTimeMs: stepResults.avgResponseTime,
          errorRate
        })

        // Check for breaking point (>5% error rate or >5s response time)
        if (errorRate > 5 || stepResults.avgResponseTime > 5000) {
          breakingPoint = {
            maxConcurrentUsers: currentConcurrency,
            maxRequestsPerSecond: stepResults.requestsPerSecond,
            firstFailureAt: Date.now(),
            recoveryTime: 0 // Will be measured below
          }
          
          logger.warn('💥 Breaking point detected!', {
            concurrency: currentConcurrency,
            errorRate: errorRate.toFixed(2),
            avgResponseTime: stepResults.avgResponseTime
          })
        }

        currentConcurrency += Math.ceil(currentConcurrency * 0.2) // Increase by 20%
      }

      // Test recovery time if we hit breaking point
      if (breakingPoint) {
        logger.info('🔄 Testing system recovery...')
        const recoveryStart = Date.now()
        
        // Wait for system to recover, then test with lower load
        await new Promise(resolve => setTimeout(resolve, 30000)) // Wait 30s
        
        const recoveryConfig: LoadTestConfig = {
          duration: 30,
          concurrency: Math.floor(breakingPoint.maxConcurrentUsers * 0.5),
          rampUp: 5,
          endpoints: [{ path: '/health', method: 'GET', weight: 1 }]
        }

        const recoveryResults = await this.executeLoadTest(`${testId}-recovery`, recoveryConfig)
        const recoveryErrorRate = (recoveryResults.failedRequests / recoveryResults.totalRequests) * 100
        
        if (recoveryErrorRate < 1) { // Less than 1% error rate = recovered
          breakingPoint.recoveryTime = Date.now() - recoveryStart
          logger.info('✅ System recovered', { recoveryTimeMs: breakingPoint.recoveryTime })
        }
      }

      const systemMetrics = await this.stopMetricsCollection(metricsCollector)
      const bottlenecks = this.analyzeBottlenecks(testResults, systemMetrics)

      const stressTestResult: StressTestResult = {
        testId,
        timestamp: Date.now(),
        config: {
          maxConcurrency,
          players: maxConcurrency,
          gameCount: 1,
          actionsPerMinute: 60,
          duration: 1800,
          scenario: 'stress_test' as const,
        } as GameScenarioConfig,
        results: testResults || {
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          avgResponseTime: 0,
          p95ResponseTime: 0,
          p99ResponseTime: 0,
          requestsPerSecond: 0,
          errorsPerSecond: 0,
          throughputMBps: 0
        },
        systemMetrics,
        bottlenecks,
        breakingPoint: breakingPoint || {
          maxConcurrentUsers: maxConcurrency,
          maxRequestsPerSecond: 0,
          firstFailureAt: 0,
          recoveryTime: 0
        },
        degradationPoints
      }

      this.benchmarkHistory.push(stressTestResult)
      this.activeTests.delete(testId)

      logger.info('✅ Stress test completed', {
        testId,
        maxStableConcurrency: breakingPoint?.maxConcurrentUsers || maxConcurrency,
        totalSteps: degradationPoints.length
      })

      return stressTestResult

    } catch (error) {
      this.activeTests.delete(testId)
      await this.stopMetricsCollection(metricsCollector)
      throw error
    }
  }

  private async executeLoadTest(testId: string, config: LoadTestConfig): Promise<BenchmarkResult['results']> {
    const startTime = Date.now()
    const results = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimes: [] as number[],
      throughputBytes: 0
    }

    const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:5001'
    
    // Create request workers
    const workers = []
    const requestsPerWorker = Math.ceil(config.concurrency / 10) // Max 10 workers
    const actualWorkers = Math.min(10, config.concurrency)
    
    for (let w = 0; w < actualWorkers; w++) {
      workers.push(this.createLoadTestWorker(testId, config, baseUrl, requestsPerWorker))
    }

    // Run workers and collect results
    const workerResults = await Promise.allSettled(workers)
    
    // Aggregate results
    workerResults.forEach(result => {
      if (result.status === 'fulfilled') {
        results.totalRequests += result.value.totalRequests
        results.successfulRequests += result.value.successfulRequests
        results.failedRequests += result.value.failedRequests
        results.responseTimes.push(...result.value.responseTimes)
        results.throughputBytes += result.value.throughputBytes
      }
    })

    const duration = (Date.now() - startTime) / 1000
    const sortedResponseTimes = results.responseTimes.sort((a, b) => a - b)
    
    return {
      totalRequests: results.totalRequests,
      successfulRequests: results.successfulRequests,
      failedRequests: results.failedRequests,
      avgResponseTime: results.responseTimes.reduce((sum, rt) => sum + rt, 0) / results.responseTimes.length || 0,
      p95ResponseTime: sortedResponseTimes[Math.floor(sortedResponseTimes.length * 0.95)] || 0,
      p99ResponseTime: sortedResponseTimes[Math.floor(sortedResponseTimes.length * 0.99)] || 0,
      requestsPerSecond: results.totalRequests / duration,
      errorsPerSecond: results.failedRequests / duration,
      throughputMBps: (results.throughputBytes / (1024 * 1024)) / duration
    }
  }

  private async createLoadTestWorker(
    testId: string, 
    config: LoadTestConfig, 
    baseUrl: string, 
    requestCount: number
  ): Promise<any> {
    const results = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimes: [] as number[],
      throughputBytes: 0
    }

    const endTime = Date.now() + (config.duration * 1000)
    const rampUpEnd = Date.now() + (config.rampUp * 1000)
    
    while (Date.now() < endTime && this.activeTests.has(testId)) {
      // Implement ramp-up
      const now = Date.now()
      if (now < rampUpEnd) {
        const rampUpProgress = (now - (endTime - config.duration * 1000)) / (config.rampUp * 1000)
        const delay = Math.max(0, (1000 / requestCount) * (1 - rampUpProgress))
        await new Promise(resolve => setTimeout(resolve, delay))
      }

      // Select endpoint based on weight
      const endpoint = this.selectWeightedEndpoint(config.endpoints)
      const url = `${baseUrl}${endpoint.path.replace(':id', '1')}` // Simple ID substitution

      try {
        const startTime = Date.now()
        const response = await axios({
          method: endpoint.method,
          url,
          data: endpoint.payload,
          headers: {
            'Content-Type': 'application/json',
            ...endpoint.headers
          },
          timeout: 10000,
          validateStatus: () => true // Don't throw on HTTP errors
        })

        const responseTime = Date.now() - startTime
        results.totalRequests++
        results.responseTimes.push(responseTime)
        
        if (response.status >= 200 && response.status < 400) {
          results.successfulRequests++
        } else {
          results.failedRequests++
        }

        // Estimate response size
        const responseSize = JSON.stringify(response.data || '').length
        results.throughputBytes += responseSize

      } catch (error) {
        results.totalRequests++
        results.failedRequests++
        results.responseTimes.push(10000) // Timeout value
      }
    }

    return results
  }

  private selectWeightedEndpoint(endpoints: LoadTestConfig['endpoints']) {
    const totalWeight = endpoints.reduce((sum, ep) => sum + ep.weight, 0)
    let random = Math.random() * totalWeight
    
    for (const endpoint of endpoints) {
      random -= endpoint.weight
      if (random <= 0) {
        return endpoint
      }
    }
    
    return endpoints[0] // Fallback
  }

  private async executeGameScenario(testId: string, config: GameScenarioConfig): Promise<BenchmarkResult['results']> {
    // Simplified game scenario simulation
    const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:5001'
    const results = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimes: [] as number[],
      throughputBytes: 0
    }

    // Simulate game actions based on scenario
    const gameActions = [
      { path: '/api/games', method: 'POST' as const, weight: 1 },
      { path: '/api/games/:id/join', method: 'POST' as const, weight: 2 },
      { path: '/api/games/:id/move', method: 'POST' as const, weight: 10 },
      { path: '/api/games/:id', method: 'GET' as const, weight: 5 }
    ]

    // Convert to standard load test format
    const loadTestConfig: LoadTestConfig = {
      duration: config.duration,
      concurrency: config.players,
      rampUp: Math.min(30, config.duration / 4),
      endpoints: gameActions
    }

    return this.executeLoadTest(testId, loadTestConfig)
  }

  private startMetricsCollection(testId: string): NodeJS.Timeout {
    const metrics = {
      cpuUsage: [] as number[],
      memoryUsage: [] as number[],
      dbConnections: [] as number[],
      cacheHitRate: [] as number[],
      activeWorkers: [] as number[]
    }

    this.activeTests.set(testId, { metrics, startTime: Date.now() })

    return setInterval(async () => {
      try {
        const current = performanceMonitorService.getCurrentMetrics()
        const scaling = scalingService.getMetrics()
        const cache = redisClusterService.getMetrics()
        const db = await databaseClusterService.getMetrics()

        if (current) {
          metrics.cpuUsage.push(0) // Would calculate actual CPU usage
          metrics.memoryUsage.push(current.server.memoryUsage.heapUsed / (1024 * 1024))
          metrics.dbConnections.push(current.database.connectionPoolSize)
          metrics.cacheHitRate.push(cache.hitRate)
          metrics.activeWorkers.push(scaling.activeWorkers)
        }
      } catch (error) {
        logger.warn('Failed to collect metrics during test:', error)
      }
    }, 5000) // Every 5 seconds
  }

  private async stopMetricsCollection(collector: NodeJS.Timeout): Promise<BenchmarkResult['systemMetrics']> {
    clearInterval(collector)
    
    // Return the last collected metrics
    const testData = Array.from(this.activeTests.values())[0]
    return testData?.metrics || {
      cpuUsage: [],
      memoryUsage: [],
      dbConnections: [],
      cacheHitRate: [],
      activeWorkers: []
    }
  }

  private analyzeBottlenecks(
    results: BenchmarkResult['results'], 
    systemMetrics: BenchmarkResult['systemMetrics']
  ): BenchmarkResult['bottlenecks'] {
    const bottlenecks: BenchmarkResult['bottlenecks'] = []

    // Analyze response time
    if (results.avgResponseTime > 1000) {
      bottlenecks.push({
        component: 'response_time',
        issue: `High average response time: ${results.avgResponseTime}ms`,
        severity: results.avgResponseTime > 3000 ? 'critical' : 'high',
        recommendation: 'Consider caching, database optimization, or scaling up'
      })
    }

    // Analyze error rate
    const errorRate = (results.failedRequests / results.totalRequests) * 100
    if (errorRate > 1) {
      bottlenecks.push({
        component: 'error_rate',
        issue: `High error rate: ${errorRate.toFixed(2)}%`,
        severity: errorRate > 5 ? 'critical' : errorRate > 2 ? 'high' : 'medium',
        recommendation: 'Investigate error logs and increase system capacity'
      })
    }

    // Analyze cache performance
    const avgCacheHitRate = systemMetrics.cacheHitRate.reduce((sum, rate) => sum + rate, 0) / systemMetrics.cacheHitRate.length
    if (avgCacheHitRate < 85) {
      bottlenecks.push({
        component: 'cache',
        issue: `Low cache hit rate: ${avgCacheHitRate.toFixed(1)}%`,
        severity: avgCacheHitRate < 70 ? 'high' : 'medium',
        recommendation: 'Review cache TTL settings and implement cache warming'
      })
    }

    // Analyze memory usage
    const maxMemory = Math.max(...systemMetrics.memoryUsage)
    if (maxMemory > 800) {
      bottlenecks.push({
        component: 'memory',
        issue: `High memory usage: ${maxMemory.toFixed(0)}MB`,
        severity: maxMemory > 1200 ? 'critical' : 'medium',
        recommendation: 'Implement memory optimization or scale up instances'
      })
    }

    return bottlenecks
  }

  // Public API methods
  getActiveTests(): string[] {
    return Array.from(this.activeTests.keys())
  }

  getBenchmarkHistory(limit: number = 50): BenchmarkResult[] {
    return this.benchmarkHistory.slice(-limit)
  }

  getTestScenarios(): string[] {
    return Array.from(this.testScenarios.keys())
  }

  async stopTest(testId: string): Promise<boolean> {
    if (this.activeTests.has(testId)) {
      this.activeTests.delete(testId)
      logger.info(`🛑 Test ${testId} stopped by user request`)
      return true
    }
    return false
  }

  generateBenchmarkReport(): {
    summary: {
      totalTests: number
      avgResponseTime: number
      avgThroughput: number
      commonBottlenecks: string[]
    }
    trends: {
      responseTimeImprovement: number
      throughputImprovement: number
      stabilityImprovement: number
    }
    recommendations: string[]
  } {
    const recentTests = this.benchmarkHistory.slice(-10)
    
    if (recentTests.length === 0) {
      return {
        summary: { totalTests: 0, avgResponseTime: 0, avgThroughput: 0, commonBottlenecks: [] },
        trends: { responseTimeImprovement: 0, throughputImprovement: 0, stabilityImprovement: 0 },
        recommendations: ['Run performance tests to gather benchmark data']
      }
    }

    const avgResponseTime = recentTests.reduce((sum, test) => sum + test.results.avgResponseTime, 0) / recentTests.length
    const avgThroughput = recentTests.reduce((sum, test) => sum + test.results.requestsPerSecond, 0) / recentTests.length
    
    const allBottlenecks = recentTests.flatMap(test => test.bottlenecks.map(b => b.component))
    const bottleneckCounts = allBottlenecks.reduce((acc, component) => {
      acc[component] = (acc[component] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    const commonBottlenecks = Object.entries(bottleneckCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([component]) => component)

    // Calculate trends (compare first half vs second half of recent tests)
    const firstHalf = recentTests.slice(0, Math.floor(recentTests.length / 2))
    const secondHalf = recentTests.slice(Math.floor(recentTests.length / 2))
    
    const firstHalfAvgRT = firstHalf.reduce((sum, test) => sum + test.results.avgResponseTime, 0) / firstHalf.length
    const secondHalfAvgRT = secondHalf.reduce((sum, test) => sum + test.results.avgResponseTime, 0) / secondHalf.length
    
    const firstHalfThroughput = firstHalf.reduce((sum, test) => sum + test.results.requestsPerSecond, 0) / firstHalf.length
    const secondHalfThroughput = secondHalf.reduce((sum, test) => sum + test.results.requestsPerSecond, 0) / secondHalf.length

    const responseTimeImprovement = ((firstHalfAvgRT - secondHalfAvgRT) / firstHalfAvgRT) * 100
    const throughputImprovement = ((secondHalfThroughput - firstHalfThroughput) / firstHalfThroughput) * 100

    const recommendations = []
    if (avgResponseTime > 500) recommendations.push('Implement caching and database optimization')
    if (commonBottlenecks.includes('memory')) recommendations.push('Scale up server instances or optimize memory usage')
    if (commonBottlenecks.includes('cache')) recommendations.push('Improve cache hit rates and TTL configuration')
    if (avgThroughput < 100) recommendations.push('Consider horizontal scaling and load balancing')

    return {
      summary: {
        totalTests: this.benchmarkHistory.length,
        avgResponseTime: Math.round(avgResponseTime),
        avgThroughput: Math.round(avgThroughput),
        commonBottlenecks
      },
      trends: {
        responseTimeImprovement: Math.round(responseTimeImprovement),
        throughputImprovement: Math.round(throughputImprovement),
        stabilityImprovement: 0 // Would calculate based on error rates
      },
      recommendations: recommendations.length > 0 ? recommendations : ['System performance is optimal']
    }
  }
}

// Export singleton instance
export const performanceTestingService = new PerformanceTestingService()