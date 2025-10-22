/**
 * @fileoverview This service manages a cluster of database nodes, providing load balancing, health checks, and failover for database queries.
 * @module services/databaseClusterService
 */
import { URL } from 'node:url'
import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg'
import { logger } from '../utils/logger.js'

/**
 * @interface DatabaseNode
 * @description Represents a single node in the database cluster.
 */
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

/**
 * @interface QueryMetrics
 * @description Represents the metrics for the database cluster.
 */
interface QueryMetrics {
  totalQueries: number
  successfulQueries: number
  failedQueries: number
  avgResponseTime: number
  slowQueries: number
  connectionErrors: number
}

export interface TimedPromise<T> {
  promise: Promise<T>
  cancel: () => void
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorFactory: () => Error = () => new Error('Query timeout'),
): TimedPromise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const timeoutPromise: Promise<never> = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      timeoutId = null
      reject(errorFactory())
    }, timeoutMs)
  })

  const cancel = (): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  return {
    promise: Promise.race([promise, timeoutPromise]),
    cancel,
  }
}

interface DatabaseHealthDetails {
  totalNodes: number
  healthyNodes: number
  primaryHealthy: boolean
  metrics: ReturnType<DatabaseClusterService['getMetrics']>
}

/**
 * @interface LoadBalancerConfig
 * @description Configuration for the load balancer.
 */
interface LoadBalancerConfig {
  strategy: 'round_robin' | 'least_connections' | 'weighted_round_robin' | 'health_weighted'
  healthCheckInterval: number
  maxRetries: number
  queryTimeout: number
  slowQueryThreshold: number
}

