import type { NotificationEvent } from '../../../../shared/types/notifications';
interface SlackPlainTextObject {
    type: 'plain_text';
    text: string;
    emoji?: boolean;
}
interface SlackMarkdownTextObject {
    type: 'mrkdwn';
    text: string;
}
type SlackTextObject = SlackPlainTextObject | SlackMarkdownTextObject;
interface SlackHeaderBlock {
    type: 'header';
    text: SlackPlainTextObject;
}
interface SlackSectionBlock {
    type: 'section';
    text?: SlackTextObject;
    fields?: SlackMarkdownTextObject[];
}
interface SlackDividerBlock {
    type: 'divider';
}
interface SlackContextBlock {
    type: 'context';
    elements: SlackMarkdownTextObject[];
}
interface SlackActionsBlock {
    type: 'actions';
    elements: SlackButtonElement[];
}
interface SlackButtonElement {
    type: 'button';
    text: SlackPlainTextObject;
    url: string;
    style?: 'primary' | 'danger';
}
type SlackBlock = SlackHeaderBlock | SlackSectionBlock | SlackDividerBlock | SlackContextBlock | SlackActionsBlock;
export interface SlackWebhookPayload {
    text: string;
    blocks: SlackBlock[];
    unfurl_links?: boolean;
    unfurl_media?: boolean;
}
export declare function formatSlackWebhookPayload(event: NotificationEvent): SlackWebhookPayload;
export {};
//# sourceMappingURL=slackFormatting.d.ts.map