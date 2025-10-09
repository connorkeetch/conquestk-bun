"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationDispatcher = exports.NotificationDispatcher = void 0;
const logger_js_1 = require("../utils/logger.js");
const DiscordWebhookChannel_js_1 = require("./channels/DiscordWebhookChannel.js");
const SlackWebhookChannel_js_1 = require("./channels/SlackWebhookChannel.js");
const WebPushChannel_js_1 = require("./channels/WebPushChannel.js");
const SERVICE_LOGGER = logger_js_1.logger.child({ service: 'NotificationDispatcher' });
class NotificationDispatcher {
    constructor(options = {}) {
        this.logger = SERVICE_LOGGER;
        this.channels = new Map();
        if (options.loggerContext) {
            this.logger = SERVICE_LOGGER.child(options.loggerContext);
        }
        this.configuredChannels = this.parseConfiguredChannels(options.enabledChannels ?? process.env.NOTIFICATION_CHANNELS);
        this.externalNotificationsEnabled =
            options.externalNotificationsEnabled ??
                this.parseBoolean(process.env.ENABLE_EXTERNAL_NOTIFICATIONS);
        options.channels?.forEach((channel) => {
            this.registerChannel(channel);
        });
    }
    registerChannel(channel) {
        const key = this.normalizeChannelName(channel.name);
        this.channels.set(key, channel);
        this.logger.debug('Registered notification channel', { channel: channel.name });
    }
    getRegisteredChannels() {
        return Array.from(this.channels.values());
    }
    getEnabledChannels() {
        return this.getRegisteredChannels().filter((channel) => this.shouldDispatchTo(channel.name));
    }
    async dispatch(event) {
        const channels = this.getEnabledChannels();
        if (channels.length === 0) {
            this.logger.debug('No notification channels enabled for event', { eventType: event.type });
            return [];
        }
        const deliveries = channels.map(async (channel) => {
            const channelLogger = this.logger.child({
                channel: channel.name,
                eventId: event.id,
                eventType: event.type,
            });
            try {
                const isAvailable = channel.isAvailable ? await channel.isAvailable() : true;
                if (!isAvailable) {
                    channelLogger.warn('Skipping notification channel because it is unavailable');
                    return {
                        channel: channel.name,
                        ok: false,
                        error: 'Channel unavailable',
                    };
                }
                channelLogger.debug('Sending notification event to channel');
                const result = await channel.send(event);
                if (result.ok) {
                    channelLogger.debug('Notification channel accepted event', {
                        providerMessageId: result.id,
                    });
                }
                else {
                    channelLogger.warn('Notification channel reported failure', {
                        error: result.error,
                        retryAfterMs: result.retryAfterMs,
                    });
                }
                return result;
            }
            catch (error) {
                channelLogger.error('Notification channel threw while sending event', { error });
                return {
                    channel: channel.name,
                    ok: false,
                    error: error instanceof Error ? error.message : 'Unknown channel error',
                };
            }
        });
        return Promise.all(deliveries);
    }
    shouldDispatchTo(channelName) {
        const normalized = this.normalizeChannelName(channelName);
        if (this.configuredChannels.size > 0 && !this.configuredChannels.has(normalized)) {
            this.logger.debug('Skipping channel because it is not listed in NOTIFICATION_CHANNELS', {
                channel: channelName,
            });
            return false;
        }
        if (normalized === 'webpush') {
            return true;
        }
        if (!this.externalNotificationsEnabled) {
            this.logger.debug('Skipping channel because external notifications are disabled', {
                channel: channelName,
            });
            return false;
        }
        if (!this.isChannelFlagEnabled(normalized)) {
            this.logger.debug('Skipping channel because it is disabled via env flag', {
                channel: channelName,
            });
            return false;
        }
        return true;
    }
    isChannelFlagEnabled(channel) {
        switch (channel) {
            case 'slack':
                return this.parseBoolean(process.env.SLACK_NOTIFICATIONS_ENABLED);
            case 'discord':
                return this.parseBoolean(process.env.DISCORD_NOTIFICATIONS_ENABLED);
            default:
                return true;
        }
    }
    parseConfiguredChannels(value) {
        if (!value) {
            return new Set();
        }
        const list = Array.isArray(value) ? value : value.split(',');
        const normalized = list
            .map((entry) => this.normalizeChannelName(entry))
            .filter((entry) => entry.length > 0);
        return new Set(normalized);
    }
    normalizeChannelName(name) {
        return name.trim().toLowerCase();
    }
    parseBoolean(value, defaultValue = false) {
        if (!value) {
            return defaultValue;
        }
        return value.toLowerCase() === 'true';
    }
}
exports.NotificationDispatcher = NotificationDispatcher;
const defaultChannels = [WebPushChannel_js_1.webPushChannel];
const slackChannel = SlackWebhookChannel_js_1.SlackWebhookChannel.fromEnv();
if (slackChannel) {
    defaultChannels.push(slackChannel);
}
if (DiscordWebhookChannel_js_1.discordWebhookChannel) {
    defaultChannels.push(DiscordWebhookChannel_js_1.discordWebhookChannel);
}
else {
    const fallbackDiscordChannel = DiscordWebhookChannel_js_1.DiscordWebhookChannel.fromEnv();
    if (fallbackDiscordChannel) {
        defaultChannels.push(fallbackDiscordChannel);
    }
}
exports.notificationDispatcher = new NotificationDispatcher({
    channels: defaultChannels,
});
//# sourceMappingURL=NotificationDispatcher.js.map