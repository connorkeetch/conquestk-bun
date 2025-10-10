import type { NotificationEvent } from '../../shared/types/notifications';
export interface DiscordWebhookPayload {
    content?: string;
    username?: string;
    avatar_url?: string;
    embeds?: DiscordEmbed[];
    allowed_mentions?: {
        parse: [];
    };
}
interface DiscordEmbedField {
    name: string;
    value: string;
    inline?: boolean;
}
interface DiscordEmbed {
    title?: string;
    description?: string;
    color?: number;
    fields?: DiscordEmbedField[];
    timestamp?: string;
}
export declare function formatDiscordWebhookPayload(event: NotificationEvent): DiscordWebhookPayload;
export {};
//# sourceMappingURL=discordFormatting.d.ts.map