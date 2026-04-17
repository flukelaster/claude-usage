import { useState } from 'react'
import { Download } from 'lucide-react'
import { useExportData } from '~/hooks/useExportData'
import type { Period } from '~/types'

type Dataset = 'sessions' | 'messages' | 'daily'
type Format = 'csv' | 'json'

interface DataExportButtonProps {
  period: Period
  defaultDataset?: Dataset
}

/**
 * Drop-in button for spreadsheet-friendly exports. Pairs with the PDF
 * ExportButton for human-readable reports; this one is for analysts.
 */
export function DataExportButton({
  period,
  defaultDataset = 'daily',
}: DataExportButtonProps) {
  const [open, setOpen] = useState(false)
  const [dataset, setDataset] = useState<Dataset>(defaultDataset)
  const [format, setFormat] = useState<Format>('csv')
  const mutation = useExportData()

  function triggerExport() {
    mutation.mutate({
      dataset,
      format,
      days: period === 'all' ? null : period === '30d' ? 30 : 90,
    })
    setOpen(false)
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm"
        style={{
          backgroundColor: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-foreground)',
        }}
      >
        <Download size={14} />
        Data export
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 w-56 rounded-lg p-3 z-10"
          style={{
            backgroundColor: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            boxShadow: '0px 0px 0px 1px var(--color-border), 0 4px 24px rgba(0,0,0,0.05)',
          }}
        >
          <label className="text-xs block" style={{ color: 'var(--color-muted-foreground)' }}>
            Dataset
          </label>
          <select
            value={dataset}
            onChange={(e) => setDataset(e.target.value as Dataset)}
            className="mt-1 w-full rounded-md px-2 py-1 text-sm"
            style={{
              backgroundColor: 'var(--color-background)',
              border: '1px solid var(--color-border)',
            }}
          >
            <option value="daily">Daily usage summary</option>
            <option value="sessions">Sessions</option>
            <option value="messages">Messages (raw)</option>
          </select>

          <label
            className="mt-3 text-xs block"
            style={{ color: 'var(--color-muted-foreground)' }}
          >
            Format
          </label>
          <div className="mt-1 flex gap-2">
            {(['csv', 'json'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                className="flex-1 rounded-md px-2 py-1 text-xs"
                style={{
                  backgroundColor:
                    format === f ? 'var(--color-primary)' : 'var(--color-secondary)',
                  color:
                    format === f
                      ? 'var(--color-primary-foreground)'
                      : 'var(--color-secondary-foreground)',
                }}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={triggerExport}
            disabled={mutation.isPending}
            className="mt-3 w-full rounded-md px-3 py-1.5 text-sm"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-primary-foreground)',
            }}
          >
            {mutation.isPending ? 'Preparing…' : 'Download'}
          </button>
        </div>
      )}
    </div>
  )
}
