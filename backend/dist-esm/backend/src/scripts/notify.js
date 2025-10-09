import { randomUUID } from 'node:crypto';
import { notificationDispatcher } from '../services/NotificationDispatcher.js';
import { logger } from '../utils/logger.js';
function parseArgs(argv) {
    const options = {
        severity: 'info',
        userIds: [],
        roles: [],
        ctas: [],
        context: {},
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        switch (arg) {
            case '--type':
            case '-t':
                options.type = argv[++i];
                break;
            case '--title':
                options.title = argv[++i];
                break;
            case '--body':
                options.body = argv[++i];
                break;
            case '--severity':
            case '-s': {
                const value = argv[++i];
                if (value === 'info' || value === 'warning' || value === 'critical') {
                    options.severity = value;
                }
                break;
            }
            case '--user':
            case '-u':
                options.userIds.push(argv[++i]);
                break;
            case '--role':
            case '-r':
                options.roles.push(argv[++i]);
                break;
            case '--cta': {
                const value = argv[++i];
                const [label, url] = value.split('=');
                if (label && url) {
                    options.ctas.push({ label, url });
                }
                break;
            }
            case '--context': {
                const value = argv[++i];
                const [key, raw] = value.split('=');
                if (key) {
                    options.context[key] = parseContextValue(raw);
                }
                break;
            }
            default:
                break;
        }
    }
    return options;
}
function parseContextValue(raw) {
    if (raw === undefined) {
        return null;
    }
    try {
        return JSON.parse(raw);
    }
    catch (_error) {
        return raw;
    }
}
export async function runCli() {
    const args = process.argv.slice(2);
    const options = parseArgs(args);
    if (!options.type) {
        logger.error('Notification type is required. Use --type <event.type>.');
        process.exit(1);
    }
    const recipients = buildRecipients(options.userIds, options.roles);
    const event = {
        id: randomUUID(),
        type: options.type,
        title: options.title ?? options.type,
        body: options.body ?? '',
        severity: options.severity,
        ...(recipients ? { recipients } : {}),
        ...(Object.keys(options.context).length > 0 ? { context: options.context } : {}),
        ...(options.ctas.length > 0 ? { cta: options.ctas } : {}),
        createdAt: new Date().toISOString(),
    };
    logger.info('Dispatching notification event', {
        type: event.type,
        severity: event.severity,
        recipients,
    });
    const results = await notificationDispatcher.dispatch(event);
    const summary = results.map((result) => ({
        channel: result.channel,
        ok: result.ok,
        error: result.error,
        retryAfterMs: result.retryAfterMs,
    }));
    logger.info('Notification dispatch completed', { summary });
}
function buildRecipients(userIds, roles) {
    const normalizedUserIds = Array.from(new Set(userIds.filter((value) => Boolean(value && value.trim().length > 0))));
    const normalizedRoles = Array.from(new Set(roles.filter((value) => Boolean(value && value.trim().length > 0))));
    if (normalizedUserIds.length === 0 && normalizedRoles.length === 0) {
        return undefined;
    }
    return {
        ...(normalizedUserIds.length > 0 ? { userIds: normalizedUserIds } : {}),
        ...(normalizedRoles.length > 0 ? { roles: normalizedRoles } : {}),
    };
}
if (require.main === module) {
    void runCli().catch((error) => {
        logger.error('Failed to dispatch notification via CLI', { error });
        process.exit(1);
    });
}
//# sourceMappingURL=notify.js.map