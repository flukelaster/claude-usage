import { createHmac, randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDb } from '~/server/db/client'
import {
  webhooks,
  webhookDeliveries,
  webhookState,
} from '~/server/db/schema'
import type { WebhookEvent } from './events'

const DELIVERY_TIMEOUT_MS = 5_000

interface WebhookPayload {
  event: WebhookEvent
  emittedAt: string
  data: Record<string, unknown>
}

/**
 * Fire-and-log a webhook payload to every endpoint subscribed to this
 * event. Each delivery is appended to webhook_deliveries; success/failure
 * is captured per attempt so the UI can surface a debugging log.
 *
 * Endpoints with a `secret` get an HMAC-SHA256 signature in the
 * `X-Claude-Usage-Signature` header so receivers can verify the payload
 * actually came from a dashboard they trust.
 */
export async function dispatchEvent(payload: WebhookPayload): Promise<void> {
  const db = getDb()
  const subscribed = db
    .select()
    .from(webhooks)
    .where(eq(webhooks.enabled, true))
    .all()
    .filter((row) => {
      try {
        const events = JSON.parse(row.events) as string[]
        return Array.isArray(events) && events.includes(payload.event)
      } catch {
        return false
      }
    })

  if (subscribed.length === 0) return

  const body = JSON.stringify(payload)
  await Promise.all(subscribed.map((hook) => deliverOne(hook, payload.event, body)))
}

async function deliverOne(
  hook: typeof webhooks.$inferSelect,
  event: WebhookEvent,
  body: string,
): Promise<void> {
  const db = getDb()
  const start = Date.now()
  const id = randomUUID()
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'user-agent': 'claude-usage-dashboard',
    'x-claude-usage-event': event,
  }
  if (hook.secret) {
    const sig = createHmac('sha256', hook.secret).update(body).digest('hex')
    headers['x-claude-usage-signature'] = `sha256=${sig}`
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS)

  let status: number | null = null
  let ok = false
  let error: string | null = null
  try {
    const res = await fetch(hook.url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    })
    status = res.status
    ok = res.ok
    if (!ok) error = `HTTP ${status}`
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  } finally {
    clearTimeout(timer)
  }

  const now = new Date().toISOString()
  db.insert(webhookDeliveries)
    .values({
      id,
      webhookId: hook.id,
      event,
      attemptedAt: now,
      status,
      ok,
      durationMs: Date.now() - start,
      error,
    })
    .run()
  db.update(webhooks)
    .set({
      lastDeliveredAt: now,
      lastError: ok ? null : error,
    })
    .where(eq(webhooks.id, hook.id))
    .run()
}

/**
 * Read/write the watermark row for an event. The dispatcher uses this
 * to decide whether a threshold has *just* been crossed (vs already
 * notified about), so receivers don't get spammed once usage stays in
 * the alert range.
 */
export function readWatermark(key: string): { lastFiredAt: string | null; lastValue: string | null } {
  const db = getDb()
  const row = db.select().from(webhookState).where(eq(webhookState.key, key)).get()
  return {
    lastFiredAt: row?.lastFiredAt ?? null,
    lastValue: row?.lastValue ?? null,
  }
}

export function writeWatermark(key: string, value: string): void {
  const db = getDb()
  const now = new Date().toISOString()
  db.insert(webhookState)
    .values({ key, lastFiredAt: now, lastValue: value })
    .onConflictDoUpdate({
      target: webhookState.key,
      set: { lastFiredAt: now, lastValue: value },
    })
    .run()
}
