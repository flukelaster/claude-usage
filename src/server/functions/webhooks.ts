import { createServerFn } from '@tanstack/react-start'
import { randomUUID } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import { getDb } from '~/server/db/client'
import { webhooks, webhookDeliveries } from '~/server/db/schema'
import { ALL_WEBHOOK_EVENTS, isWebhookEvent } from '~/server/webhooks/events'
import { dispatchEvent } from '~/server/webhooks/dispatch'

export interface WebhookRow {
  id: string
  url: string
  label: string | null
  events: string[]
  enabled: boolean
  hasSecret: boolean
  createdAt: string
  lastDeliveredAt: string | null
  lastError: string | null
}

export interface DeliveryRow {
  id: string
  webhookId: string
  event: string
  attemptedAt: string
  status: number | null
  ok: boolean
  durationMs: number | null
  error: string | null
}

function rowToOut(row: typeof webhooks.$inferSelect): WebhookRow {
  let events: string[] = []
  try {
    events = JSON.parse(row.events ?? '[]')
  } catch {
    events = []
  }
  return {
    id: row.id,
    url: row.url,
    label: row.label,
    events,
    enabled: !!row.enabled,
    hasSecret: !!row.secret,
    createdAt: row.createdAt,
    lastDeliveredAt: row.lastDeliveredAt,
    lastError: row.lastError,
  }
}

export const listWebhooks = createServerFn({ method: 'GET' }).handler(
  async (): Promise<WebhookRow[]> => {
    const db = getDb()
    return db.select().from(webhooks).orderBy(desc(webhooks.createdAt)).all().map(rowToOut)
  },
)

export const createWebhook = createServerFn({ method: 'POST' })
  .inputValidator((data: {
    url: string
    label?: string | null
    events: string[]
    secret?: string | null
    enabled?: boolean
  }) => data)
  .handler(async ({ data }) => {
    const db = getDb()
    const url = data.url.trim()
    try {
      // eslint-disable-next-line no-new
      new URL(url)
    } catch {
      throw new Error(`Invalid webhook URL: ${url}`)
    }
    const events = data.events.filter(isWebhookEvent)
    if (events.length === 0) throw new Error('Pick at least one event')

    const id = randomUUID()
    db.insert(webhooks)
      .values({
        id,
        url,
        label: data.label?.trim() || null,
        events: JSON.stringify(events),
        enabled: data.enabled ?? true,
        secret: data.secret?.trim() || null,
        createdAt: new Date().toISOString(),
      })
      .run()
    return { id }
  })

export const updateWebhook = createServerFn({ method: 'POST' })
  .inputValidator((data: {
    id: string
    url?: string
    label?: string | null
    events?: string[]
    secret?: string | null
    enabled?: boolean
  }) => data)
  .handler(async ({ data }) => {
    const db = getDb()
    const patch: Partial<typeof webhooks.$inferInsert> = {}
    if (data.url !== undefined) patch.url = data.url.trim()
    if (data.label !== undefined) patch.label = data.label?.trim() || null
    if (data.events !== undefined) {
      const valid = data.events.filter(isWebhookEvent)
      if (valid.length === 0) throw new Error('Pick at least one event')
      patch.events = JSON.stringify(valid)
    }
    if (data.secret !== undefined) patch.secret = data.secret?.trim() || null
    if (data.enabled !== undefined) patch.enabled = data.enabled

    db.update(webhooks).set(patch).where(eq(webhooks.id, data.id)).run()
    return { ok: true as const }
  })

export const deleteWebhook = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const db = getDb()
    db.delete(webhooks).where(eq(webhooks.id, data.id)).run()
    return { ok: true as const }
  })

export const sendTestWebhook = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const db = getDb()
    const row = db.select().from(webhooks).where(eq(webhooks.id, data.id)).get()
    if (!row) throw new Error('Webhook not found')
    // Bypass the subscription filter — always deliver to this one hook.
    await dispatchEvent({
      event: 'sync.completed',
      emittedAt: new Date().toISOString(),
      data: { test: true, webhookId: row.id, label: row.label },
    })
    return { ok: true as const }
  })

export const recentDeliveries = createServerFn({ method: 'POST' })
  .inputValidator((data: { webhookId?: string; limit?: number }) => data)
  .handler(async ({ data }): Promise<DeliveryRow[]> => {
    const db = getDb()
    const limit = Math.min(Math.max(1, data.limit ?? 25), 200)
    const q = db
      .select()
      .from(webhookDeliveries)
      .orderBy(desc(webhookDeliveries.attemptedAt))
      .limit(limit)
    const rows = data.webhookId
      ? q.where(eq(webhookDeliveries.webhookId, data.webhookId)).all()
      : q.all()
    return rows.map((r) => ({
      id: r.id,
      webhookId: r.webhookId,
      event: r.event,
      attemptedAt: r.attemptedAt,
      status: r.status,
      ok: !!r.ok,
      durationMs: r.durationMs,
      error: r.error,
    }))
  })

export const listAvailableEvents = createServerFn({ method: 'GET' }).handler(
  async () => ALL_WEBHOOK_EVENTS as string[],
)
