/// <reference types="vite/client" />
import { useState, type ReactNode } from 'react'
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
  Link,
  useRouterState,
} from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  LayoutDashboard,
  FolderOpen,
  MessageSquare,
  Cpu,
  Database,
  Settings,
  CalendarDays,
  TrendingUp,
  Clock,
  Gauge,
  FlaskConical,
  Hammer,
  AlertOctagon,
} from 'lucide-react'
import { useTheme } from '~/lib/theme'
import { ThemeToggle } from '~/components/theme-toggle'
import { useAutoSync } from '~/hooks/useAutoSync'
import '~/styles/globals.css'

const navItems = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/daily', label: 'Daily Usage', icon: CalendarDays },
  { to: '/forecast', label: 'Cost Forecast', icon: TrendingUp },
  { to: '/activity', label: 'Peak Hours', icon: Clock },
  { to: '/projects', label: 'Projects', icon: FolderOpen },
  { to: '/sessions', label: 'Sessions', icon: MessageSquare },
  { to: '/efficiency', label: 'Efficiency', icon: Gauge },
  { to: '/models', label: 'Models', icon: Cpu },
  { to: '/tools', label: 'Tool Use', icon: Hammer },
  { to: '/anomalies', label: 'Anomalies', icon: AlertOctagon },
  { to: '/what-if', label: 'What-If', icon: FlaskConical },
  { to: '/cache-analysis', label: 'Cache Analysis', icon: Database },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Claude Usage Dashboard' },
    ],
    links: [
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
      },
    },
  }))
  const { theme, toggle } = useTheme()

  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        <AutoSyncDriver />
        <div className="flex h-screen">
          <Sidebar theme={theme} onToggleTheme={toggle} />
          <main className="flex-1 overflow-y-auto p-8">
            <div className="mx-auto max-w-[1200px]">
              <Outlet />
            </div>
          </main>
        </div>
      </QueryClientProvider>
    </RootDocument>
  )
}

function AutoSyncDriver() {
  // Rendered inside QueryClientProvider so the hook can subscribe to the
  // watcher query and fan out invalidations through the shared client.
  useAutoSync()
  return null
}

function Sidebar({ theme, onToggleTheme }: { theme: 'light' | 'dark'; onToggleTheme: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <aside
      className="flex h-full w-[280px] flex-col border-r"
      style={{
        backgroundColor: 'var(--color-card)',
        borderColor: 'var(--color-border)',
      }}
    >
      {/* Logo */}
      <div className="px-6 py-6">
        <div className="flex items-center gap-3">
          <ClaudeLogo size={40} />
          <div>
            <h1
              className="text-xl"
              style={{
                fontFamily: 'Georgia, serif',
                fontWeight: 500,
                color: 'var(--color-foreground)',
                lineHeight: 1.10,
              }}
            >
              Claude Usage
            </h1>
            <p
              className="mt-0.5 text-xs"
              style={{ color: 'var(--color-muted-foreground)' }}
            >
              Token & Cost Dashboard
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.to === '/'
                ? pathname === '/'
                : pathname.startsWith(item.to)
            const Icon = item.icon
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
                  style={{
                    backgroundColor: isActive ? 'var(--color-secondary)' : 'transparent',
                    color: isActive ? 'var(--color-secondary-foreground)' : 'var(--color-muted-foreground)',
                    fontWeight: isActive ? 500 : 400,
                  }}
                >
                  <Icon size={18} strokeWidth={1.8} />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div
        className="flex items-center justify-between border-t px-6 py-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
          Local-only dashboard
        </p>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
    </aside>
  )
}

const themeScript = `(function(){try{var t=localStorage.getItem('claude-usage-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')}catch(e){}})();`

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function ClaudeLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" fill="#D97757" fillRule="nonzero" />
    </svg>
  )
}
