"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.databaseClusterService = exports.DatabaseClusterService = void 0;
const pg_1 = require("pg");
const logger_js_1 = require("../utils/logger.js");
class DatabaseClusterService {
    constructor() {
        this.nodes = new Map();
        this.metrics = {
            totalQueries: 0,
            successfulQueries: 0,
            failedQueries: 0,
            avgResponseTime: 0,
            slowQueries: 0,
            connectionErrors: 0,
        };
        this.config = {
            strategy: 'health_weighted',
            healthCheckInterval: 30000,
            maxRetries: 3,
            queryTimeout: 10000,
            slowQueryThreshold: 1000,
        };
        this.currentRoundRobinIndex = 0;
    }
    async initialize() {
        try {
            logger_js_1.logger.info('🔄 Initializing Database Cluster Service...');
            await this.addDatabaseNode({
                id: 'primary',
                host: this.getEnvValue('DB_HOST', 'localhost'),
                port: parseInt(this.getEnvValue('DB_PORT', '5432'), 10),
                database: this.getEnvValue('DB_NAME', 'risk_game'),
                role: 'primary',
                weight: 100,
            });
            const replicaNodes = process.env.DB_REPLICAS;
            if (replicaNodes) {
                const replicas = replicaNodes.split(',');
                for (let i = 0; i < replicas.length; i++) {
                    const [host, port] = replicas[i].split(':');
                    await this.addDatabaseNode({
                        id: `replica-${i + 1}`,
                        host: host.trim(),
                        port: parseInt(port, 10) || 5432,
                        database: this.getEnvValue('DB_NAME', 'risk_game'),
                        role: 'replica',
                        weight: 80,
                    });
                }
            }
            this.startHealthMonitoring();
            logger_js_1.logger.info('✅ Database Cluster Service initialized', {
                nodes: this.nodes.size,
                primary: 1,
                replicas: this.nodes.size - 1,
            });
        }
        catch (error) {
            logger_js_1.logger.error('❌ Failed to initialize Database Cluster Service:', error);
            throw error;
        }
    }
    getEnvValue(key, defaultValue) {
        return process.env[key] || defaultValue;
    }
    async addDatabaseNode(nodeConfig) {
        const poolConfig = {
            host: nodeConfig.host,
            port: nodeConfig.port,
            database: nodeConfig.database,
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD,
            max: nodeConfig.role === 'primary' ? 20 : 15,
            min: nodeConfig.role === 'primary' ? 5 : 2,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
            statement_timeout: this.config.queryTimeout,
            query_timeout: this.config.queryTimeout,
        };
        const pool = new pg_1.Pool(poolConfig);
        pool.on('connect', () => {
            logger_js_1.logger.debug(`🔗 New client connected to ${nodeConfig.id}`);
        });
        pool.on('error', (error) => {
            logger_js_1.logger.error(`❌ Database pool error on ${nodeConfig.id}:`, error);
            this.metrics.connectionErrors++;
            this.markNodeUnhealthy(nodeConfig.id);
        });
        try {
            const client = await pool.connect();
            await client.query('SELECT 1');
            client.release();
        }
        catch (error) {
            logger_js_1.logger.error(`❌ Failed to connect to database node ${nodeConfig.id}:`, error);
            throw error;
        }
        const node = {
            ...nodeConfig,
            pool,
            isHealthy: true,
            lastHealthCheck: Date.now(),
            connectionCount: 0,
            queryCount: 0,
            avgResponseTime: 0,
        };
        this.nodes.set(nodeConfig.id, node);
        logger_js_1.logger.info(`✅ Database node added: ${nodeConfig.id} (${nodeConfig.role})`);
    }
    selectNodeForRead() {
        const healthyNodes = Array.from(this.nodes.values()).filter((node) => node.isHealthy);
        if (healthyNodes.length === 0) {
            logger_js_1.logger.error('❌ No healthy database nodes available');
            return null;
        }
        switch (this.config.strategy) {
            case 'round_robin':
                return this.selectRoundRobin(healthyNodes);
            case 'least_connections':
                return this.selectLeastConnections(healthyNodes);
            case 'weighted_round_robin':
                return this.selectWeightedRoundRobin(healthyNodes);
            default:
                return this.selectHealthWeighted(healthyNodes);
        }
    }
    selectNodeForWrite() {
        const primaryNode = Array.from(this.nodes.values()).find((node) => node.role === 'primary' && node.isHealthy);
        if (!primaryNode) {
            logger_js_1.logger.error('❌ Primary database node not available');
        }
        return primaryNode || null;
    }
    selectRoundRobin(nodes) {
        const selected = nodes[this.currentRoundRobinIndex % nodes.length];
        this.currentRoundRobinIndex++;
        return selected;
    }
    selectLeastConnections(nodes) {
        return nodes.reduce((prev, current) => current.connectionCount < prev.connectionCount ? current : prev);
    }
    selectWeightedRoundRobin(nodes) {
        const totalWeight = nodes.reduce((sum, node) => sum + node.weight, 0);
        let random = Math.random() * totalWeight;
        for (const node of nodes) {
            random -= node.weight;
            if (random <= 0) {
                return node;
            }
        }
        return nodes[0];
    }
    selectHealthWeighted(nodes) {
        const scoredNodes = nodes.map((node) => {
            const connectionScore = Math.max(1, 100 - node.connectionCount);
            const responseScore = Math.max(1, 100 - node.avgResponseTime / 10);
            const score = node.weight * 0.4 + connectionScore * 0.3 + responseScore * 0.3;
            return { node, score };
        });
        scoredNodes.sort((a, b) => b.score - a.score);
        return scoredNodes[0].node;
    }
    async query(text, params, options = {}) {
        const { writeQuery = false, retries = this.config.maxRetries } = options;
        const startTime = Date.now();
        this.metrics.totalQueries++;
        for (let attempt = 0; attempt <= retries; attempt++) {
            const node = writeQuery ? this.selectNodeForWrite() : this.selectNodeForRead();
            if (!node) {
                throw new Error(`No ${writeQuery ? 'primary' : 'available'} database node found`);
            }
            let client = null;
            try {
                client = await node.pool.connect();
                node.connectionCount++;
                const queryPromise = params ? client.query(text, [...params]) : client.query(text);
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Query timeout')), this.config.queryTimeout);
                });
                const result = await Promise.race([queryPromise, timeoutPromise]);
                const responseTime = Date.now() - startTime;
                this.updateNodeMetrics(node, responseTime, true);
                this.metrics.successfulQueries++;
                if (responseTime > this.config.slowQueryThreshold) {
                    this.metrics.slowQueries++;
                    logger_js_1.logger.warn(`🐌 Slow query detected (${responseTime}ms): ${text.substring(0, 100)}`);
                }
                return result;
            }
            catch (error) {
                const responseTime = Date.now() - startTime;
                this.updateNodeMetrics(node, responseTime, false);
                logger_js_1.logger.error(`❌ Query failed on node ${node.id} (attempt ${attempt + 1}):`, error);
                if (this.isConnectionError(error)) {
                    this.markNodeUnhealthy(node.id);
                    this.metrics.connectionErrors++;
                }
                if (attempt === retries) {
                    this.metrics.failedQueries++;
                    throw error;
                }
                await this.sleep(100 * 2 ** attempt);
            }
            finally {
                if (client) {
                    client.release();
                    node.connectionCount = Math.max(0, node.connectionCount - 1);
                }
            }
        }
        throw new Error('Query execution failed after retries');
    }
    updateNodeMetrics(node, responseTime, _success) {
        node.queryCount++;
        const alpha = 0.1;
        node.avgResponseTime = node.avgResponseTime * (1 - alpha) + responseTime * alpha;
        const totalResponseTime = this.metrics.avgResponseTime * (this.metrics.totalQueries - 1) + responseTime;
        this.metrics.avgResponseTime = totalResponseTime / this.metrics.totalQueries;
    }
    isConnectionError(error) {
        const connectionErrorCodes = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'];
        return connectionErrorCodes.some((code) => error.message.includes(code));
    }
    markNodeUnhealthy(nodeId) {
        const node = this.nodes.get(nodeId);
        if (node) {
            node.isHealthy = false;
            logger_js_1.logger.warn(`⚠️ Marked node ${nodeId} as unhealthy`);
        }
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    startHealthMonitoring() {
        this.healthCheckInterval = setInterval(() => this.performHealthChecks(), this.config.healthCheckInterval);
        logger_js_1.logger.info('🔍 Started database health monitoring');
    }
    async performHealthChecks() {
        const healthCheckPromises = Array.from(this.nodes.entries()).map(async ([nodeId, node]) => {
            try {
                const startTime = Date.now();
                const client = await node.pool.connect();
                await client.query('SELECT 1');
                client.release();
                const responseTime = Date.now() - startTime;
                node.lastHealthCheck = Date.now();
                if (!node.isHealthy) {
                    node.isHealthy = true;
                    logger_js_1.logger.info(`✅ Node ${nodeId} is healthy again`);
                }
                node.avgResponseTime = node.avgResponseTime * 0.9 + responseTime * 0.1;
            }
            catch (error) {
                logger_js_1.logger.warn(`⚠️ Health check failed for node ${nodeId}:`, error);
                this.markNodeUnhealthy(nodeId);
            }
        });
        await Promise.allSettled(healthCheckPromises);
    }
    getMetrics() {
        const nodeMetrics = Array.from(this.nodes.values()).map((node) => ({
            id: node.id,
            role: node.role,
            isHealthy: node.isHealthy,
            connectionCount: node.connectionCount,
            avgResponseTime: Math.round(node.avgResponseTime),
        }));
        return {
            ...this.metrics,
            nodes: nodeMetrics,
        };
    }
    async healthCheck() {
        const healthyNodes = Array.from(this.nodes.values()).filter((node) => node.isHealthy);
        const hasHealthyPrimary = healthyNodes.some((node) => node.role === 'primary');
        const status = hasHealthyPrimary ? 'healthy' : 'degraded';
        return {
            status,
            details: {
                totalNodes: this.nodes.size,
                healthyNodes: healthyNodes.length,
                primaryHealthy: hasHealthyPrimary,
                metrics: this.getMetrics(),
            },
        };
    }
    async shutdown() {
        logger_js_1.logger.info('🔄 Shutting down Database Cluster Service...');
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        const shutdownPromises = Array.from(this.nodes.values()).map((node) => node.pool.end());
        await Promise.allSettled(shutdownPromises);
        logger_js_1.logger.info('✅ Database Cluster Service shutdown complete');
    }
}
exports.DatabaseClusterService = DatabaseClusterService;
exports.databaseClusterService = new DatabaseClusterService();
//# sourceMappingURL=databaseClusterService.js.map