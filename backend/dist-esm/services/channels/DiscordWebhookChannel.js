import { logger } from '../../utils/logger.js';
import { formatDiscordWebhookPayload } from './discordFormatting.js';
const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_COOLDOWN_MS = 60000;
const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;
const JITTER_MS = 250;
const channelLogger = typeof logger.child === 'function' ? logger.child({ channel: 'discord' }) : logger;
export class DiscordWebhookChannel {
    constructor(options) {
        this.name = 'discord';
        this.consecutiveFailures = 0;
        this.state = 'closed';
        this.nextAttemptAfter = 0;
        if (!options.webhookUrls.length) {
            throw new Error('DiscordWebhookChannel requires at least one webhook URL');
        }
        this.webhookUrls = options.webhookUrls;
        this.username = options.username;
        this.avatarUrl = options.avatarUrl;
        this.threadId = options.threadId;
        this.failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
        this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
        this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
        this.fetchFn = options.fetchFn ?? fetch;
    }
    static fromEnv() {
        const primaryWebhook = process.env.DISCORD_WEBHOOK_URL;
        const additional = splitCsv(process.env.DISCORD_WEBHOOK_URLS);
        const webhookUrls = [primaryWebhook, ...additional]
            .filter((value) => Boolean(value && value.trim().length > 0))
            .map((value) => value.trim());
        if (webhookUrls.length === 0) {
            return null;
        }
        return new DiscordWebhookChannel({
            webhookUrls,
            username: process.env.DISCORD_USERNAME?.trim(),
            avatarUrl: process.env.DISCORD_AVATAR_URL?.trim(),
            threadId: process.env.DISCORD_THREAD_ID?.trim(),
        });
    }
    isAvailable() {
        if (!this.webhookUrls.length) {
            return false;
        }
        if (this.state === 'open') {
            if (Date.now() >= this.nextAttemptAfter) {
                this.state = 'half-open';
                return true;
            }
            return false;
        }
        return true;
    }
    async send(event) {
        const destinations = this.buildDestinations();
        if (destinations.length === 0) {
            channelLogger.warn('No Discord webhook destinations configured; skipping delivery');
            return {
                channel: this.name,
                ok: false,
                error: 'No Discord webhook destinations configured',
            };
        }
        let overallOk = true;
        const errors = [];
        let maxRetryAfter;
        await Promise.all(destinations.map(async (webhookUrl) => {
            const result = await this.sendToWebhook(event, webhookUrl);
            if (!result.ok) {
                overallOk = false;
                errors.push(`${redactWebhook(webhookUrl)}: ${result.error ?? 'unknown error'}`);
            }
            if (typeof result.retryAfterMs === 'number') {
                maxRetryAfter = Math.max(maxRetryAfter ?? 0, result.retryAfterMs);
            }
        }));
        if (overallOk) {
            this.recordSuccess();
            return {
                channel: this.name,
                ok: true,
            };
        }
        this.recordFailure(maxRetryAfter);
        return {
            channel: this.name,
            ok: false,
            error: errors.join('; '),
            retryAfterMs: maxRetryAfter,
        };
    }
    async sendToWebhook(event, webhookUrl) {
        const payload = this.buildPayload(event);
        const url = this.appendThreadId(webhookUrl);
        const webhookLabel = redactWebhook(webhookUrl);
        for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
            try {
                const response = await this.fetchFn(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                });
                const responseBody = await response.text();
                if (response.ok) {
                    channelLogger.debug('Delivered Discord notification', {
                        attempt,
                        webhook: webhookLabel,
                    });
                    return { ok: true };
                }
                const retryAfterHeader = response.headers.get('retry-after');
                const retryAfterMs = parseRetryAfter(retryAfterHeader);
                if (shouldRetry(response.status)) {
                    const delay = this.computeDelay(attempt, retryAfterHeader);
                    channelLogger.warn('Retrying Discord webhook after transient failure', {
                        status: response.status,
                        attempt,
                        delayMs: delay,
                        webhook: webhookLabel,
                        responseBody: truncateForLog(responseBody),
                    });
                    if (attempt < this.maxAttempts) {
                        await sleep(delay);
                        continue;
                    }
                    return {
                        ok: false,
                        error: `HTTP ${response.status}: ${truncateForLog(responseBody)}`,
                        retryAfterMs,
                    };
                }
                channelLogger.error('Discord webhook rejected notification', {
                    status: response.status,
                    attempt,
                    webhook: webhookLabel,
                    responseBody: truncateForLog(responseBody),
                });
                return {
                    ok: false,
                    error: `HTTP ${response.status}: ${truncateForLog(responseBody)}`,
                    retryAfterMs,
                };
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                if (attempt < this.maxAttempts) {
                    const delay = this.computeDelay(attempt);
                    channelLogger.warn('Retrying Discord webhook after network error', {
                        attempt,
                        delayMs: delay,
                        webhook: webhookLabel,
                        error: message,
                    });
                    await sleep(delay);
                    continue;
                }
                channelLogger.error('Discord webhook threw during delivery', {
                    attempt,
                    webhook: webhookLabel,
                    error: message,
                });
                return { ok: false, error: message };
            }
        }
        return { ok: false, error: 'Exceeded retry attempts' };
    }
    buildDestinations() {
        return [...new Set(this.webhookUrls)];
    }
    buildPayload(event) {
        const payload = formatDiscordWebhookPayload(event);
        return {
            ...payload,
            ...(this.username ? { username: this.username } : {}),
            ...(this.avatarUrl ? { avatar_url: this.avatarUrl } : {}),
        };
    }
    appendThreadId(webhookUrl) {
        if (!this.threadId) {
            return webhookUrl;
        }
        try {
            const url = new URL(webhookUrl);
            if (!url.searchParams.has('thread_id')) {
                url.searchParams.set('thread_id', this.threadId);
            }
            return url.toString();
        }
        catch (_error) {
            return webhookUrl;
        }
    }
    recordSuccess() {
        if (this.consecutiveFailures > 0) {
            channelLogger.debug('Discord circuit breaker closed after successful delivery');
        }
        this.consecutiveFailures = 0;
        this.state = 'closed';
        this.nextAttemptAfter = 0;
    }
    recordFailure(retryAfterMs) {
        this.consecutiveFailures += 1;
        if (retryAfterMs) {
            this.nextAttemptAfter = Math.max(this.nextAttemptAfter, Date.now() + retryAfterMs);
        }
        if (this.state === 'half-open') {
            this.state = 'open';
        }
        if (this.consecutiveFailures < this.failureThreshold) {
            channelLogger.warn('Recorded Discord delivery failure', {
                failureCount: this.consecutiveFailures,
                retryAfterMs,
            });
            return;
        }
        this.state = 'open';
        this.nextAttemptAfter = Math.max(this.nextAttemptAfter, Date.now() + this.cooldownMs);
        channelLogger.error('Discord circuit breaker opened', {
            failureCount: this.consecutiveFailures,
            cooldownMs: this.cooldownMs,
        });
    }
    computeDelay(attempt, retryAfterHeader) {
        const retryAfterMs = parseRetryAfter(retryAfterHeader);
        if (retryAfterMs) {
            return retryAfterMs;
        }
        const exponential = BASE_BACKOFF_MS * 2 ** (attempt - 1);
        const jitter = Math.random() * JITTER_MS;
        return exponential + jitter;
    }
}
function splitCsv(value) {
    if (!value) {
        return [];
    }
    return value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
}
function shouldRetry(status) {
    return status === 429 || (status >= 500 && status < 600);
}
function parseRetryAfter(value) {
    if (!value) {
        return undefined;
    }
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
        return numeric * 1000;
    }
    const date = new Date(value);
    const delay = date.getTime() - Date.now();
    if (delay > 0) {
        return delay;
    }
    return undefined;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function truncateForLog(value, maxLength = 120) {
    const trimmed = value.trim();
    if (trimmed.length <= maxLength) {
        return trimmed;
    }
    return `${trimmed.slice(0, maxLength - 1)}…`;
}
function redactWebhook(webhookUrl) {
    try {
        const parsed = new URL(webhookUrl);
        const segments = parsed.pathname.split('/').filter(Boolean);
        const lastSegment = segments[segments.length - 1] ?? '';
        const redactedSuffix = lastSegment.slice(-4);
        return `${parsed.origin}/…${redactedSuffix}`;
    }
    catch (_error) {
        return 'discord-webhook';
    }
}
export const discordWebhookChannel = DiscordWebhookChannel.fromEnv();
//# sourceMappingURL=DiscordWebhookChannel.js.map