import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  exportDatabase,
  importDatabase,
  type DatabaseDump,
  type ImportResult,
} from '~/server/functions/db-backup'
import { dataQueryKeys } from './queryKeys'

/**
 * Request a full DB dump from the server and trigger a browser download.
 * JSON rather than binary so the user can peek at a backup if they want.
 */
export function useExportDatabase() {
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
  })
}

export function useImportDatabase() {
  const qc = useQueryClient()
  return useMutation<ImportResult, Error, { dump: DatabaseDump; mode: 'merge' | 'replace' }>({
    mutationFn: (req) => importDatabase({ data: req }),
    onSuccess: () => {
      for (const key of dataQueryKeys) {
        qc.invalidateQueries({ queryKey: [key] })
      }
    },
  })
}
