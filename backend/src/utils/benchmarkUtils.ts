import { logger } from '@/utils/logger'
import { performanceTestingService } from '@/services/performanceTestingService'

export interface BenchmarkThresholds {
  responseTime: {
    excellent: number
    good: number
    fair: number
    poor: number
  }
  throughput: {
    excellent: number
    good: number
    fair: number
    poor: number
  }
  errorRate: {
    excellent: number
    good: number
    fair: number
    poor: number
  }
  availability: {
    excellent: number
    good: number
    fair: number
    poor: number
  }
}

export const DEFAULT_BENCHMARKS: BenchmarkThresholds = {
  responseTime: {
    excellent: 100,  // < 100ms
    good: 300,       // < 300ms
    fair: 1000,      // < 1s
    poor: 3000       // < 3s
  },
  throughput: {
    excellent: 1000, // > 1000 RPS
    good: 500,       // > 500 RPS
    fair: 100,       // > 100 RPS
    poor: 50         // > 50 RPS
  },
  errorRate: {
    excellent: 0.1,  // < 0.1%
    good: 0.5,       // < 0.5%
    fair: 2.0,       // < 2%
    poor: 5.0        // < 5%
  },
  availability: {
    excellent: 99.99, // > 99.99%
    good: 99.9,       // > 99.9%
    fair: 99.0,       // > 99%
    poor: 95.0        // > 95%
  }
}

export type PerformanceGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F'

export function calculatePerformanceGrade(
  responseTime: number,
  throughput: number,
  errorRate: number,
  availability: number = 100,
  thresholds: BenchmarkThresholds = DEFAULT_BENCHMARKS
): {
  overall: PerformanceGrade
  breakdown: {
    responseTime: PerformanceGrade
    throughput: PerformanceGrade
    errorRate: PerformanceGrade
    availability: PerformanceGrade
  }
  score: number
} {
  // Grade individual metrics
  const responseTimeGrade = gradeResponseTime(responseTime, thresholds.responseTime)
  const throughputGrade = gradeThroughput(throughput, thresholds.throughput)
  const errorRateGrade = gradeErrorRate(errorRate, thresholds.errorRate)
  const availabilityGrade = gradeAvailability(availability, thresholds.availability)

  // Calculate weighted score
  const weights = {
    responseTime: 0.3,
    throughput: 0.25,
    errorRate: 0.25,
    availability: 0.2
  }

  const scores = {
    responseTime: gradeToScore(responseTimeGrade),
    throughput: gradeToScore(throughputGrade),
    errorRate: gradeToScore(errorRateGrade),
    availability: gradeToScore(availabilityGrade)
  }

  const weightedScore = (
    scores.responseTime * weights.responseTime +
    scores.throughput * weights.throughput +
    scores.errorRate * weights.errorRate +
    scores.availability * weights.availability
  )

  const overallGrade = scoreToGrade(weightedScore)

  return {
    overall: overallGrade,
    breakdown: {
      responseTime: responseTimeGrade,
      throughput: throughputGrade,
      errorRate: errorRateGrade,
      availability: availabilityGrade
    },
    score: Math.round(weightedScore)
  }
}

function gradeResponseTime(responseTime: number, thresholds: BenchmarkThresholds['responseTime']): PerformanceGrade {
  if (responseTime <= thresholds.excellent) return 'A+'
  if (responseTime <= thresholds.good) return 'A'
  if (responseTime <= thresholds.fair) return 'B'
  if (responseTime <= thresholds.poor) return 'C'
  return 'F'
}

function gradeThroughput(throughput: number, thresholds: BenchmarkThresholds['throughput']): PerformanceGrade {
  if (throughput >= thresholds.excellent) return 'A+'
  if (throughput >= thresholds.good) return 'A'
  if (throughput >= thresholds.fair) return 'B'
  if (throughput >= thresholds.poor) return 'C'
  return 'F'
}

function gradeErrorRate(errorRate: number, thresholds: BenchmarkThresholds['errorRate']): PerformanceGrade {
  if (errorRate <= thresholds.excellent) return 'A+'
  if (errorRate <= thresholds.good) return 'A'
  if (errorRate <= thresholds.fair) return 'B'
  if (errorRate <= thresholds.poor) return 'C'
  return 'F'
}

