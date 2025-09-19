import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg'
import { logger } from '../utils/logger'

interface DatabaseNode {
  id: string
  host: string
  port: number
  database: string
  role: 'primary' | 'replica'
  weight: number
  pool: Pool
  isHealthy: boolean
  lastHealthCheck: number
  connectionCount: number
  queryCount: number
  avgResponseTime: number
}

interface QueryMetrics {
  totalQueries: number
  successfulQueries: number
  failedQueries: number
  avgResponseTime: number
  slowQueries: number
  connectionErrors: number
}

interface DatabaseHealthDetails {
  totalNodes: number
  healthyNodes: number
  primaryHealthy: boolean
  metrics: ReturnType<DatabaseClusterService['getMetrics']>
}

interface LoadBalancerConfig {
  strategy: 'round_robin' | 'least_connections' | 'weighted_round_robin' | 'health_weighted'
  healthCheckInterval: number
  maxRetries: number
  queryTimeout: number
  slowQueryThreshold: number
}

export class DatabaseClusterService {
  private nodes: Map<string, DatabaseNode> = new Map()
  private metrics: QueryMetrics = {
    totalQueries: 0,
    successfulQueries: 0,
    failedQueries: 0,
    avgResponseTime: 0,
    slowQueries: 0,
    connectionErrors: 0,
  }

  private config: LoadBalancerConfig = {
    strategy: 'health_weighted',
    healthCheckInterval: 30000, // 30 seconds
    maxRetries: 3,
    queryTimeout: 10000, // 10 seconds
    slowQueryThreshold: 1000, // 1 second
  }

  private currentRoundRobinIndex = 0
  private healthCheckInterval?: NodeJS.Timeout

  async initialize(): Promise<void> {
    try {
      logger.info('🔄 Initializing Database Cluster Service...')

      // Initialize primary database
      await this.addDatabaseNode({
        id: 'primary',
        host: this.getEnvValue('DB_HOST', 'localhost'),
        port: parseInt(this.getEnvValue('DB_PORT', '5432'), 10),
        database: this.getEnvValue('DB_NAME', 'risk_game'),
        role: 'primary',
        weight: 100,
      })

      // Initialize read replicas if configured
      const replicaNodes = process.env.DB_REPLICAS
      if (replicaNodes) {
        const replicas = replicaNodes.split(',')
        for (let i = 0; i < replicas.length; i++) {
          const [host, port] = replicas[i].split(':')
          await this.addDatabaseNode({
            id: `replica-${i + 1}`,
            host: host.trim(),
            port: parseInt(port, 10) || 5432,
            database: this.getEnvValue('DB_NAME', 'risk_game'),
            role: 'replica',
            weight: 80, // Slightly lower weight for replicas
          })
        }
      }

      // Start health monitoring
      this.startHealthMonitoring()

      logger.info('✅ Database Cluster Service initialized', {
        nodes: this.nodes.size,
        primary: 1,
        replicas: this.nodes.size - 1,
      })
    } catch (error) {
      logger.error('❌ Failed to initialize Database Cluster Service:', error)
      throw error
    }
  }

  private getEnvValue(key: string, defaultValue: string): string {
    return process.env[key] || defaultValue
  }

  private async addDatabaseNode(
    nodeConfig: Omit<
      DatabaseNode,
      | 'pool'
      | 'isHealthy'
      | 'lastHealthCheck'
      | 'connectionCount'
      | 'queryCount'
      | 'avgResponseTime'
    >,
  ): Promise<void> {
    const poolConfig: PoolConfig = {
      host: nodeConfig.host,
      port: nodeConfig.port,
      database: nodeConfig.database,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      max: nodeConfig.role === 'primary' ? 20 : 15, // More connections for primary
      min: nodeConfig.role === 'primary' ? 5 : 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      statement_timeout: this.config.queryTimeout,
      query_timeout: this.config.queryTimeout,
    }

    const pool = new Pool(poolConfig)

    // Pool event handlers
    pool.on('connect', () => {
      logger.debug(`🔗 New client connected to ${nodeConfig.id}`)
    })

    pool.on('error', (error) => {
      logger.error(`❌ Database pool error on ${nodeConfig.id}:`, error)
      this.metrics.connectionErrors++
      this.markNodeUnhealthy(nodeConfig.id)
    })

    // Test connection
    try {
      const client = await pool.connect()
      await client.query('SELECT 1')
      client.release()
    } catch (error) {
      logger.error(`❌ Failed to connect to database node ${nodeConfig.id}:`, error)
      throw error
    }

    const node: DatabaseNode = {
      ...nodeConfig,
      pool,
      isHealthy: true,
      lastHealthCheck: Date.now(),
      connectionCount: 0,
      queryCount: 0,
      avgResponseTime: 0,
    }

    this.nodes.set(nodeConfig.id, node)
    logger.info(`✅ Database node added: ${nodeConfig.id} (${nodeConfig.role})`)
  }

