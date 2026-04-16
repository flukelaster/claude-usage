import { createServerFn } from '@tanstack/react-start'
import { sql } from 'drizzle-orm'
import { getDb } from '~/server/db/client'
import { messages } from '~/server/db/schema'
import { isKnownModel } from '~/lib/pricing'

export interface UnknownModelRow {
  model: string
  messageCount: number
  firstSeen: string
  lastSeen: string
}

/**
 * Surface any model strings that don't have a hard-coded pricing entry,
 * so the operator knows their cost estimates are using the fallback rate.
 */
export const getUnknownModels = createServerFn({ method: 'GET' }).handler(
  async (): Promise<UnknownModelRow[]> => {
    const db = getDb()
    const rows = db
      .select({
        model: messages.model,
        messageCount: sql<number>`count(*)`,
        firstSeen: sql<string>`min(${messages.timestamp})`,
        lastSeen: sql<string>`max(${messages.timestamp})`,
      })
      .from(messages)
      .groupBy(messages.model)
      .all()

    return rows
      .filter((r) => r.model && !isKnownModel(r.model))
      .map((r) => ({
        model: r.model,
        messageCount: r.messageCount,
        firstSeen: r.firstSeen,
        lastSeen: r.lastSeen,
      }))
  },
)