function gradeAvailability(availability: number, thresholds: BenchmarkThresholds['availability']): PerformanceGrade {
  if (availability >= thresholds.excellent) return 'A+'
  if (availability >= thresholds.good) return 'A'
  if (availability >= thresholds.fair) return 'B'
  if (availability >= thresholds.poor) return 'C'
  return 'F'
}

function gradeToScore(grade: PerformanceGrade): number {
  switch (grade) {
    case 'A+': return 97
    case 'A': return 90
    case 'B': return 80
    case 'C': return 70
    case 'D': return 60
    case 'F': return 40
  }
}

function scoreToGrade(score: number): PerformanceGrade {
  if (score >= 95) return 'A+'
  if (score >= 87) return 'A'
  if (score >= 77) return 'B'
  if (score >= 67) return 'C'
  if (score >= 57) return 'D'
  return 'F'
}

// Performance comparison utilities
export function comparePerformance(baseline: any, current: any): {
  responseTime: { change: number; improvement: boolean }
  throughput: { change: number; improvement: boolean }
  errorRate: { change: number; improvement: boolean }
} {
  const responseTimeChange = ((current.avgResponseTime - baseline.avgResponseTime) / baseline.avgResponseTime) * 100
  const throughputChange = ((current.requestsPerSecond - baseline.requestsPerSecond) / baseline.requestsPerSecond) * 100
  const errorRateChange = ((current.errorRate - baseline.errorRate) / baseline.errorRate) * 100

  return {
    responseTime: {
      change: Math.round(responseTimeChange),
      improvement: responseTimeChange < 0 // Lower is better
    },
    throughput: {
      change: Math.round(throughputChange),
      improvement: throughputChange > 0 // Higher is better
    },
    errorRate: {
      change: Math.round(errorRateChange),
      improvement: errorRateChange < 0 // Lower is better
    }
  }
}

