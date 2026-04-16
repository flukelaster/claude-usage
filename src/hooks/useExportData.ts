import { useMutation } from '@tanstack/react-query'
import { exportData } from '~/server/functions/export-data'

type ExportFormat = 'csv' | 'json'
type ExportDataset = 'sessions' | 'messages' | 'daily'

interface ExportRequest {
  format: ExportFormat
  dataset: ExportDataset
  days?: number | null
}

/**
 * Request a CSV/JSON export from the server and trigger a browser
 * download via a temporary object URL. Kept as a mutation so downloads
 * don't cache between clicks.
 */
export function useExportData() {
  return useMutation({
    mutationFn: async (req: ExportRequest) => {
      const result = await exportData({ data: req })
      const blob = new Blob([result.body], { type: result.mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = result.filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      return result
    },
  })
}
