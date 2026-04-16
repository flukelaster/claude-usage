import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Zap, Clock, CalendarDays, AlertTriangle } from 'lucide-react'

import { useSubscription, useSetSubscriptionPlan } from '~/hooks/useSubscription'
import { SUBSCRIPTION_PLANS, PLAN_IDS } from '~/lib/subscription'
import { formatTokens, formatCost } from '~/lib/format'
import { Card } from '~/components/ui/card'
import { LoadingSkeleton } from '~/components/ui/loading-skeleton'
import type { WindowUsage } from '~/server/functions/get-subscription'

export const Route = createFileRoute('/subscription')({
  component: SubscriptionPage,
})

function SubscriptionPage() {
  const { data, isLoading } = useSubscription()
  const setPlan = useSetSubscriptionPlan()

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <h2 className="text-3xl">Subscription</h2>
        <LoadingSkeleton cols={2} height={180} />
      </div>
    )
  }

  const activePlan = data.plan

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl">Subscription</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
          Track how close you are to your plan&apos;s rolling usage caps
        </p>
      </div>

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <Zap size={18} style={{ color: 'var(--color-primary)' }} />
          <div className="flex-1">
            <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>Active plan</p>
            <p className="text-lg" style={{ fontFamily: 'Georgia, serif', fontWeight: 500 }}>
              {activePlan.name}
              {activePlan.monthlyPriceUsd !== null && (
                <span
                  className="ml-2 text-sm"
                  style={{ color: 'var(--color-muted-foreground)' }}
                >
                  — {formatCost(activePlan.monthlyPriceUsd)}/mo
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {PLAN_IDS.map((id) => {
            const plan = SUBSCRIPTION_PLANS[id]
            const active = plan.id === activePlan.id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setPlan.mutate({ planId: id })}
                disabled={setPlan.isPending}
                className="rounded-md px-3 py-1.5 text-sm transition-colors"
                style={{
                  backgroundColor: active
                    ? 'var(--color-primary)'
                    : 'var(--color-secondary)',
                  color: active
                    ? 'var(--color-primary-foreground)'
                    : 'var(--color-foreground)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {plan.name}
              </button>
            )
          })}
        </div>
      </Card>

      {activePlan.id === 'none' ? (
        <Card>
          <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
            Pay-per-token doesn&apos;t have a quota to track. Pick a plan above
            to see usage gauges, or head to the{' '}
            <a
              href="/forecast"
              className="underline"
              style={{ color: 'var(--color-primary)' }}
            >
              forecast page
            </a>{' '}
            for dollar-based projections.
          </p>
        </Card>
      ) : (
        <>
          <Card>
            <WindowSection
              window={data.fiveHour}
              icon={<Clock size={16} />}
            />
          </Card>

          {data.weekly && (
            <Card>
              <WindowSection
                window={data.weekly}
                icon={<CalendarDays size={16} />}
              />
            </Card>
          )}
        </>
      )}

      <Card title="Activity in the last 24 hours">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <Stat
            label="Input tokens"
            value={formatTokens(data.totalInLast24h.input)}
          />
          <Stat
            label="Output tokens"
            value={formatTokens(data.totalInLast24h.output)}
          />
          <Stat
            label="Estimated cost"
            value={formatCost(data.totalInLast24h.cost)}
          />
        </div>
      </Card>

      {activePlan.id === 'custom' && <CustomPlanEditor />}
    </div>
  )
}