  // Load balancing strategies
  private selectNodeForRead(): DatabaseNode | null {
    const healthyNodes = Array.from(this.nodes.values()).filter((node) => node.isHealthy)

    if (healthyNodes.length === 0) {
      logger.error('❌ No healthy database nodes available')
      return null
    }

    switch (this.config.strategy) {
      case 'round_robin':
        return this.selectRoundRobin(healthyNodes)

      case 'least_connections':
        return this.selectLeastConnections(healthyNodes)

      case 'weighted_round_robin':
        return this.selectWeightedRoundRobin(healthyNodes)
      default:
        return this.selectHealthWeighted(healthyNodes)
    }
  }

  private selectNodeForWrite(): DatabaseNode | null {
    const primaryNode = Array.from(this.nodes.values()).find(
      (node) => node.role === 'primary' && node.isHealthy,
    )

    if (!primaryNode) {
      logger.error('❌ Primary database node not available')
    }

    return primaryNode || null
  }

  private selectRoundRobin(nodes: DatabaseNode[]): DatabaseNode {
    const selected = nodes[this.currentRoundRobinIndex % nodes.length]
    this.currentRoundRobinIndex++
    return selected
  }

  private selectLeastConnections(nodes: DatabaseNode[]): DatabaseNode {
    return nodes.reduce((prev, current) =>
      current.connectionCount < prev.connectionCount ? current : prev,
    )
  }

  private selectWeightedRoundRobin(nodes: DatabaseNode[]): DatabaseNode {
    const totalWeight = nodes.reduce((sum, node) => sum + node.weight, 0)
    let random = Math.random() * totalWeight

    for (const node of nodes) {
      random -= node.weight
      if (random <= 0) {
        return node
      }
    }

    return nodes[0] // Fallback
  }

  private selectHealthWeighted(nodes: DatabaseNode[]): DatabaseNode {
    // Combine connection count, response time, and base weight
    const scoredNodes = nodes.map((node) => {
      const connectionScore = Math.max(1, 100 - node.connectionCount)
      const responseScore = Math.max(1, 100 - node.avgResponseTime / 10)
      const score = node.weight * 0.4 + connectionScore * 0.3 + responseScore * 0.3

      return { node, score }
    })

    scoredNodes.sort((a, b) => b.score - a.score)
    return scoredNodes[0].node
  }

