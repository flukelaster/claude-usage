import type { ReactNode } from 'react'

export interface DataTableColumn<T> {
  key: string
  header: ReactNode
  align?: 'left' | 'right' | 'center'
  width?: string | number
  cell: (row: T) => ReactNode
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  emptyText?: string
}

/**
 * Lightweight table wrapper that owns the warm header styling + hover
 * state. Use this instead of hand-rolling <table> markup on each page.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyText = 'No data',
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <p className="text-sm py-4" style={{ color: 'var(--color-muted-foreground)' }}>
        {emptyText}
      </p>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr
            className="text-left text-xs"
            style={{ color: 'var(--color-muted-foreground)' }}
          >
            {columns.map((c) => (
              <th
                key={c.key}
                className="py-2 font-normal"
                style={{
                  textAlign: c.align ?? 'left',
                  width: c.width,
                }}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-t"
              style={{ borderColor: 'var(--color-border)' }}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className="py-2"
                  style={{
                    textAlign: c.align ?? 'left',
                  }}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
