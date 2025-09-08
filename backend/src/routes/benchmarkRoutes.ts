import express from 'express'
import { requireAuth, requireAdmin } from '@/middleware/auth'
import { performanceTestingService } from '@/services/performanceTestingService'
import { logger } from '@/utils/logger'

const router = express.Router()

// Get available test scenarios
router.get('/scenarios', requireAuth, requireAdmin, async (req, res) => {
  try {
    const scenarios = performanceTestingService.getTestScenarios()
    
    res.json({
      success: true,
      data: scenarios,
      meta: {
        count: scenarios.length,
        description: 'Available performance test scenarios'
      }
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    })
  }
})

// Run load test
router.post('/load-test/:scenario', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { scenario } = req.params
    const scenarios = performanceTestingService.getTestScenarios()
    
    if (!scenarios.includes(scenario)) {
      return res.status(400).json({
        success: false,
        error: `Unknown scenario: ${scenario}. Available scenarios: ${scenarios.join(', ')}`
      })
    }

    // Start the test asynchronously
    const testPromise = performanceTestingService.runLoadTest(scenario)
    
    // Return immediately with test ID
    const testId = `load-test-${scenario}-${Date.now()}`
    
    // Handle completion in background
    testPromise.then(result => {
      logger.info('📊 Load test completed', {
        testId: result.testId,
        scenario,
        successRate: (result.results.successfulRequests / result.results.totalRequests) * 100,
        avgResponseTime: result.results.avgResponseTime
      })
    }).catch(error => {
      logger.error('❌ Load test failed', { testId, scenario, error: error.message })
    })

    res.json({
      success: true,
      data: {
        testId,
        scenario,
        status: 'started',
        message: 'Load test started. Check /benchmark/status for updates.'
      }
    })

  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    })
  }
})

// Run game scenario test
router.post('/game-scenario', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      players = 50,
      gameCount = 10,
      actionsPerMinute = 30,
      duration = 300,
      scenario = 'peak_load'
    } = req.body

    if (players > 1000 || duration > 3600) {
      return res.status(400).json({
        success: false,
        error: 'Test parameters exceed safety limits (max 1000 players, 3600s duration)'
      })
    }

    const config = {
      players,
      gameCount,
      actionsPerMinute,
      duration,
      scenario: scenario as 'quick_game' | 'tournament' | 'peak_load' | 'stress_test'
    }

    // Start test asynchronously
    const testPromise = performanceTestingService.runGameScenarioTest(config)
    const testId = `game-scenario-${scenario}-${Date.now()}`

    testPromise.then(result => {
      logger.info('🎮 Game scenario test completed', {
        testId: result.testId,
        scenario,
        players,
        avgResponseTime: result.results.avgResponseTime
      })
    }).catch(error => {
      logger.error('❌ Game scenario test failed', { testId, scenario, error: error.message })
    })

    res.json({
      success: true,
      data: {
        testId,
        config,
        status: 'started',
        message: 'Game scenario test started. Check /benchmark/status for updates.'
      }
    })

  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    })
  }
})

// Run stress test
router.post('/stress-test', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { maxConcurrency = 500 } = req.body

    if (maxConcurrency > 2000) {
      return res.status(400).json({
        success: false,
        error: 'Maximum concurrency cannot exceed 2000 for safety'
      })
    }

    // Start stress test asynchronously
    const testPromise = performanceTestingService.runStressTest(maxConcurrency)
    const testId = `stress-test-${Date.now()}`

    testPromise.then(result => {
      logger.info('💥 Stress test completed', {
        testId: result.testId,
        maxConcurrency,
        breakingPoint: result.breakingPoint.maxConcurrentUsers,
        recoveryTime: result.breakingPoint.recoveryTime
      })
    }).catch(error => {
      logger.error('❌ Stress test failed', { testId, error: error.message })
    })

    res.json({
      success: true,
      data: {
        testId,
        maxConcurrency,
        status: 'started',
        message: 'Stress test started. This may take 30+ minutes depending on breaking point.'
      }
    })

  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    })
  }
})

