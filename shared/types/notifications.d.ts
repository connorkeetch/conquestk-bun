export type NotificationSeverity = 'info' | 'warning' | 'critical'
export interface NotificationRecipientFilters {
  userIds?: string[]
  roles?: string[]
}
export interface NotificationCallToAction {
  label: string
  url: string
}
export interface NotificationEvent {
  id: string
  type: string
  title: string
  body: string
  severity: NotificationSeverity
  context?: Record<string, unknown>
  recipients?: NotificationRecipientFilters
  cta?: NotificationCallToAction[]
  createdAt?: string
}
export interface NotificationResult {
  channel: string
  ok: boolean
  id?: string
  error?: string
  retryAfterMs?: number
}
//# sourceMappingURL=notifications.d.ts.map
