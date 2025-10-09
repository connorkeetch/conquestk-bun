"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webPushChannel = exports.WebPushChannel = void 0;
const logger_js_1 = require("../../utils/logger.js");
const notificationService_js_1 = __importDefault(require("../notificationService.js"));
const channelLogger = typeof logger_js_1.logger.child === 'function' ? logger_js_1.logger.child({ channel: 'webpush' }) : logger_js_1.logger;
const MAX_ACTIONS = 2;
class WebPushChannel {
    constructor(options = {}) {
        this.name = 'webpush';
        this.service = options.service ?? notificationService_js_1.default;
    }
    isAvailable() {
        return this.service.isEnabled();
    }
    async send(event) {
        if (!this.service.isEnabled()) {
            channelLogger.debug('Web push service disabled; skipping notification', {
                eventType: event.type,
            });
            return {
                channel: this.name,
                ok: false,
                error: 'Web push service disabled',
            };
        }
        const userIds = event.recipients?.userIds?.filter((id) => typeof id === 'string' && id.trim().length > 0);
        if (!userIds || userIds.length === 0) {
            channelLogger.debug('Skipping web push notification because no user recipients were provided', {
                eventType: event.type,
            });
            return {
                channel: this.name,
                ok: true,
            };
        }
        const payload = this.buildPayload(event);
        try {
            await this.service.sendToUsers(userIds, payload);
            return {
                channel: this.name,
                ok: true,
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown web push error';
            channelLogger.error('Failed to send web push notification', {
                eventType: event.type,
                userIds,
                error: message,
            });
            return {
                channel: this.name,
                ok: false,
                error: message,
            };
        }
    }
    buildPayload(event) {
        const primaryCta = event.cta?.[0];
        const data = {
            eventType: event.type,
            severity: event.severity,
        };
        if (primaryCta?.url) {
            data.url = primaryCta.url;
        }
        if (primaryCta?.label) {
            data.actionLabel = primaryCta.label;
        }
        if (event.context && Object.keys(event.context).length > 0) {
            data.context = event.context;
        }
        if (event.recipients?.roles?.length) {
            data.recipientRoles = event.recipients.roles;
        }
        if (event.recipients?.userIds?.length) {
            data.recipientUserIds = event.recipients.userIds;
        }
        const actions = event.cta?.slice(0, MAX_ACTIONS).map((cta, index) => ({
            action: `cta-${index + 1}`,
            title: cta.label,
        }));
        return {
            title: event.title,
            body: event.body && event.body.trim().length > 0 ? event.body : event.title,
            tag: event.type,
            data,
            actions,
        };
    }
}
exports.WebPushChannel = WebPushChannel;
exports.webPushChannel = new WebPushChannel();
//# sourceMappingURL=WebPushChannel.js.map