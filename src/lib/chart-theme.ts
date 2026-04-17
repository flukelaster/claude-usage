/**
 * Recharts is JS-only and doesn't consume CSS variables, so we materialize
 * the current theme values on the client and pass them as props. The
 * reactive `useChartTheme()` hook re-reads on mount and whenever the
 * `.dark` class toggles on <html>, which is the only thing that changes
 * the active theme in this app.
 */

import { useEffect, useState } from 'react'

export interface ChartTheme {
  grid: string
  tick: string
  label: string
  tooltipBg: string
  tooltipBorder: string
  tooltipText: string
  primary: string
  series: [string, string, string, string, string]
}

function readTheme(): ChartTheme {
  if (typeof window === 'undefined') {
    return FALLBACK_LIGHT
  }
  const css = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string) => {
    const v = css.getPropertyValue(name).trim()
    return v || fallback
  }
  return {
    grid: read('--color-chart-grid', '#f0eee6'),
    tick: read('--color-chart-tick', '#87867f'),
    label: read('--color-chart-label', '#5e5d59'),
    tooltipBg: read('--color-card', '#faf9f5'),
    tooltipBorder: read('--color-border', '#f0eee6'),
    tooltipText: read('--color-foreground', '#141413'),
    primary: read('--color-primary', '#c96442'),
    series: [
      read('--color-chart-1', '#c96442'),
      read('--color-chart-2', '#d97757'),
      read('--color-chart-3', '#87867f'),
      read('--color-chart-4', '#5e5d59'),
      read('--color-chart-5', '#b0aea5'),
    ],
  }
}

const FALLBACK_LIGHT: ChartTheme = {
  grid: '#f0eee6',
  tick: '#87867f',
  label: '#5e5d59',
  tooltipBg: '#faf9f5',
  tooltipBorder: '#f0eee6',
  tooltipText: '#141413',
  primary: '#c96442',
  series: ['#c96442', '#d97757', '#87867f', '#5e5d59', '#b0aea5'],
}

export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(() => readTheme())

  useEffect(() => {
    // Re-read after mount (SSR returns the fallback first).
    setTheme(readTheme())

    const observer = new MutationObserver(() => setTheme(readTheme()))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => observer.disconnect()
  }, [])

  return theme
}

/**
 * Shared tooltip content style — call sites spread this into the Recharts
 * `contentStyle` prop. Depends on the hook so the tooltip picks up the
 * current theme; pass the theme in if you already have it to avoid double
 * subscriptions.
 */
export function tooltipStyle(theme?: ChartTheme) {
  const t = theme ?? FALLBACK_LIGHT
  return {
    backgroundColor: t.tooltipBg,
    border: `1px solid ${t.tooltipBorder}`,
    borderRadius: 8,
    fontSize: 13,
    color: t.tooltipText,
  }
}
