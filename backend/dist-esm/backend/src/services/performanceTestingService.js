import axios from 'axios';
import { logger } from '../utils/logger.js';
import { databaseClusterService } from './databaseClusterService.js';
import { performanceMonitorService } from './performanceMonitorService.js';
import { redisClusterService } from './redisClusterService.js';
import { scalingService } from './scalingService.js';
export class PerformanceTestingService {
    constructor() {
        this.activeTests = new Map();
        this.benchmarkHistory = [];
        this.testScenarios = new Map();
        this.initializeTestScenarios();
    }
    initializeTestScenarios() {
        this.testScenarios.set('api_health_check', {
            duration: 60,
            concurrency: 50,
            rampUp: 10,
            endpoints: [{ path: '/health', method: 'GET', weight: 1 }],
        });
        this.testScenarios.set('api_standard_load', {
            duration: 300,
            concurrency: 100,
            rampUp: 30,
            endpoints: [
                { path: '/api/games', method: 'GET', weight: 3 },
                { path: '/api/games/:id', method: 'GET', weight: 2 },
                { path: '/api/users/me', method: 'GET', weight: 2 },
                { path: '/api/skills/leaderboards/skill', method: 'GET', weight: 1 },
            ],
        });
        this.testScenarios.set('api_peak_load', {
            duration: 600,
            concurrency: 500,
            rampUp: 60,
            endpoints: [
                { path: '/api/games', method: 'GET', weight: 5 },
                {
                    path: '/api/games',
                    method: 'POST',
                    weight: 1,
                    payload: { name: 'Test Game', players: 4 },
                },
                { path: '/api/games/:id/join', method: 'POST', weight: 2 },
                {
                    path: '/api/games/:id/move',
                    method: 'POST',
                    weight: 10,
                    payload: { action: 'attack', from: 1, to: 2 },
                },
                { path: '/api/users/me', method: 'GET', weight: 3 },
                { path: '/api/skills/leaderboards/skill', method: 'GET', weight: 2 },
            ],
        });
        this.testScenarios.set('database_stress', {
            duration: 180,
            concurrency: 200,
            rampUp: 20,
            endpoints: [
                { path: '/api/games/:id', method: 'GET', weight: 10 },
                { path: '/api/users/:id/stats', method: 'GET', weight: 5 },
                { path: '/api/games/:id/history', method: 'GET', weight: 3 },
                { path: '/api/skills/leaderboards/skill', method: 'GET', weight: 2 },
            ],
        });
        this.testScenarios.set('cache_performance', {
            duration: 120,
            concurrency: 150,
            rampUp: 15,
            endpoints: [
                { path: '/api/games', method: 'GET', weight: 8 },
                { path: '/api/skills/leaderboards/skill', method: 'GET', weight: 5 },
                { path: '/api/maps', method: 'GET', weight: 3 },
                { path: '/api/users/search?q=test', method: 'GET', weight: 2 },
            ],
        });
        logger.info('✅ Performance test scenarios initialized', {
            scenarios: this.testScenarios.size,
        });
    }
    async runLoadTest(scenarioName) {
        const config = this.testScenarios.get(scenarioName);
        if (!config) {
            throw new Error(`Unknown test scenario: ${scenarioName}`);
        }
        const testId = `load-test-${scenarioName}-${Date.now()}`;
        logger.info('🚀 Starting load test', {
            testId,
            scenario: scenarioName,
            duration: config.duration,
            concurrency: config.concurrency,
        });
        const metricsCollector = this.startMetricsCollection(testId);
        try {
            const testResults = await this.executeLoadTest(testId, config);
            const systemMetrics = await this.stopMetricsCollection(metricsCollector, testId);
            const bottlenecks = this.analyzeBottlenecks(testResults, systemMetrics);
            const benchmarkResult = {
                testId,
                timestamp: Date.now(),
                config,
                results: testResults,
                systemMetrics,
                bottlenecks,
            };
            this.benchmarkHistory.push(benchmarkResult);
            this.activeTests.delete(testId);
            logger.info('✅ Load test completed', {
                testId,
                successRate: (testResults.successfulRequests / testResults.totalRequests) * 100,
                avgResponseTime: testResults.avgResponseTime,
                rps: testResults.requestsPerSecond,
            });
            return benchmarkResult;
        }
        catch (error) {
            this.activeTests.delete(testId);
            await this.stopMetricsCollection(metricsCollector, testId);
            throw error;
        }
    }
    async runGameScenarioTest(config) {
        const testId = `game-scenario-${config.scenario}-${Date.now()}`;
        logger.info('🎮 Starting game scenario test', {
            testId,
            scenario: config.scenario,
            players: config.players,
            games: config.gameCount,
            duration: config.duration,
        });
        const metricsCollector = this.startMetricsCollection(testId);
        try {
            const testResults = await this.executeGameScenario(testId, config);
            const systemMetrics = await this.stopMetricsCollection(metricsCollector, testId);
            const finalResults = testResults || {
                totalRequests: 0,
                successfulRequests: 0,
                failedRequests: 0,
                avgResponseTime: 0,
                p95ResponseTime: 0,
                p99ResponseTime: 0,
                requestsPerSecond: 0,
                errorsPerSecond: 0,
                throughputMBps: 0,
            };
            const bottlenecks = this.analyzeBottlenecks(finalResults, systemMetrics);
            const benchmarkResult = {
                testId,
                timestamp: Date.now(),
                config,
                results: testResults,
                systemMetrics,
                bottlenecks,
            };
            this.benchmarkHistory.push(benchmarkResult);
            this.activeTests.delete(testId);
            logger.info('✅ Game scenario test completed', {
                testId,
                totalGames: config.gameCount,
                avgResponseTime: testResults.avgResponseTime,
            });
            return benchmarkResult;
        }
        catch (error) {
            this.activeTests.delete(testId);
            await this.stopMetricsCollection(metricsCollector, testId);
            throw error;
        }
    }
    async runStressTest(maxConcurrency = 1000) {
        const testId = `stress-test-${Date.now()}`;
        logger.info('💥 Starting stress test', {
            testId,
            maxConcurrency,
            strategy: 'gradual increase until failure',
        });
        const metricsCollector = this.startMetricsCollection(testId);
        const degradationPoints = [];
        let currentConcurrency = 10;
        let breakingPoint = null;
        let testResults = null;
        try {
            while (currentConcurrency <= maxConcurrency && !breakingPoint) {
                logger.info(`📈 Testing concurrency level: ${currentConcurrency}`);
                const stepConfig = {
                    duration: 60,
                    concurrency: currentConcurrency,
                    rampUp: 10,
                    endpoints: [
                        { path: '/api/games', method: 'GET', weight: 5 },
                        { path: '/api/games/:id', method: 'GET', weight: 3 },
                        {
                            path: '/api/games/:id/move',
                            method: 'POST',
                            weight: 2,
                            payload: { action: 'move', from: 1, to: 2 },
                        },
                    ],
                };
                const stepResults = await this.executeLoadTest(`${testId}-${currentConcurrency}`, stepConfig);
                testResults = stepResults;
                const errorRate = (stepResults.failedRequests / stepResults.totalRequests) * 100;
                degradationPoints.push({
                    concurrency: currentConcurrency,
                    responseTimeMs: stepResults.avgResponseTime,
                    errorRate,
                });
                if (errorRate > 5 || stepResults.avgResponseTime > 5000) {
                    breakingPoint = {
                        maxConcurrentUsers: currentConcurrency,
                        maxRequestsPerSecond: stepResults.requestsPerSecond,
                        firstFailureAt: Date.now(),
                        recoveryTime: 0,
                    };
                    logger.warn('💥 Breaking point detected!', {
                        concurrency: currentConcurrency,
                        errorRate: errorRate.toFixed(2),
                        avgResponseTime: stepResults.avgResponseTime,
                    });
                }
                currentConcurrency += Math.ceil(currentConcurrency * 0.2);
            }
            if (breakingPoint) {
                logger.info('🔄 Testing system recovery...');
                const recoveryStart = Date.now();
                await new Promise((resolve) => setTimeout(resolve, 30000));
                const recoveryConfig = {
                    duration: 30,
                    concurrency: Math.floor(breakingPoint.maxConcurrentUsers * 0.5),
                    rampUp: 5,
                    endpoints: [{ path: '/health', method: 'GET', weight: 1 }],
                };
                const recoveryResults = await this.executeLoadTest(`${testId}-recovery`, recoveryConfig);
                const recoveryErrorRate = (recoveryResults.failedRequests / recoveryResults.totalRequests) * 100;
                if (recoveryErrorRate < 1) {
                    breakingPoint.recoveryTime = Date.now() - recoveryStart;
                    logger.info('✅ System recovered', { recoveryTimeMs: breakingPoint.recoveryTime });
                }
            }
            const systemMetrics = await this.stopMetricsCollection(metricsCollector, testId);
            const finalResults = testResults || {
                totalRequests: 0,
                successfulRequests: 0,
                failedRequests: 0,
                avgResponseTime: 0,
                p95ResponseTime: 0,
                p99ResponseTime: 0,
                requestsPerSecond: 0,
                errorsPerSecond: 0,
                throughputMBps: 0,
            };
            const bottlenecks = this.analyzeBottlenecks(finalResults, systemMetrics);
            const stressTestResult = {
                testId,
                timestamp: Date.now(),
                config: {
                    maxConcurrency,
                    players: maxConcurrency,
                    gameCount: 1,
                    actionsPerMinute: 60,
                    duration: 1800,
                    scenario: 'stress_test',
                },
                results: finalResults,
                systemMetrics,
                bottlenecks,
                breakingPoint: breakingPoint || {
                    maxConcurrentUsers: maxConcurrency,
                    maxRequestsPerSecond: 0,
                    firstFailureAt: 0,
                    recoveryTime: 0,
                },
                degradationPoints,
            };
            this.benchmarkHistory.push(stressTestResult);
            this.activeTests.delete(testId);
            logger.info('✅ Stress test completed', {
                testId,
                maxStableConcurrency: breakingPoint?.maxConcurrentUsers || maxConcurrency,
                totalSteps: degradationPoints.length,
            });
            return stressTestResult;
        }
        catch (error) {
            this.activeTests.delete(testId);
            await this.stopMetricsCollection(metricsCollector, testId);
            throw error;
        }
    }
    async executeLoadTest(testId, config) {
        const startTime = Date.now();
        const results = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            responseTimes: [],
            throughputBytes: 0,
        };
        const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:5001';
        const workers = [];
        const requestsPerWorker = Math.ceil(config.concurrency / 10);
        const actualWorkers = Math.min(10, config.concurrency);
        for (let w = 0; w < actualWorkers; w++) {
            workers.push(this.createLoadTestWorker(testId, config, baseUrl, requestsPerWorker));
        }
        const workerResults = await Promise.allSettled(workers);
        workerResults.forEach((result) => {
            if (result.status === 'fulfilled') {
                results.totalRequests += result.value.totalRequests;
                results.successfulRequests += result.value.successfulRequests;
                results.failedRequests += result.value.failedRequests;
                results.responseTimes.push(...result.value.responseTimes);
                results.throughputBytes += result.value.throughputBytes;
            }
        });
        const duration = (Date.now() - startTime) / 1000;
        const sortedResponseTimes = results.responseTimes.sort((a, b) => a - b);
        return {
            totalRequests: results.totalRequests,
            successfulRequests: results.successfulRequests,
            failedRequests: results.failedRequests,
            avgResponseTime: results.responseTimes.reduce((sum, rt) => sum + rt, 0) / results.responseTimes.length || 0,
            p95ResponseTime: sortedResponseTimes[Math.floor(sortedResponseTimes.length * 0.95)] || 0,
            p99ResponseTime: sortedResponseTimes[Math.floor(sortedResponseTimes.length * 0.99)] || 0,
            requestsPerSecond: results.totalRequests / duration,
            errorsPerSecond: results.failedRequests / duration,
            throughputMBps: results.throughputBytes / (1024 * 1024) / duration,
        };
    }
    async createLoadTestWorker(testId, config, baseUrl, requestCount) {
        const results = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            responseTimes: [],
            throughputBytes: 0,
        };
        const endTime = Date.now() + config.duration * 1000;
        const rampUpEnd = Date.now() + config.rampUp * 1000;
        while (Date.now() < endTime && this.activeTests.has(testId)) {
            const now = Date.now();
            if (now < rampUpEnd) {
                const rampUpProgress = (now - (endTime - config.duration * 1000)) / (config.rampUp * 1000);
                const delay = Math.max(0, (1000 / requestCount) * (1 - rampUpProgress));
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
            const endpoint = this.selectWeightedEndpoint(config.endpoints);
            const url = `${baseUrl}${endpoint.path.replace(':id', '1')}`;
            try {
                const startTime = Date.now();
                const response = await axios({
                    method: endpoint.method,
                    url,
                    data: endpoint.payload,
                    headers: {
                        'Content-Type': 'application/json',
                        ...endpoint.headers,
                    },
                    timeout: 10000,
                    validateStatus: () => true,
                });
                const responseTime = Date.now() - startTime;
                results.totalRequests++;
                results.responseTimes.push(responseTime);
                if (response.status >= 200 && response.status < 400) {
                    results.successfulRequests++;
                }
                else {
                    results.failedRequests++;
                }
                const responseSize = JSON.stringify(response.data || '').length;
                results.throughputBytes += responseSize;
            }
            catch (_error) {
                results.totalRequests++;
                results.failedRequests++;
                results.responseTimes.push(10000);
            }
        }
        return results;
    }
    selectWeightedEndpoint(endpoints) {
        const totalWeight = endpoints.reduce((sum, ep) => sum + ep.weight, 0);
        let random = Math.random() * totalWeight;
        for (const endpoint of endpoints) {
            random -= endpoint.weight;
            if (random <= 0) {
                return endpoint;
            }
        }
        return endpoints[0];
    }
    async executeGameScenario(testId, config) {
        const _baseUrl = process.env.TEST_BASE_URL || 'http://localhost:5001';
        const _results = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            responseTimes: [],
            throughputBytes: 0,
        };
        const gameActions = [
            { path: '/api/games', method: 'POST', weight: 1 },
            { path: '/api/games/:id/join', method: 'POST', weight: 2 },
            { path: '/api/games/:id/move', method: 'POST', weight: 10 },
            { path: '/api/games/:id', method: 'GET', weight: 5 },
        ];
        const loadTestConfig = {
            duration: config.duration,
            concurrency: config.players,
            rampUp: Math.min(30, config.duration / 4),
            endpoints: gameActions,
        };
        return this.executeLoadTest(testId, loadTestConfig);
    }
    startMetricsCollection(testId) {
        const metrics = {
            cpuUsage: [],
            memoryUsage: [],
            dbConnections: [],
            cacheHitRate: [],
            activeWorkers: [],
        };
        this.activeTests.set(testId, { metrics, startTime: Date.now() });
        return setInterval(async () => {
            try {
                const current = performanceMonitorService.getCurrentMetrics();
                const scaling = scalingService.getMetrics();
                const cache = redisClusterService.getMetrics();
                const _db = await databaseClusterService.getMetrics();
                if (current) {
                    metrics.cpuUsage.push(0);
                    metrics.memoryUsage.push(current.server.memoryUsage.heapUsed / (1024 * 1024));
                    metrics.dbConnections.push(current.database.connectionPoolSize);
                    metrics.cacheHitRate.push(cache.hitRate);
                    metrics.activeWorkers.push(scaling.activeWorkers);
                }
            }
            catch (error) {
                logger.warn('Failed to collect metrics during test:', error);
            }
        }, 5000);
    }
    async stopMetricsCollection(collector, testId) {
        clearInterval(collector);
        const fallback = {
            cpuUsage: [],
            memoryUsage: [],
            dbConnections: [],
            cacheHitRate: [],
            activeWorkers: [],
        };
        if (!testId) {
            return fallback;
        }
        return this.activeTests.get(testId)?.metrics ?? fallback;
    }
    analyzeBottlenecks(results, systemMetrics) {
        const bottlenecks = [];
        if (results.avgResponseTime > 1000) {
            bottlenecks.push({
                component: 'response_time',
                issue: `High average response time: ${results.avgResponseTime}ms`,
                severity: results.avgResponseTime > 3000 ? 'critical' : 'high',
                recommendation: 'Consider caching, database optimization, or scaling up',
            });
        }
        const errorRate = (results.failedRequests / results.totalRequests) * 100;
        if (errorRate > 1) {
            bottlenecks.push({
                component: 'error_rate',
                issue: `High error rate: ${errorRate.toFixed(2)}%`,
                severity: errorRate > 5 ? 'critical' : errorRate > 2 ? 'high' : 'medium',
                recommendation: 'Investigate error logs and increase system capacity',
            });
        }
        const avgCacheHitRate = systemMetrics.cacheHitRate.reduce((sum, rate) => sum + rate, 0) /
            systemMetrics.cacheHitRate.length;
        if (avgCacheHitRate < 85) {
            bottlenecks.push({
                component: 'cache',
                issue: `Low cache hit rate: ${avgCacheHitRate.toFixed(1)}%`,
                severity: avgCacheHitRate < 70 ? 'high' : 'medium',
                recommendation: 'Review cache TTL settings and implement cache warming',
            });
        }
        const maxMemory = Math.max(...systemMetrics.memoryUsage);
        if (maxMemory > 800) {
            bottlenecks.push({
                component: 'memory',
                issue: `High memory usage: ${maxMemory.toFixed(0)}MB`,
                severity: maxMemory > 1200 ? 'critical' : 'medium',
                recommendation: 'Implement memory optimization or scale up instances',
            });
        }
        return bottlenecks;
    }
    getActiveTests() {
        return Array.from(this.activeTests.keys());
    }
    getBenchmarkHistory(limit = 50) {
        return this.benchmarkHistory.slice(-limit);
    }
    getTestScenarios() {
        return Array.from(this.testScenarios.keys());
    }
    async stopTest(testId) {
        if (this.activeTests.has(testId)) {
            this.activeTests.delete(testId);
            logger.info(`🛑 Test ${testId} stopped by user request`);
            return true;
        }
        return false;
    }
    generateBenchmarkReport() {
        const recentTests = this.benchmarkHistory.slice(-10);
        if (recentTests.length === 0) {
            return {
                summary: { totalTests: 0, avgResponseTime: 0, avgThroughput: 0, commonBottlenecks: [] },
                trends: { responseTimeImprovement: 0, throughputImprovement: 0, stabilityImprovement: 0 },
                recommendations: ['Run performance tests to gather benchmark data'],
            };
        }
        const avgResponseTime = recentTests.reduce((sum, test) => sum + test.results.avgResponseTime, 0) / recentTests.length;
        const avgThroughput = recentTests.reduce((sum, test) => sum + test.results.requestsPerSecond, 0) /
            recentTests.length;
        const allBottlenecks = recentTests.flatMap((test) => test.bottlenecks.map((b) => b.component));
        const bottleneckCounts = allBottlenecks.reduce((acc, component) => {
            acc[component] = (acc[component] || 0) + 1;
            return acc;
        }, {});
        const commonBottlenecks = Object.entries(bottleneckCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([component]) => component);
        const firstHalf = recentTests.slice(0, Math.floor(recentTests.length / 2));
        const secondHalf = recentTests.slice(Math.floor(recentTests.length / 2));
        const firstHalfAvgRT = firstHalf.reduce((sum, test) => sum + test.results.avgResponseTime, 0) / firstHalf.length;
        const secondHalfAvgRT = secondHalf.reduce((sum, test) => sum + test.results.avgResponseTime, 0) / secondHalf.length;
        const firstHalfThroughput = firstHalf.reduce((sum, test) => sum + test.results.requestsPerSecond, 0) / firstHalf.length;
        const secondHalfThroughput = secondHalf.reduce((sum, test) => sum + test.results.requestsPerSecond, 0) / secondHalf.length;
        const responseTimeImprovement = ((firstHalfAvgRT - secondHalfAvgRT) / firstHalfAvgRT) * 100;
        const throughputImprovement = ((secondHalfThroughput - firstHalfThroughput) / firstHalfThroughput) * 100;
        const recommendations = [];
        if (avgResponseTime > 500)
            recommendations.push('Implement caching and database optimization');
        if (commonBottlenecks.includes('memory'))
            recommendations.push('Scale up server instances or optimize memory usage');
        if (commonBottlenecks.includes('cache'))
            recommendations.push('Improve cache hit rates and TTL configuration');
        if (avgThroughput < 100)
            recommendations.push('Consider horizontal scaling and load balancing');
        return {
            summary: {
                totalTests: this.benchmarkHistory.length,
                avgResponseTime: Math.round(avgResponseTime),
                avgThroughput: Math.round(avgThroughput),
                commonBottlenecks,
            },
            trends: {
                responseTimeImprovement: Math.round(responseTimeImprovement),
                throughputImprovement: Math.round(throughputImprovement),
                stabilityImprovement: 0,
            },
            recommendations: recommendations.length > 0 ? recommendations : ['System performance is optimal'],
        };
    }
}
export const performanceTestingService = new PerformanceTestingService();
//# sourceMappingURL=performanceTestingService.js.map