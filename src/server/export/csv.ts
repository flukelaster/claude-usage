/**
 * Minimal CSV encoder — enough for dashboard exports without pulling in
 * a dependency. Quotes any field that contains a comma, newline, or
 * double-quote, and escapes embedded quotes by doubling them (RFC 4180).
 */

export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns?: Array<keyof T>,
): string {
  if (rows.length === 0) return ''
  const cols = columns ?? (Object.keys(rows[0]) as Array<keyof T>)
  const header = cols.map((c) => csvCell(String(c))).join(',')
  const body = rows
    .map((row) => cols.map((c) => csvCell(stringify(row[c]))).join(','))
    .join('\n')
  return `${header}\n${body}\n`
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

function csvCell(s: string): string {
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}