function WindowSection({
  window: w,
  icon,
}: {
  window: WindowUsage
  icon: React.ReactNode
}) {
  const pct = w.utilizationPercent ?? 0
  const level = pct >= 1 ? 'exceeded' : pct >= 0.8 ? 'warning' : 'ok'
  const color =
    level === 'exceeded'
      ? '#b53333'
      : level === 'warning'
      ? 'var(--color-primary)'
      : '#5e5d59'
  const pctLabel =
    w.utilizationPercent !== null ? `${(pct * 100).toFixed(1)}%` : '—'

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span style={{ color: 'var(--color-muted-foreground)' }}>{icon}</span>
          <span className="text-sm font-medium">{w.label}</span>
        </div>
        <span
          className="flex items-center gap-1 text-sm tabular-nums"
          style={{ color }}
        >
          {level === 'exceeded' && <AlertTriangle size={13} />}
          {pctLabel} used
        </span>
      </div>

      <div
        className="h-3 w-full rounded-full overflow-hidden mb-2"
        style={{ backgroundColor: 'var(--color-secondary)' }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.min(100, pct * 100)}%`,
            backgroundColor: color,
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
        <Gauge
          label="Input"
          used={w.inputTokens}
          limit={w.inputLimit}
          percent={w.inputPercent}
        />
        <Gauge
          label="Output"
          used={w.outputTokens}
          limit={w.outputLimit}
          percent={w.outputPercent}
        />
      </div>

      {w.resetsAt && (
        <p
          className="mt-3 text-xs"
          style={{ color: 'var(--color-muted-foreground)' }}
        >
          Oldest message in window drops off{' '}
          {new Date(w.resetsAt).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </p>
      )}
      <p
        className="mt-1 text-[11px]"
        style={{ color: 'var(--color-muted-foreground)' }}
      >
        {w.messageCount.toLocaleString()} messages in this window
      </p>
    </>
  )
}

function Gauge({
  label,
  used,
  limit,
  percent,
}: {
  label: string
  used: number
  limit: number | null
  percent: number | null
}) {
  return (
    <div>
      <div
        className="flex items-center justify-between text-xs mb-1"
        style={{ color: 'var(--color-muted-foreground)' }}
      >
        <span>{label}</span>
        <span className="tabular-nums">
          {formatTokens(used)}
          {limit !== null && <> / {formatTokens(limit)}</>}
        </span>
      </div>
      <div
        className="h-1.5 w-full rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--color-secondary)' }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, (percent ?? 0) * 100)}%`,
            backgroundColor: 'var(--color-primary)',
          }}
        />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>{label}</p>
      <p
        className="mt-0.5 text-lg font-medium tabular-nums"
        style={{ color: 'var(--color-foreground)' }}
      >
        {value}
      </p>
    </div>
  )
}

function CustomPlanEditor() {
  const { data } = useSubscription()
  const setPlan = useSetSubscriptionPlan()
  const [i5, setI5] = useState('')
  const [o5, setO5] = useState('')
  const [iw, setIw] = useState('')
  const [ow, setOw] = useState('')

  const live = data?.plan
  if (!live || live.id !== 'custom') return null

  return (
    <Card title="Custom plan limits">
      <p className="text-xs mb-3" style={{ color: 'var(--color-muted-foreground)' }}>
        Enter your own 5-hour and weekly caps. Leave weekly blank to disable
        that gauge.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setPlan.mutate({
            planId: 'custom',
            customFiveHourInput: i5 ? Number(i5) : undefined,
            customFiveHourOutput: o5 ? Number(o5) : undefined,
            customWeeklyInput: iw === '' ? undefined : iw === 'none' ? null : Number(iw),
            customWeeklyOutput: ow === '' ? undefined : ow === 'none' ? null : Number(ow),
          })
          setI5(''); setO5(''); setIw(''); setOw('')
        }}
        className="grid grid-cols-2 gap-3"
      >
        <NumberField label="5h input cap" value={i5} setValue={setI5} placeholder={String(live.fiveHourInputTokens ?? '')} />
        <NumberField label="5h output cap" value={o5} setValue={setO5} placeholder={String(live.fiveHourOutputTokens ?? '')} />
        <NumberField label="Weekly input cap" value={iw} setValue={setIw} placeholder={live.weeklyInputTokens === null ? 'none' : String(live.weeklyInputTokens)} />
        <NumberField label="Weekly output cap" value={ow} setValue={setOw} placeholder={live.weeklyOutputTokens === null ? 'none' : String(live.weeklyOutputTokens)} />
        <button
          type="submit"
          disabled={setPlan.isPending}
          className="col-span-2 rounded-md px-3 py-1.5 text-sm mt-2"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-primary-foreground)',
          }}
        >
          Save custom limits
        </button>
      </form>
    </Card>
  )
}

function NumberField({
  label,
  value,
  setValue,
  placeholder,
}: {
  label: string
  value: string
  setValue: (v: string) => void
  placeholder: string
}) {
  return (
    <label className="text-xs">
      <span
        className="block mb-1"
        style={{ color: 'var(--color-muted-foreground)' }}
      >
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md px-2 py-1.5 text-sm"
        style={{
          backgroundColor: 'var(--color-background)',
          border: '1px solid var(--color-border)',
        }}
      />
    </label>
  )
}
