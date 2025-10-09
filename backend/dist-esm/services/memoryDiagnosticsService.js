"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryDiagnosticsService = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_v8_1 = require("node:v8");
const errorHelpers_js_1 = require("../utils/errorHelpers.js");
const logger_js_1 = require("../utils/logger.js");
const MB = 1024 * 1024;
class MemoryDiagnosticsService {
    constructor(options = {}) {
        this.samples = [];
        this.monitorInterval = null;
        this.lastAlertAt = 0;
        this.intervalMs = Math.max(5000, options.intervalMs ?? this.readNumberEnv('MEMORY_MONITOR_INTERVAL_MS', 15000));
        this.growthThresholdBytes =
            (options.growthThresholdMb ?? this.readNumberEnv('MEMORY_MONITOR_GROWTH_THRESHOLD_MB', 120)) *
                MB;
        this.minSamples = Math.max(4, options.minSamples ?? this.readNumberEnv('MEMORY_MONITOR_MIN_SAMPLES', 8));
        this.alertCooldownMs = Math.max(60000, options.alertCooldownMs ??
            this.readNumberEnv('MEMORY_MONITOR_ALERT_COOLDOWN_MS', 10 * 60 * 1000));
        this.historySize = Math.max(this.minSamples, options.historySize ?? this.readNumberEnv('MEMORY_MONITOR_HISTORY_SIZE', this.minSamples * 3));
        const directory = options.snapshotDirectory ?? process.env.MEMORY_MONITOR_SNAPSHOT_DIR ?? null;
        this.snapshotDirectory = directory ? node_path_1.default.resolve(directory) : null;
    }
    start() {
        const isDisabled = process.env.MEMORY_MONITOR_ENABLED === 'false';
        if (isDisabled) {
            logger_js_1.logger.info('🧠 Memory diagnostics disabled via MEMORY_MONITOR_ENABLED=false');
            return;
        }
        if (this.monitorInterval) {
            return;
        }
        logger_js_1.logger.info('🧠 Memory diagnostics monitor starting', {
            intervalMs: this.intervalMs,
            growthThresholdMb: Math.round((this.growthThresholdBytes / MB) * 10) / 10,
            minSamples: this.minSamples,
            historySize: this.historySize,
            snapshotDirectory: this.snapshotDirectory ?? 'disabled',
        });
        this.captureSample('startup');
        this.monitorInterval = setInterval(() => {
            try {
                this.captureSample('interval');
                this.evaluateTrend();
            }
            catch (error) {
                logger_js_1.logger.error('❌ Memory diagnostics failed', { error: (0, errorHelpers_js_1.getErrorMessage)(error) });
            }
        }, this.intervalMs);
        if (typeof this.monitorInterval.unref === 'function') {
            this.monitorInterval.unref();
        }
        process.once('exit', () => this.stop());
    }
    stop() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
    }
    reportUsage(context) {
        const usage = process.memoryUsage();
        logger_js_1.logger.info('🧠 Memory usage snapshot', {
            context,
            rssMb: this.toMb(usage.rss),
            heapTotalMb: this.toMb(usage.heapTotal),
            heapUsedMb: this.toMb(usage.heapUsed),
            externalMb: this.toMb(usage.external),
            arrayBuffersMb: this.toMb(usage.arrayBuffers ?? 0),
        });
    }
    captureSample(reason) {
        const usage = process.memoryUsage();
        const sample = {
            timestamp: Date.now(),
            heapUsed: usage.heapUsed,
            rss: usage.rss,
            external: usage.external,
        };
        if (reason === 'startup') {
            logger_js_1.logger.info('🧠 Memory diagnostics initialized', {
                rssMb: this.toMb(usage.rss),
                heapUsedMb: this.toMb(usage.heapUsed),
            });
        }
        this.samples.push(sample);
        if (this.samples.length > this.historySize) {
            this.samples.shift();
        }
    }
    evaluateTrend() {
        if (this.samples.length < this.minSamples) {
            return;
        }
        const baseline = this.samples[0];
        const latest = this.samples[this.samples.length - 1];
        const heapGrowth = latest.heapUsed - baseline.heapUsed;
        if (heapGrowth < this.growthThresholdBytes) {
            return;
        }
        const increasingSamples = this.samples.slice(1).reduce((count, sample, index) => {
            const previous = this.samples[index];
            return sample.heapUsed >= previous.heapUsed * 0.9 ? count + 1 : count;
        }, 0);
        const trendRatio = increasingSamples / (this.samples.length - 1);
        if (trendRatio < 0.6) {
            return;
        }
        const now = Date.now();
        if (now - this.lastAlertAt < this.alertCooldownMs) {
            return;
        }
        this.lastAlertAt = now;
        const heapGrowthMb = this.toMb(heapGrowth);
        const rssGrowthMb = this.toMb(latest.rss - baseline.rss);
        logger_js_1.logger.warn('⚠️ Potential memory leak detected', {
            heapGrowthMb,
            rssGrowthMb,
            sampleWindowMs: latest.timestamp - baseline.timestamp,
            samples: this.samples.length,
        });
        this.captureHeapSnapshot('auto-leak-warning');
    }
    captureHeapSnapshot(reason) {
        if (!this.snapshotDirectory) {
            return;
        }
        try {
            node_fs_1.default.mkdirSync(this.snapshotDirectory, { recursive: true });
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filePath = node_path_1.default.join(this.snapshotDirectory, `${timestamp}-${reason}.heapsnapshot`);
            const snapshotPath = (0, node_v8_1.writeHeapSnapshot)(filePath);
            logger_js_1.logger.warn('🧠 Heap snapshot captured for analysis', { snapshotPath });
        }
        catch (error) {
            logger_js_1.logger.error('❌ Failed to capture heap snapshot', { error: (0, errorHelpers_js_1.getErrorMessage)(error) });
        }
    }
    toMb(value) {
        return Math.round((value / MB) * 10) / 10;
    }
    readNumberEnv(envName, fallback) {
        const raw = process.env[envName];
        if (!raw) {
            return fallback;
        }
        const parsed = Number.parseInt(raw, 10);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
}
exports.memoryDiagnosticsService = new MemoryDiagnosticsService();
//# sourceMappingURL=memoryDiagnosticsService.js.map