/**
 * @class DatabaseClusterService
 * @description Manages a cluster of database nodes, providing load balancing, health checks, and failover.
 */
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

  /**
   * Initializes the database cluster service, adding the primary node and any configured replicas.
   * @returns {Promise<void>}
   */
  async initialize(): Promise<void> {
    try {
      logger.info('🔄 Initializing Database Cluster Service...')

      // Initialize primary database
      const databaseUrl = process.env.DATABASE_URL
      if (databaseUrl) {
        // Parse DATABASE_URL to populate node details for monitoring
        try {
          const u = new URL(databaseUrl)
          const host = u.hostname
          const port = u.port ? parseInt(u.port, 10) : 5432
          const database = u.pathname.replace(/^\//, '') || 'postgres'
          const user = decodeURIComponent(u.username || 'postgres')
          const password = decodeURIComponent(u.password || '')
          const isRailway = databaseUrl.includes('railway')
          await this.addDatabaseNode({
            id: 'primary',
            host,
            port,
            database,
            role: 'primary',
            weight: 100,
            // Prefer connection string (inherits all flags, ssl, etc.)
            connectionString: databaseUrl,
            user,
            password,
            ssl: isRailway || process.env.NODE_ENV === 'production',
          })
        } catch (e) {
          logger.warn(
            'Failed to parse DATABASE_URL for cluster service, falling back to DB_* vars',
            e,
          )
          await this.addDatabaseNode({
            id: 'primary',
            host: this.getEnvValue('DB_HOST', 'localhost'),
            port: parseInt(this.getEnvValue('DB_PORT', '5432'), 10),
            database: this.getEnvValue('DB_NAME', 'risk_game'),
            role: 'primary',
            weight: 100,
          })
        }
      } else {
        await this.addDatabaseNode({
          id: 'primary',
          host: this.getEnvValue('DB_HOST', 'localhost'),
          port: parseInt(this.getEnvValue('DB_PORT', '5432'), 10),
          database: this.getEnvValue('DB_NAME', 'risk_game'),
          role: 'primary',
          weight: 100,
        })
      }

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

  /**
   * Retrieves an environment variable value with a default fallback.
   * @param {string} key - The environment variable key.
   * @param {string} defaultValue - The default value to use if the key is not found.
   * @returns {string} The environment variable value or the default.
   * @private
   */
  private getEnvValue(key: string, defaultValue: string): string {
    return process.env[key] || defaultValue
  }

  /**
   * Adds a new database node to the cluster.
   * @param {object} nodeConfig - The configuration for the new node.
   * @returns {Promise<void>}
   * @private
   */
  private async addDatabaseNode(
    nodeConfig: Omit<
      DatabaseNode,
      | 'pool'
      | 'isHealthy'
      | 'lastHealthCheck'
      | 'connectionCount'
      | 'queryCount'
      | 'avgResponseTime'
    > & { user?: string; password?: string; connectionString?: string; ssl?: boolean },
  ): Promise<void> {
    const basePoolConfig = {
      max: nodeConfig.role === 'primary' ? 20 : 15,
      min: nodeConfig.role === 'primary' ? 5 : 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      statement_timeout: this.config.queryTimeout,
      query_timeout: this.config.queryTimeout,
    } as PoolConfig

    const poolConfig: PoolConfig = nodeConfig.connectionString
      ? {
          ...basePoolConfig,
          connectionString: nodeConfig.connectionString,
          ssl: nodeConfig.ssl ? { rejectUnauthorized: false } : undefined,
          application_name: 'conquestk-db-cluster',
        }
      : {
          ...basePoolConfig,
          host: nodeConfig.host,
          port: nodeConfig.port,
          database: nodeConfig.database,
          user: nodeConfig.user || process.env.DB_USER || 'postgres',
          password: nodeConfig.password || process.env.DB_PASSWORD,
          application_name: 'conquestk-db-cluster',
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
  /**
   * Selects a database node for a read query based on the configured load balancing strategy.
   * @returns {DatabaseNode | null} The selected database node, or null if no healthy nodes are available.
   * @private
   */
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

  /**
   * Selects the primary database node for a write query.
   * @returns {DatabaseNode | null} The primary database node, or null if it's not healthy or available.
   * @private
   */
  private selectNodeForWrite(): DatabaseNode | null {
    const primaryNode = Array.from(this.nodes.values()).find(
      (node) => node.role === 'primary' && node.isHealthy,
    )

    if (!primaryNode) {
      logger.error('❌ Primary database node not available')
    }

    return primaryNode || null
  }

  /**
   * Selects a node using the round-robin strategy.
   * @param {DatabaseNode[]} nodes - The list of healthy nodes.
   * @returns {DatabaseNode} The selected node.
   * @private
   */
  private selectRoundRobin(nodes: DatabaseNode[]): DatabaseNode {
    const selected = nodes[this.currentRoundRobinIndex % nodes.length]
    this.currentRoundRobinIndex++
    return selected
  }

  /**
   * Selects a node using the least connections strategy.
   * @param {DatabaseNode[]} nodes - The list of healthy nodes.
   * @returns {DatabaseNode} The selected node.
   * @private
   */
  private selectLeastConnections(nodes: DatabaseNode[]): DatabaseNode {
    return nodes.reduce((prev, current) =>
      current.connectionCount < prev.connectionCount ? current : prev,
    )
  }

  /**
   * Selects a node using the weighted round-robin strategy.
   * @param {DatabaseNode[]} nodes - The list of healthy nodes.
   * @returns {DatabaseNode} The selected node.
   * @private
   */
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

  /**
   * Selects a node using a health-weighted strategy, considering connections, response time, and weight.
   * @param {DatabaseNode[]} nodes - The list of healthy nodes.
   * @returns {DatabaseNode} The selected node.
   * @private
   */
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
  /**
   * Executes a database query with automatic failover and retry logic.
   * @param {string} text - The SQL query text.
   * @param {readonly unknown[]} [params] - The query parameters.
   * @param {object} [options] - Options for the query, including whether it's a write query and the number of retries.
   * @returns {Promise<QueryResult<QueryResultRow>>} The result of the query.
   * @throws {Error} If the query fails after all retries.
   */
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
      let cancelQueryTimeout: (() => void) | null = null

      try {
        // Get connection from pool
        client = await node.pool.connect()
        node.connectionCount++

        // Execute query with timeout
        const queryPromise = params ? client.query(text, [...params]) : client.query(text)
        const { promise: timedQuery, cancel } = withTimeout(queryPromise, this.config.queryTimeout)
        cancelQueryTimeout = cancel

        const result = await timedQuery
        if (cancelQueryTimeout) {
          cancelQueryTimeout()
          cancelQueryTimeout = null
        }

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
        if (cancelQueryTimeout) {
          cancelQueryTimeout()
          cancelQueryTimeout = null
        }
        if (client) {
          client.release()
          node.connectionCount = Math.max(0, node.connectionCount - 1)
        }
      }
    }

    throw new Error('Query execution failed after retries')
  }

  /**
   * Updates the metrics for a database node after a query.
   * @param {DatabaseNode} node - The node to update.
   * @param {number} responseTime - The response time of the query.
   * @param {boolean} _success - Whether the query was successful.
   * @private
   */
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

  /**
   * Checks if an error is a connection-related error.
   * @param {Error} error - The error to check.
   * @returns {boolean} True if it is a connection error, false otherwise.
   * @private
   */
  private isConnectionError(error: Error): boolean {
    const connectionErrorCodes = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET']
    return connectionErrorCodes.some((code) => error.message.includes(code))
  }

  /**
   * Marks a node as unhealthy.
   * @param {string} nodeId - The ID of the node to mark as unhealthy.
   * @private
   */
  private markNodeUnhealthy(nodeId: string): void {
    const node = this.nodes.get(nodeId)
    if (node) {
      node.isHealthy = false
      logger.warn(`⚠️ Marked node ${nodeId} as unhealthy`)
    }
  }

  /**
   * Pauses execution for a specified duration.
   * @param {number} ms - The number of milliseconds to sleep.
   * @returns {Promise<void>}
   * @private
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  // Health monitoring
  /**
   * Starts the periodic health monitoring of the database nodes.
   * @private
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(
      () => this.performHealthChecks(),
      this.config.healthCheckInterval,
    )

    logger.info('🔍 Started database health monitoring')
  }

  /**
   * Performs health checks on all nodes in the cluster.
   * @private
   */
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
  /**
   * Retrieves the current metrics for the database cluster.
   * @returns {QueryMetrics & { nodes: Array<{ id: string; role: string; isHealthy: boolean; connectionCount: number; avgResponseTime: number; }> }} The current metrics.
   */
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

  /**
   * Performs a health check on the database cluster.
   * @returns {Promise<{ status: 'healthy' | 'degraded' | 'not_configured'; details: DatabaseHealthDetails }>} The health status and details of the cluster.
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'not_configured'
    details: DatabaseHealthDetails
  }> {
    // If the service hasn't been initialized and no nodes configured, treat as not configured
    if (this.nodes.size === 0) {
      return {
        status: 'not_configured',
        details: {
          totalNodes: 0,
          healthyNodes: 0,
          primaryHealthy: false,
          metrics: {
            ...this.getMetrics(),
            // Ensure nodes array is empty and counters are zeroed to avoid confusion
            totalQueries: 0,
            successfulQueries: 0,
            failedQueries: 0,
            avgResponseTime: 0,
            slowQueries: 0,
            connectionErrors: 0,
            nodes: [],
          },
        },
      }
    }

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

  /**
   * Shuts down the database cluster service, closing all connection pools.
   * @returns {Promise<void>}
   */
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
