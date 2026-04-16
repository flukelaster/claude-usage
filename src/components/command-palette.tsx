import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import {
  LayoutDashboard, FolderOpen, MessageSquare, Cpu, Database, Settings,
  CalendarDays, TrendingUp, Clock, Gauge, FlaskConical, Hammer,
  AlertOctagon, Tag as TagIcon, Maximize2, GitCompare, CalendarRange,
  RefreshCw, Moon, Sun, Search,
} from 'lucide-react'

import { useProjects } from '~/hooks/useProjects'
import { useSessions } from '~/hooks/useSessions'
import { useTagList } from '~/hooks/useTags'
import { useSyncLogs } from '~/hooks/useSync'
import { useTheme } from '~/lib/theme'

type Item = {
  id: string
  label: string
  hint?: string
  group: 'Pages' | 'Projects' | 'Sessions' | 'Tags' | 'Actions'
  icon: React.ReactNode
  run: () => void
}

const PAGES: Array<{ to: string; label: string; icon: React.ReactNode }> = [
  { to: '/', label: 'Overview', icon: <LayoutDashboard size={14} /> },
  { to: '/daily', label: 'Daily Usage', icon: <CalendarDays size={14} /> },
  { to: '/calendar', label: 'Activity Calendar', icon: <CalendarRange size={14} /> },
  { to: '/forecast', label: 'Cost Forecast', icon: <TrendingUp size={14} /> },
  { to: '/activity', label: 'Peak Hours', icon: <Clock size={14} /> },
  { to: '/projects', label: 'Projects', icon: <FolderOpen size={14} /> },
  { to: '/sessions', label: 'Sessions', icon: <MessageSquare size={14} /> },
  { to: '/efficiency', label: 'Efficiency', icon: <Gauge size={14} /> },
  { to: '/models', label: 'Models', icon: <Cpu size={14} /> },
  { to: '/tools', label: 'Tool Use', icon: <Hammer size={14} /> },
  { to: '/anomalies', label: 'Anomalies', icon: <AlertOctagon size={14} /> },
  { to: '/what-if', label: 'What-If', icon: <FlaskConical size={14} /> },
  { to: '/cache-analysis', label: 'Cache Analysis', icon: <Database size={14} /> },
  { to: '/context', label: 'Context Window', icon: <Maximize2 size={14} /> },
  { to: '/compare', label: 'Period Compare', icon: <GitCompare size={14} /> },
  { to: '/tags', label: 'Tags', icon: <TagIcon size={14} /> },
  { to: '/settings', label: 'Settings', icon: <Settings size={14} /> },
]

