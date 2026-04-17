import { dispatchEvent, readWatermark, writeWatermark } from './dispatch'

/**
 * After every sync run, evaluate the dashboard's headline thresholds
 * (budget, subscription windows, anomalies) and fire webhooks when a
 * threshold is crossed for the first time. The watermark store
 * suppresses repeats so a sync that runs every minute doesn't re-fire
 * the same warning every minute.
 */
export async function runPostSyncTriggers(opts: {
  syncResult: { filesProcessed: number; messagesAdded: number; errors: number; durationMs: number }
}): Promise<void> {
  // Run all triggers in parallel; failures in one shouldn't block the
  // others. Each `try/catch` so a misconfigured webhook can't sink the
  // whole post-sync hook.
  const tasks = [
    triggerSyncEvents(opts.syncResult).catch(noop),
    triggerBudget().catch(noop),
    triggerSubscription().catch(noop),
    triggerAnomalies().catch(noop),
  ]
  await Promise.all(tasks)
}

function noop() {}

async function triggerSyncEvents(result: {
  filesProcessed: number
  messagesAdded: number
  errors: number
  durationMs: number
}) {
  const now = new Date().toISOString()
  if (result.errors > 0) {
    await dispatchEvent({
      event: 'sync.failed',
      emittedAt: now,
      data: { ...result },
    })
  }
  await dispatchEvent({
    event: 'sync.completed',
    emittedAt: now,
    data: { ...result },
  })
}

async function triggerBudget() {
  const { getBudgetStatus } = await import('~/server/functions/get-budget-status')
  const status = await getBudgetStatus()
  if (status.status === 'untracked' || status.percentUsed === null) return

  const watermark = readWatermark('budget')
  const lastStatus = watermark.lastValue ?? 'ok'

  if (status.status === lastStatus) return // no transition

  if (status.status === 'warning' || status.status === 'exceeded') {
    await dispatchEvent({
      event: status.status === 'exceeded' ? 'budget.exceeded' : 'budget.warning',
      emittedAt: new Date().toISOString(),
      data: {
        spent: status.spentUsd,
        budget: status.budgetUsd,
        percentUsed: status.percentUsed,
        projected: status.projectedUsd,
        periodStart: status.periodStart,
        periodEnd: status.periodEnd,
      },
    })
  }
  writeWatermark('budget', status.status)
}

async function triggerSubscription() {
  const { getSubscriptionStatus } = await import('~/server/functions/get-subscription')
  const sub = await getSubscriptionStatus()
  if (sub.plan.id === 'none') return

  const windows: Array<{ key: string; util: number | null; data: unknown }> = [
    { key: 'subscription:5h', util: sub.fiveHour.utilizationPercent, data: sub.fiveHour },
  ]
  if (sub.weekly) {
    windows.push({ key: 'subscription:7d', util: sub.weekly.utilizationPercent, data: sub.weekly })
  }

  for (const w of windows) {
    if (w.util === null) continue
    const next = w.util >= 1 ? 'exceeded' : w.util >= 0.8 ? 'warning' : 'ok'
    const wm = readWatermark(w.key)
    if ((wm.lastValue ?? 'ok') === next) continue

    if (next === 'warning' || next === 'exceeded') {
      await dispatchEvent({
        event: next === 'exceeded' ? 'subscription.exceeded' : 'subscription.warning',
        emittedAt: new Date().toISOString(),
        data: { window: w.key, plan: sub.plan.id, ...((w.data as object) ?? {}) },
      })
    }
    writeWatermark(w.key, next)
  }
}

async function triggerAnomalies() {
  const { getAnomalies } = await import('~/server/functions/get-anomalies')
  const result = await getAnomalies()
  const watermark = readWatermark('anomalies')
  const knownIds = new Set<string>()
  if (watermark.lastValue) {
    try {
      for (const id of JSON.parse(watermark.lastValue) as string[]) knownIds.add(id)
    } catch {
      // ignore corrupt watermark
    }
  }
  const newOutliers = result.sessions.filter((s) => !knownIds.has(s.id))
  for (const out of newOutliers) {
    await dispatchEvent({
      event: 'anomaly.detected',
      emittedAt: new Date().toISOString(),
      data: {
        sessionId: out.id,
        title: out.title,
        cost: out.totalCost,
        zScore: out.zScore,
        meanCost: result.mean,
        thresholdCost: result.thresholdCost,
      },
    })
  }
  // Persist current outlier IDs as the new watermark.
  writeWatermark('anomalies', JSON.stringify(result.sessions.map((s) => s.id)))
}