// Generate performance report
export function generatePerformanceReport(testResults: any[]): {
  summary: {
    totalTests: number
    averageGrade: PerformanceGrade
    bestPerforming: string
    needsImprovement: string[]
  }
  trends: {
    improving: string[]
    degrading: string[]
    stable: string[]
  }
  recommendations: string[]
} {
  if (testResults.length === 0) {
    return {
      summary: {
        totalTests: 0,
        averageGrade: 'F',
        bestPerforming: 'N/A',
        needsImprovement: []
      },
      trends: {
        improving: [],
        degrading: [],
        stable: []
      },
      recommendations: ['Run performance tests to generate report']
    }
  }

  // Calculate grades for all tests
  const testGrades = testResults.map(test => {
    const errorRate = (test.results.failedRequests / test.results.totalRequests) * 100
    const availability = 100 - errorRate
    
    const grade = calculatePerformanceGrade(
      test.results.avgResponseTime,
      test.results.requestsPerSecond,
      errorRate,
      availability
    )

    return {
      testId: test.testId,
      grade: grade.overall,
      score: grade.score,
      responseTime: test.results.avgResponseTime,
      throughput: test.results.requestsPerSecond,
      errorRate,
      bottlenecks: test.bottlenecks
    }
  })

  // Find average grade
  const averageScore = testGrades.reduce((sum, test) => sum + test.score, 0) / testGrades.length
  const averageGrade = scoreToGrade(averageScore)

  // Find best performing test
  const bestTest = testGrades.reduce((best, current) => 
    current.score > best.score ? current : best
  )

  // Identify areas needing improvement
  const needsImprovement = []
  const avgResponseTime = testGrades.reduce((sum, test) => sum + test.responseTime, 0) / testGrades.length
  const avgThroughput = testGrades.reduce((sum, test) => sum + test.throughput, 0) / testGrades.length
  const avgErrorRate = testGrades.reduce((sum, test) => sum + test.errorRate, 0) / testGrades.length

  if (avgResponseTime > DEFAULT_BENCHMARKS.responseTime.fair) {
    needsImprovement.push('Response Time')
  }
  if (avgThroughput < DEFAULT_BENCHMARKS.throughput.fair) {
    needsImprovement.push('Throughput')
  }
  if (avgErrorRate > DEFAULT_BENCHMARKS.errorRate.fair) {
    needsImprovement.push('Error Rate')
  }

  // Analyze trends (if we have enough data)
  const trends = { improving: [], degrading: [], stable: [] }
  if (testGrades.length >= 4) {
    const firstHalf = testGrades.slice(0, Math.floor(testGrades.length / 2))
    const secondHalf = testGrades.slice(Math.floor(testGrades.length / 2))

    const firstHalfAvgs = {
      responseTime: firstHalf.reduce((sum, t) => sum + t.responseTime, 0) / firstHalf.length,
      throughput: firstHalf.reduce((sum, t) => sum + t.throughput, 0) / firstHalf.length,
      errorRate: firstHalf.reduce((sum, t) => sum + t.errorRate, 0) / firstHalf.length
    }

    const secondHalfAvgs = {
      responseTime: secondHalf.reduce((sum, t) => sum + t.responseTime, 0) / secondHalf.length,
      throughput: secondHalf.reduce((sum, t) => sum + t.throughput, 0) / secondHalf.length,
      errorRate: secondHalf.reduce((sum, t) => sum + t.errorRate, 0) / secondHalf.length
    }

    // Response time trend
    const rtChange = (secondHalfAvgs.responseTime - firstHalfAvgs.responseTime) / firstHalfAvgs.responseTime
    if (rtChange < -0.1) trends.improving.push('Response Time')
    else if (rtChange > 0.1) trends.degrading.push('Response Time')
    else trends.stable.push('Response Time')

    // Throughput trend
    const tpChange = (secondHalfAvgs.throughput - firstHalfAvgs.throughput) / firstHalfAvgs.throughput
    if (tpChange > 0.1) trends.improving.push('Throughput')
    else if (tpChange < -0.1) trends.degrading.push('Throughput')
    else trends.stable.push('Throughput')

    // Error rate trend
    const erChange = (secondHalfAvgs.errorRate - firstHalfAvgs.errorRate) / firstHalfAvgs.errorRate
    if (erChange < -0.1) trends.improving.push('Error Rate')
    else if (erChange > 0.1) trends.degrading.push('Error Rate')
    else trends.stable.push('Error Rate')
  }

  // Generate recommendations
  const recommendations = []
  
  if (averageGrade === 'F' || averageGrade === 'D') {
    recommendations.push('CRITICAL: System performance requires immediate attention')
    recommendations.push('Consider scaling up infrastructure and reviewing architecture')
  }
  
  if (needsImprovement.includes('Response Time')) {
    recommendations.push('Implement caching strategies and database optimization')
  }
  
  if (needsImprovement.includes('Throughput')) {
    recommendations.push('Add horizontal scaling and load balancing')
  }
  
  if (needsImprovement.includes('Error Rate')) {
    recommendations.push('Investigate error logs and improve error handling')
  }

  if (trends.degrading.length > 0) {
    recommendations.push(`Performance degradation detected in: ${trends.degrading.join(', ')}`)
  }

  if (recommendations.length === 0) {
    recommendations.push('System performance is within acceptable ranges')
    recommendations.push('Continue regular monitoring and optimization')
  }

  return {
    summary: {
      totalTests: testResults.length,
      averageGrade,
      bestPerforming: bestTest.testId,
      needsImprovement
    },
    trends,
    recommendations
  }
}

