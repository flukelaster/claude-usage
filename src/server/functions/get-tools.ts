import { createServerFn } from '@tanstack/react-start'
import { sql, and, gte } from 'drizzle-orm'
import { getDb } from '~/server/db/client'
import { toolUses, messages } from '~/server/db/schema'

export const getToolsAll = createServerFn({ method: 'GET' }).handler(async () => queryTools(null))
export const getTools30d = createServerFn({ method: 'GET' }).handler(async () => queryTools(30))
export const getTools90d = createServerFn({ method: 'GET' }).handler(async () => queryTools(90))

function queryTools(days: number | null) {
  const db = getDb()
  const cutoff = days
    ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    : null
  const timeFilter = cutoff ? gte(toolUses.timestamp, cutoff) : sql`1=1`

  // Per-tool aggregates. Cost-per-call is approximated by joining back to
  // the parent message and dividing its estimated cost evenly across the
  // tool calls it issued (an assistant turn often invokes several tools).
  const perTool = db
    .select({
      toolName: toolUses.toolName,
      callCount: sql<number>`count(*)`,
      avgInputSize: sql<number>`coalesce(avg(${toolUses.inputSize}), 0)`,
      totalInputSize: sql<number>`coalesce(sum(${toolUses.inputSize}), 0)`,
      attributedCost: sql<number>`coalesce(sum(${messages.estimatedCostUsd} * 1.0 / (
        select count(*) from tool_uses t2 where t2.message_id = ${toolUses.messageId}
      )), 0)`,
    })
    .from(toolUses)
    .innerJoin(messages, sql`${toolUses.messageId} = ${messages.uuid}`)
    .where(and(timeFilter))
    .groupBy(toolUses.toolName)
    .orderBy(sql`count(*) desc`)
    .all()

  const daily = db
    .select({
      date: sql<string>`date(${toolUses.timestamp}, 'localtime')`.as('date'),
      callCount: sql<number>`count(*)`,
    })
    .from(toolUses)
    .where(timeFilter)
    .groupBy(sql`date(${toolUses.timestamp}, 'localtime')`)
    .orderBy(sql`date(${toolUses.timestamp}, 'localtime')`)
    .all()

  const totalCalls = perTool.reduce((sum, t) => sum + t.callCount, 0)

  return {
    perTool: perTool.map((t) => ({
      ...t,
      share: totalCalls > 0 ? t.callCount / totalCalls : 0,
    })),
    daily,
    totalCalls,
    days,
  }
}