  // Query execution with automatic retry and failover
  async query(
    text: string,
    params?: readonly unknown[],
    options: { writeQuery?: boolean; retries?: number } = {},
  ): Promise<QueryResult<QueryResultRow>> {
    const { writeQuery = false, retries = this.config.maxRetries } = options
    const startTime = Date.now()

    this.metrics.totalQueries++

    for (let attempt = 0; attempt <= retries; attempt++) {
      const node = writeQuery ? this.selectNodeForWrite() : this.selectNodeForRead()

      if (!node) {
        throw new Error(`No ${writeQuery ? 'primary' : 'available'} database node found`)
      }

      let client: PoolClient | null = null

      try {
        // Get connection from pool
        client = await node.pool.connect()
        node.connectionCount++

        // Execute query with timeout
        const queryPromise = client.query(text, params)
        const timeoutPromise: Promise<never> = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Query timeout')), this.config.queryTimeout)
        })

        const result = await Promise.race([queryPromise, timeoutPromise])

        // Update metrics
        const responseTime = Date.now() - startTime
        this.updateNodeMetrics(node, responseTime, true)
        this.metrics.successfulQueries++

        if (responseTime > this.config.slowQueryThreshold) {
          this.metrics.slowQueries++
          logger.warn(`🐌 Slow query detected (${responseTime}ms): ${text.substring(0, 100)}`)
        }

        return result
      } catch (error) {
        const responseTime = Date.now() - startTime
        this.updateNodeMetrics(node, responseTime, false)

        logger.error(`❌ Query failed on node ${node.id} (attempt ${attempt + 1}):`, error)

        if (this.isConnectionError(error as Error)) {
          this.markNodeUnhealthy(node.id)
          this.metrics.connectionErrors++
        }

        // If this is the last attempt, throw the error
        if (attempt === retries) {
          this.metrics.failedQueries++
          throw error
        }

        // Wait before retry
        await this.sleep(100 * 2 ** attempt)
      } finally {
        if (client) {
          client.release()
          node.connectionCount = Math.max(0, node.connectionCount - 1)
        }
      }
    }

    throw new Error('Query execution failed after retries')
  }

  private updateNodeMetrics(node: DatabaseNode, responseTime: number, _success: boolean): void {
    node.queryCount++

    // Update average response time using exponential moving average
    const alpha = 0.1
    node.avgResponseTime = node.avgResponseTime * (1 - alpha) + responseTime * alpha

    // Update overall metrics
    const totalResponseTime =
      this.metrics.avgResponseTime * (this.metrics.totalQueries - 1) + responseTime
    this.metrics.avgResponseTime = totalResponseTime / this.metrics.totalQueries
  }

  private isConnectionError(error: Error): boolean {
    const connectionErrorCodes = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET']
    return connectionErrorCodes.some((code) => error.message.includes(code))
  }

  private markNodeUnhealthy(nodeId: string): void {
    const node = this.nodes.get(nodeId)
    if (node) {
      node.isHealthy = false
      logger.warn(`⚠️ Marked node ${nodeId} as unhealthy`)
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  // Health monitoring
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(
      () => this.performHealthChecks(),
      this.config.healthCheckInterval,
    )

    logger.info('🔍 Started database health monitoring')
  }

  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises = Array.from(this.nodes.entries()).map(async ([nodeId, node]) => {
      try {
        const startTime = Date.now()
        const client = await node.pool.connect()
        await client.query('SELECT 1')
        client.release()

        const responseTime = Date.now() - startTime
        node.lastHealthCheck = Date.now()

        if (!node.isHealthy) {
          node.isHealthy = true
          logger.info(`✅ Node ${nodeId} is healthy again`)
        }

        // Update response time
        node.avgResponseTime = node.avgResponseTime * 0.9 + responseTime * 0.1
      } catch (error) {
        logger.warn(`⚠️ Health check failed for node ${nodeId}:`, error)
        this.markNodeUnhealthy(nodeId)
      }
    })

    await Promise.allSettled(healthCheckPromises)
  }

  // Monitoring and metrics
  getMetrics(): QueryMetrics & {
    nodes: Array<{
      id: string
      role: string
      isHealthy: boolean
      connectionCount: number
      avgResponseTime: number
    }>
  } {
    const nodeMetrics = Array.from(this.nodes.values()).map((node) => ({
      id: node.id,
      role: node.role,
      isHealthy: node.isHealthy,
      connectionCount: node.connectionCount,
      avgResponseTime: Math.round(node.avgResponseTime),
    }))

    return {
      ...this.metrics,
      nodes: nodeMetrics,
    }
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'degraded'; details: DatabaseHealthDetails }> {
    const healthyNodes = Array.from(this.nodes.values()).filter((node) => node.isHealthy)
    const hasHealthyPrimary = healthyNodes.some((node) => node.role === 'primary')

    const status: 'healthy' | 'degraded' = hasHealthyPrimary ? 'healthy' : 'degraded'

    return {
      status,
      details: {
        totalNodes: this.nodes.size,
        healthyNodes: healthyNodes.length,
        primaryHealthy: hasHealthyPrimary,
        metrics: this.getMetrics(),
      },
    }
  }

  async shutdown(): Promise<void> {
    logger.info('🔄 Shutting down Database Cluster Service...')

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }

    const shutdownPromises = Array.from(this.nodes.values()).map((node) => node.pool.end())

    await Promise.allSettled(shutdownPromises)

    logger.info('✅ Database Cluster Service shutdown complete')
  }
}

// Export singleton instance
export const databaseClusterService = new DatabaseClusterService()