// Get test status
router.get('/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const activeTests = performanceTestingService.getActiveTests()
    const recentHistory = performanceTestingService.getBenchmarkHistory(10)

    res.json({
      success: true,
      data: {
        activeTests: activeTests.map(testId => ({
          testId,
          status: 'running',
          startedAt: new Date().toISOString() // Would track actual start times
        })),
        recentTests: recentHistory.map(test => ({
          testId: test.testId,
          timestamp: new Date(test.timestamp).toISOString(),
          type: test.config.scenario || 'load_test',
          status: 'completed',
          summary: {
            totalRequests: test.results.totalRequests,
            successRate: (test.results.successfulRequests / test.results.totalRequests) * 100,
            avgResponseTime: test.results.avgResponseTime,
            bottlenecks: test.bottlenecks.length
          }
        }))
      },
      meta: {
        activeCount: activeTests.length,
        historyCount: recentHistory.length
      }
    })

  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    })
  }
})

// Get detailed test results
router.get('/results/:testId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { testId } = req.params
    const history = performanceTestingService.getBenchmarkHistory()
    const testResult = history.find(test => test.testId === testId)

    if (!testResult) {
      return res.status(404).json({
        success: false,
        error: 'Test result not found'
      })
    }

    res.json({
      success: true,
      data: testResult
    })

  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    })
  }
})

// Stop active test
router.post('/stop/:testId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { testId } = req.params
    const stopped = await performanceTestingService.stopTest(testId)

    if (!stopped) {
      return res.status(404).json({
        success: false,
        error: 'Test not found or already completed'
      })
    }

    res.json({
      success: true,
      message: `Test ${testId} stopped successfully`
    })

  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    })
  }
})

// Get benchmark history
router.get('/history', requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50
    const history = performanceTestingService.getBenchmarkHistory(limit)

    res.json({
      success: true,
      data: history,
      meta: {
        count: history.length,
        limit
      }
    })

  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    })
  }
})

// Generate benchmark report
router.get('/report', requireAuth, requireAdmin, async (req, res) => {
  try {
    const report = performanceTestingService.generateBenchmarkReport()

    res.json({
      success: true,
      data: report,
      meta: {
        generatedAt: new Date().toISOString(),
        description: 'Comprehensive benchmark analysis report'
      }
    })

  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    })
  }
})

// Quick benchmark for specific endpoints
router.post('/quick-test', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      endpoints = ['/health'],
      duration = 60,
      concurrency = 10
    } = req.body

    if (concurrency > 100 || duration > 300) {
      return res.status(400).json({
        success: false,
        error: 'Quick test limits: max 100 concurrency, 300s duration'
      })
    }

    // Create temporary test scenario
    const quickTestConfig = {
      duration,
      concurrency,
      rampUp: 5,
      endpoints: endpoints.map((path: string) => ({
        path,
        method: 'GET' as const,
        weight: 1
      }))
    }

    // Run synchronous quick test (short duration)
    const testResult = await performanceTestingService.runLoadTest('quick-test-custom')

    res.json({
      success: true,
      data: {
        testId: testResult.testId,
        config: quickTestConfig,
        results: testResult.results,
        bottlenecks: testResult.bottlenecks,
        summary: {
          avgResponseTime: testResult.results.avgResponseTime,
          requestsPerSecond: testResult.results.requestsPerSecond,
          successRate: (testResult.results.successfulRequests / testResult.results.totalRequests) * 100,
          errorRate: (testResult.results.failedRequests / testResult.results.totalRequests) * 100
        }
      }
    })

  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    })
  }
})

// System performance baseline
router.get('/baseline', requireAuth, requireAdmin, async (req, res) => {
  try {
    const baselineTests = [
      'api_health_check',
      'cache_performance'
    ]

    const results = []
    
    for (const scenario of baselineTests) {
      try {
        const result = await performanceTestingService.runLoadTest(scenario)
        results.push({
          scenario,
          avgResponseTime: result.results.avgResponseTime,
          requestsPerSecond: result.results.requestsPerSecond,
          successRate: (result.results.successfulRequests / result.results.totalRequests) * 100
        })
      } catch (error) {
        logger.warn(`Baseline test ${scenario} failed:`, error)
        results.push({
          scenario,
          error: (error as Error).message
        })
      }
    }

    res.json({
      success: true,
      data: {
        baseline: results,
        timestamp: new Date().toISOString(),
        recommendations: [
          'Health check should respond < 100ms',
          'Cache performance should achieve > 95% hit rate',
          'API endpoints should maintain < 500ms response time'
        ]
      }
    })

  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    })
  }
})

export default router