/**
 * Catalogue of webhook events the dashboard can emit. Adding an event
 * means: (1) listing it here, (2) deciding the threshold logic in
 * `dispatch.ts`, (3) optionally surfacing it in the webhook config UI.
 *
 * Payloads stay JSON-serializable; webhook receivers should treat
 * `event` as the discriminator and tolerate additional fields.
 */

export type WebhookEvent =
  | 'budget.warning'      // ≥80% of monthly budget
  | 'budget.exceeded'     // ≥100% of monthly budget
  | 'subscription.warning'  // ≥80% of any rolling-window quota
  | 'subscription.exceeded' // ≥100% of any rolling-window quota
  | 'anomaly.detected'    // new outlier session appeared
  | 'sync.failed'         // a sync run produced errors
  | 'sync.completed'      // every successful sync (chatty; off by default)

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  'budget.warning': 'Budget at 80%',
  'budget.exceeded': 'Budget exceeded',
  'subscription.warning': 'Subscription quota at 80%',
  'subscription.exceeded': 'Subscription quota exceeded',
  'anomaly.detected': 'New cost anomaly',
  'sync.failed': 'Sync failed',
  'sync.completed': 'Sync completed (verbose)',
}

export const ALL_WEBHOOK_EVENTS = Object.keys(WEBHOOK_EVENT_LABELS) as WebhookEvent[]

export function isWebhookEvent(value: string): value is WebhookEvent {
  return Object.prototype.hasOwnProperty.call(WEBHOOK_EVENT_LABELS, value)
}