/**
 * Cmd+K / Ctrl+K global command palette. Aggregates static nav items,
 * projects, sessions, tags, and a handful of actions into one searchable
 * list. Mount once at the root.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const navigate = useNavigate()
  const router = useRouter()
  const { toggle: toggleTheme, theme } = useTheme()
  const sync = useSyncLogs()

  const { data: projects } = useProjects()
  const { data: sessions } = useSessions()
  const { data: tags } = useTagList()

  // Global hotkey.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isOpenKey = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
      if (isOpenKey) {
        e.preventDefault()
        setOpen((v) => !v)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Focus input when opening; clear when closing.
  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const items = useMemo<Item[]>(() => {
    const out: Item[] = []

    for (const p of PAGES) {
      out.push({
        id: `page:${p.to}`,
        label: p.label,
        hint: p.to,
        group: 'Pages',
        icon: p.icon,
        run: () => navigate({ to: p.to as never }),
      })
    }

    // The router's typed `to` + `params` narrows too aggressively for a
    // dynamic list; we know the shape, so cast `navigate` to a loose
    // callable here.
    const go = navigate as (opts: unknown) => void

    for (const proj of projects ?? []) {
      out.push({
        id: `project:${proj.id}`,
        label: proj.displayName,
        hint: proj.cwd ?? proj.id,
        group: 'Projects',
        icon: <FolderOpen size={14} />,
        run: () =>
          go({
            to: '/projects/$projectId',
            params: { projectId: proj.id },
          }),
      })
    }

    for (const s of (sessions ?? []).slice(0, 80)) {
      out.push({
        id: `session:${s.id}`,
        label: s.title || s.slug || s.id.slice(0, 12),
        hint: s.projectName,
        group: 'Sessions',
        icon: <MessageSquare size={14} />,
        run: () =>
          go({
            to: '/sessions/$sessionId',
            params: { sessionId: s.id },
          }),
      })
    }

    for (const t of tags ?? []) {
      out.push({
        id: `tag:${t.id}`,
        label: `#${t.name}`,
        hint: `${t.usageCount} use${t.usageCount === 1 ? '' : 's'}`,
        group: 'Tags',
        icon: <TagIcon size={14} />,
        run: () => navigate({ to: '/tags' as never }),
      })
    }

    out.push({
      id: 'action:sync',
      label: 'Sync Now',
      group: 'Actions',
      icon: <RefreshCw size={14} />,
      run: () => sync.mutate(),
    })
    out.push({
      id: 'action:theme',
      label: `Toggle theme (${theme === 'dark' ? 'light' : 'dark'})`,
      group: 'Actions',
      icon: theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />,
      run: () => toggleTheme(),
    })

    return out
  }, [projects, sessions, tags, navigate, sync, theme, toggleTheme])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) =>
      it.label.toLowerCase().includes(q) ||
      (it.hint ?? '').toLowerCase().includes(q),
    )
  }, [items, query])

  useEffect(() => {
    if (active >= filtered.length) setActive(0)
  }, [filtered, active])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function commit(item: Item) {
    setOpen(false)
    item.run()
  }

  if (!open) return null

  const grouped = groupItems(filtered)

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]"
      style={{ backgroundColor: 'rgba(20,20,19,0.4)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div
        className="w-full max-w-xl rounded-xl overflow-hidden"
        style={{
          backgroundColor: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.15), 0px 0px 0px 1px var(--color-border)',
        }}
      >
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <Search size={16} style={{ color: 'var(--color-muted-foreground)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(a + 1, filtered.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(a - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                const pick = filtered[active]
                if (pick) commit(pick)
              }
            }}
            placeholder="Search pages, projects, sessions…"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--color-foreground)' }}
          />
          <kbd
            className="text-[10px] rounded px-1.5 py-0.5"
            style={{
              color: 'var(--color-muted-foreground)',
              backgroundColor: 'var(--color-secondary)',
            }}
          >
            Esc
          </kbd>
        </div>

        <div
          ref={listRef}
          className="max-h-[60vh] overflow-y-auto"
        >
          {filtered.length === 0 ? (
            <p
              className="text-sm py-6 text-center"
              style={{ color: 'var(--color-muted-foreground)' }}
            >
              No matches in {router.state.matches.length} active route{router.state.matches.length === 1 ? '' : 's'}.
            </p>
          ) : (
            grouped.map(({ group, items: groupItems, startIndex }) => (
              <div key={group}>
                <p
                  className="text-[10px] uppercase tracking-wide px-4 pt-3 pb-1"
                  style={{ color: 'var(--color-muted-foreground)' }}
                >
                  {group}
                </p>
                {groupItems.map((it, i) => {
                  const idx = startIndex + i
                  const isActive = idx === active
                  return (
                    <div
                      key={it.id}
                      data-idx={idx}
                      onMouseMove={() => setActive(idx)}
                      onClick={() => commit(it)}
                      className="flex items-center gap-3 px-4 py-2 cursor-pointer"
                      style={{
                        backgroundColor: isActive ? 'var(--color-secondary)' : 'transparent',
                      }}
                    >
                      <span style={{ color: 'var(--color-muted-foreground)' }}>
                        {it.icon}
                      </span>
                      <span className="flex-1 text-sm truncate">{it.label}</span>
                      {it.hint && (
                        <span
                          className="text-xs truncate max-w-[220px]"
                          style={{ color: 'var(--color-muted-foreground)' }}
                        >
                          {it.hint}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div
          className="flex items-center justify-between px-4 py-2 text-[11px]"
          style={{
            color: 'var(--color-muted-foreground)',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <span>↑↓ navigate · ↵ select</span>
          <span>
            <kbd
              className="rounded px-1 py-0.5"
              style={{ backgroundColor: 'var(--color-secondary)' }}
            >
              ⌘K
            </kbd>{' '}
            to toggle
          </span>
        </div>
      </div>
    </div>
  )
}

function groupItems(items: Item[]): Array<{
  group: Item['group']
  items: Item[]
  startIndex: number
}> {
  const order: Array<Item['group']> = [
    'Pages', 'Projects', 'Sessions', 'Tags', 'Actions',
  ]
  const out: Array<{ group: Item['group']; items: Item[]; startIndex: number }> = []
  let running = 0
  for (const g of order) {
    const group = items.filter((i) => i.group === g)
    if (group.length === 0) continue
    out.push({ group: g, items: group, startIndex: running })
    running += group.length
  }
  return out
}