// Automated benchmark runner for CI/CD
export async function runAutomatedBenchmarks(): Promise<{
  success: boolean
  results: any[]
  summary: any
}> {
  try {
    logger.info('🤖 Running automated performance benchmarks...')
    
    const criticalScenarios = [
      'api_health_check',
      'api_standard_load',
      'cache_performance'
    ]

    const results = []
    
    for (const scenario of criticalScenarios) {
      try {
        const result = await performanceTestingService.runLoadTest(scenario)
        results.push(result)
        
        logger.info(`✅ Automated benchmark completed: ${scenario}`, {
          avgResponseTime: result.results.avgResponseTime,
          requestsPerSecond: result.results.requestsPerSecond,
          successRate: (result.results.successfulRequests / result.results.totalRequests) * 100
        })
        
      } catch (error) {
        logger.error(`❌ Automated benchmark failed: ${scenario}`, error)
        
        // Create failure result
        results.push({
          testId: `${scenario}-failed-${Date.now()}`,
          timestamp: Date.now(),
          results: {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 1,
            avgResponseTime: 10000,
            requestsPerSecond: 0,
            errorsPerSecond: 1
          },
          bottlenecks: [{
            component: 'system',
            issue: 'Benchmark test failed to execute',
            severity: 'critical',
            recommendation: 'Investigate system health and connectivity'
          }],
          error: (error as Error).message
        })
      }
    }

    const report = generatePerformanceReport(results)
    
    logger.info('📊 Automated benchmark summary', {
      totalTests: results.length,
      averageGrade: report.summary.averageGrade,
      needsImprovement: report.summary.needsImprovement
    })

    return {
      success: results.length > 0,
      results,
      summary: report
    }

  } catch (error) {
    logger.error('❌ Automated benchmarks failed:', error)
    return {
      success: false,
      results: [],
      summary: {
        error: (error as Error).message,
        recommendations: ['Fix system issues before running benchmarks']
      }
    }
  }
}

// SLA monitoring
export interface SLAThresholds {
  responseTime: number    // Max average response time (ms)
  availability: number    // Min availability percentage
  throughput: number      // Min requests per second
  errorRate: number       // Max error rate percentage
}

export function checkSLACompliance(
  testResults: any[],
  slaThresholds: SLAThresholds
): {
  compliant: boolean
  violations: Array<{
    metric: string
    actual: number
    threshold: number
    severity: 'warning' | 'violation'
  }>
  uptime: number
} {
  if (testResults.length === 0) {
    return {
      compliant: false,
      violations: [{ metric: 'data_availability', actual: 0, threshold: 100, severity: 'violation' }],
      uptime: 0
    }
  }

  const violations = []
  
  // Check average response time
  const avgResponseTime = testResults.reduce((sum, test) => 
    sum + test.results.avgResponseTime, 0) / testResults.length
    
  if (avgResponseTime > slaThresholds.responseTime) {
    violations.push({
      metric: 'response_time',
      actual: Math.round(avgResponseTime),
      threshold: slaThresholds.responseTime,
      severity: avgResponseTime > (slaThresholds.responseTime * 1.5) ? 'violation' : 'warning'
    })
  }

  // Check throughput
  const avgThroughput = testResults.reduce((sum, test) => 
    sum + test.results.requestsPerSecond, 0) / testResults.length
    
  if (avgThroughput < slaThresholds.throughput) {
    violations.push({
      metric: 'throughput',
      actual: Math.round(avgThroughput),
      threshold: slaThresholds.throughput,
      severity: avgThroughput < (slaThresholds.throughput * 0.5) ? 'violation' : 'warning'
    })
  }

  // Check error rate
  const avgErrorRate = testResults.reduce((sum, test) => {
    const errorRate = (test.results.failedRequests / test.results.totalRequests) * 100
    return sum + errorRate
  }, 0) / testResults.length
    
  if (avgErrorRate > slaThresholds.errorRate) {
    violations.push({
      metric: 'error_rate',
      actual: Number(avgErrorRate.toFixed(2)),
      threshold: slaThresholds.errorRate,
      severity: avgErrorRate > (slaThresholds.errorRate * 2) ? 'violation' : 'warning'
    })
  }

  // Calculate uptime (simplified)
  const totalRequests = testResults.reduce((sum, test) => sum + test.results.totalRequests, 0)
  const successfulRequests = testResults.reduce((sum, test) => sum + test.results.successfulRequests, 0)
  const uptime = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0

  if (uptime < slaThresholds.availability) {
    violations.push({
      metric: 'availability',
      actual: Number(uptime.toFixed(2)),
      threshold: slaThresholds.availability,
      severity: uptime < (slaThresholds.availability * 0.95) ? 'violation' : 'warning'
    })
  }

  return {
    compliant: violations.length === 0,
    violations,
    uptime
  }
}