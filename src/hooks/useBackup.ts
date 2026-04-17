import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  exportDatabase,
  importDatabase,
  type DatabaseDump,
  type ImportResult,
} from '~/server/functions/db-backup'
import { useToast } from '~/components/ui/toast'
import { dataQueryKeys } from './queryKeys'

/**
 * Request a full DB dump from the server and trigger a browser download.
 * JSON rather than binary so the user can peek at a backup if they want.
 */
export function useExportDatabase() {
  const toast = useToast()
  return useMutation({
    mutationFn: async () => {
      const dump = await exportDatabase()
      const blob = new Blob([JSON.stringify(dump, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const stamp = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `claude-usage-backup-${stamp}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      return dump
    },
    onSuccess: (dump) => {
      const total = Object.values(dump.counts).reduce((s, n) => s + n, 0)
      toast.push({
        variant: 'success',
        title: 'Backup exported',
        description: `${total.toLocaleString()} rows across ${Object.keys(dump.counts).length} tables`,
      })
    },
    onError: (err) => {
      toast.push({
        variant: 'error',
        title: 'Export failed',
        description: err instanceof Error ? err.message : String(err),
      })
    },
  })
}

export function useImportDatabase() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation<ImportResult, Error, { dump: DatabaseDump; mode: 'merge' | 'replace' }>({
    mutationFn: (req) => importDatabase({ data: req }),
    onSuccess: (result) => {
      for (const key of dataQueryKeys) {
        qc.invalidateQueries({ queryKey: [key] })
      }
      const inserted = Object.values(result.inserted).reduce((s, n) => s + n, 0)
      const skipped = Object.values(result.skipped).reduce((s, n) => s + n, 0)
      toast.push({
        variant: result.errors.length > 0 ? 'warning' : 'success',
        title: `Imported ${inserted.toLocaleString()} rows`,
        description:
          skipped > 0
            ? `${skipped.toLocaleString()} duplicates skipped${result.errors.length ? ` · ${result.errors.length} errors` : ''}`
            : 'Backup merged cleanly',
      })
    },
    onError: (err) => {
      toast.push({
        variant: 'error',
        title: 'Import failed',
        description: err.message,
      })
    },
  })
}
