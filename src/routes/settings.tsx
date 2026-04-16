import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { PRICING, PRICING_LAST_VERIFIED } from '~/lib/pricing'
import { formatRelativeTime } from '~/lib/format'
import { RefreshCw, AlertTriangle, FolderOpen, Database, DollarSign, Calendar, Download, Upload } from 'lucide-react'
import {
  useAppSettings,
  useSetMonthlyBudget,
  useSetBillingCycleStartDay,
} from '~/hooks/useAppSettings'
import { useLastSync, useSyncLogs } from '~/hooks/useSync'
import { useHomedir } from '~/hooks/useSettings'
import { useExportDatabase, useImportDatabase } from '~/hooks/useBackup'
import { SidechainToggle } from '~/components/sidechain-toggle'
import { UnknownModelBanner } from '~/components/unknown-model-banner'
import type { DatabaseDump } from '~/server/functions/db-backup'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  const { data: lastSync } = useLastSync()
  const { data: homeDir } = useHomedir()
  const { data: settings } = useAppSettings()
  const syncMutation = useSyncLogs()
  const setBudget = useSetMonthlyBudget()
  const setCycleDay = useSetBillingCycleStartDay()

  const [budgetDraft, setBudgetDraft] = useState<string>('')
  const [cycleDraft, setCycleDraft] = useState<string>('')

  const exportDb = useExportDatabase()
  const importDb = useImportDatabase()
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge')

  const currentBudget = settings?.monthlyBudgetUsd ?? null
  const currentCycle = settings?.billingCycleStartDay ?? 1

  async function onImportFile(file: File) {
    try {
      const text = await file.text()
      const dump = JSON.parse(text) as DatabaseDump
      importDb.mutate({ dump, mode: importMode })
    } catch (err) {
      alert(`Failed to read backup: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Check if pricing is stale (>90 days)
  const lastVerified = new Date(PRICING_LAST_VERIFIED)
  const daysSinceVerified = Math.floor((Date.now() - lastVerified.getTime()) / (24 * 60 * 60 * 1000))
  const pricingStale = daysSinceVerified > 90

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl">Settings</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
          Dashboard configuration
        </p>
      </div>

      <UnknownModelBanner />

      {/* Analytics preferences */}
      <div className="rounded-lg p-6" style={{ backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
        <h3 className="text-lg mb-4">Analytics Preferences</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Include sidechain messages</p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)' }}>
                Count subagent turns in cost and token analytics.
              </p>
            </div>
            <SidechainToggle />
          </div>

          <div className="flex items-center justify-between gap-4 border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
            <div>
              <div className="flex items-center gap-2">
                <DollarSign size={14} style={{ color: 'var(--color-muted-foreground)' }} />
                <p className="text-sm font-medium">Monthly budget (USD)</p>
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)' }}>
                Leave blank to disable the budget banner. Currently{' '}
                {currentBudget !== null ? `$${currentBudget.toFixed(2)}` : 'not set'}.
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const n = Number(budgetDraft)
                setBudget.mutate(Number.isFinite(n) && n > 0 ? n : null)
                setBudgetDraft('')
              }}
              className="flex items-center gap-2"
            >
              <input
                type="number"
                min={0}
                step={1}
                value={budgetDraft}
                placeholder={currentBudget !== null ? String(currentBudget) : '100'}
                onChange={(e) => setBudgetDraft(e.target.value)}
                className="w-28 rounded-md px-2 py-1.5 text-sm"
                style={{
                  backgroundColor: 'var(--color-background)',
                  border: '1px solid var(--color-border)',
                }}
              />
              <button
                type="submit"
                disabled={setBudget.isPending}
                className="rounded-md px-3 py-1.5 text-sm"
                style={{
                  backgroundColor: 'var(--color-primary)',
                  color: 'var(--color-primary-foreground)',
                }}
              >
                Save
              </button>
            </form>
          </div>

          <div className="flex items-center justify-between gap-4 border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
            <div>
              <div className="flex items-center gap-2">
                <Calendar size={14} style={{ color: 'var(--color-muted-foreground)' }} />
                <p className="text-sm font-medium">Billing cycle start day</p>
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)' }}>
                Day of month the billing period resets (1–28). Currently day {currentCycle}.
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const n = Number(cycleDraft)
                if (Number.isFinite(n)) setCycleDay.mutate(n)
                setCycleDraft('')
              }}
              className="flex items-center gap-2"
            >
              <input
                type="number"
                min={1}
                max={28}
                value={cycleDraft}
                placeholder={String(currentCycle)}
                onChange={(e) => setCycleDraft(e.target.value)}
                className="w-20 rounded-md px-2 py-1.5 text-sm"
                style={{
                  backgroundColor: 'var(--color-background)',
                  border: '1px solid var(--color-border)',
                }}
              />
              <button
                type="submit"
                disabled={setCycleDay.isPending}
                className="rounded-md px-3 py-1.5 text-sm"
                style={{
                  backgroundColor: 'var(--color-primary)',
                  color: 'var(--color-primary-foreground)',
                }}
              >
                Save
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Backup & Restore */}
      <div
        className="rounded-lg p-6"
        style={{
          backgroundColor: 'var(--color-card)',
          border: '1px solid var(--color-border)',
        }}
      >
        <h3 className="text-lg mb-1">Backup &amp; Restore</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--color-muted-foreground)' }}>
          Export the full database (projects, sessions, messages, tags) as a
          JSON file, or import one from another machine.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => exportDb.mutate()}
            disabled={exportDb.isPending}
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm"
            style={{
              backgroundColor: 'var(--color-secondary)',
              color: 'var(--color-secondary-foreground)',
              border: '1px solid var(--color-border)',
            }}
          >
            <Download size={14} />
            {exportDb.isPending ? 'Exporting…' : 'Export database'}
          </button>

          <label
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm cursor-pointer"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-primary-foreground)',
            }}
          >
            <Upload size={14} />
            {importDb.isPending ? 'Importing…' : 'Import database'}
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onImportFile(f)
                e.target.value = ''
              }}
            />
          </label>

          <div
            className="flex rounded-md p-0.5 text-xs"
            style={{ backgroundColor: 'var(--color-secondary)' }}
          >
            {(['merge', 'replace'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setImportMode(m)}
                className="rounded-sm px-2 py-1 capitalize"
                style={{
                  backgroundColor:
                    importMode === m ? 'var(--color-card)' : 'transparent',
                  color:
                    importMode === m
                      ? 'var(--color-foreground)'
                      : 'var(--color-muted-foreground)',
                  boxShadow:
                    importMode === m
                      ? '0px 0px 0px 1px var(--color-border)'
                      : 'none',
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-3 text-[11px]" style={{ color: 'var(--color-muted-foreground)' }}>
          <strong>Merge</strong> keeps existing rows and only adds new ones
          (deduped by primary key). <strong>Replace</strong> wipes everything
          first — destructive, use for restoring a clean backup.
        </p>

        {importDb.data && (
          <div
            className="mt-3 rounded-md p-3 text-xs"
            style={{ backgroundColor: 'var(--color-background)' }}
          >
            <p className="font-medium">Import complete</p>
            <ul className="mt-1 space-y-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
              {Object.entries(importDb.data.inserted).map(([k, v]) => (
                <li key={k}>
                  {k}: +{v.toLocaleString()} inserted ·{' '}
                  {importDb.data!.skipped[k]?.toLocaleString() ?? 0} skipped
                </li>
              ))}
            </ul>
            {importDb.data.errors.length > 0 && (
              <p className="mt-2" style={{ color: '#b53333' }}>
                {importDb.data.errors.length} rows errored. First: {importDb.data.errors[0]}
              </p>
            )}
          </div>
        )}

        {importDb.isError && (
          <p className="mt-3 text-xs" style={{ color: '#b53333' }}>
            Import failed: {importDb.error?.message}
          </p>
        )}
      </div>

      {/* Log Path */}
      <div className="rounded-lg p-6" style={{ backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <FolderOpen size={18} style={{ color: 'var(--color-muted-foreground)' }} />
          <h3 className="text-lg">Log Source</h3>
        </div>
        <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
          Reading Claude Code logs from:
        </p>
        <code
          className="mt-2 block rounded-md px-3 py-2 text-sm"
          style={{ backgroundColor: 'var(--color-secondary)', color: 'var(--color-secondary-foreground)', fontFamily: 'monospace' }}
        >
          {homeDir ?? '~'}/.claude/projects/
        </code>
      </div>

      {/* Sync */}
      <div className="rounded-lg p-6" style={{ backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Database size={18} style={{ color: 'var(--color-muted-foreground)' }} />
          <h3 className="text-lg">Data Sync</h3>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
              Last synced: {lastSync ? formatRelativeTime(new Date(lastSync)) : 'Never'}
            </p>
            {syncMutation.data && (
              <p className="mt-1 text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                {syncMutation.data.filesProcessed} files, {syncMutation.data.messagesAdded} messages, {(syncMutation.data.durationMs / 1000).toFixed(1)}s
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm"
            style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-primary-foreground)' }}
          >
            <RefreshCw size={16} className={syncMutation.isPending ? 'animate-spin' : ''} />
            {syncMutation.isPending ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* Pricing Table */}
      <div className="rounded-lg p-6" style={{ backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg">Pricing Table</h3>
          <div className="flex items-center gap-2 text-xs" style={{ color: pricingStale ? 'var(--color-destructive)' : 'var(--color-muted-foreground)' }}>
            {pricingStale && <AlertTriangle size={14} />}
            Last verified: {PRICING_LAST_VERIFIED}
            {pricingStale && ' (stale!)'}
          </div>
        </div>

        {pricingStale && (
          <div className="mb-4 rounded-md px-4 py-3 text-sm" style={{ backgroundColor: 'var(--color-destructive)', color: 'var(--color-primary-foreground)' }}>
            <strong>Warning:</strong> Pricing data is over 90 days old. Check anthropic.com/pricing for current rates.
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--color-muted-foreground)' }}>Model</th>
              <th className="px-3 py-2 text-right font-medium" style={{ color: 'var(--color-muted-foreground)' }}>Input</th>
              <th className="px-3 py-2 text-right font-medium" style={{ color: 'var(--color-muted-foreground)' }}>Output</th>
              <th className="px-3 py-2 text-right font-medium" style={{ color: 'var(--color-muted-foreground)' }}>Cache Write (5m)</th>
              <th className="px-3 py-2 text-right font-medium" style={{ color: 'var(--color-muted-foreground)' }}>Cache Write (1h)</th>
              <th className="px-3 py-2 text-right font-medium" style={{ color: 'var(--color-muted-foreground)' }}>Cache Read</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(PRICING).map(([family, p]) => (
              <tr key={family} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td className="px-3 py-2 font-medium" style={{ color: 'var(--color-foreground)' }}>{family}</td>
                <td className="px-3 py-2 text-right" style={{ color: 'var(--color-muted-foreground)' }}>${p.input.toFixed(2)}</td>
                <td className="px-3 py-2 text-right" style={{ color: 'var(--color-muted-foreground)' }}>${p.output.toFixed(2)}</td>
                <td className="px-3 py-2 text-right" style={{ color: 'var(--color-muted-foreground)' }}>${p.cacheWrite5m.toFixed(2)}</td>
                <td className="px-3 py-2 text-right" style={{ color: 'var(--color-muted-foreground)' }}>${p.cacheWrite1h.toFixed(2)}</td>
                <td className="px-3 py-2 text-right" style={{ color: 'var(--color-muted-foreground)' }}>${p.cacheRead.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
          All prices in USD per million tokens
        </p>
      </div>
    </div>
  )
}
