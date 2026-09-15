'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import {
  LayoutDashboard, Library, Store, LogOut, ShieldCheck, Shield, Link2, Bot, Settings, Users, Mail, Cpu, Menu as MenuIcon,
  BarChart3, Map, Truck, Zap, Fuel, Bell, Globe, ExternalLink, Briefcase, GitBranch, MoreHorizontal, GraduationCap, Coins, type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NotificationBell } from '@/components/notification-bell'
import { ThemeToggle } from '@/components/theme-toggle'
import { UsageDialog, OPEN_USAGE_EVENT } from '@/components/usage-dialog'

export const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, Library, Store, Shield, ShieldCheck, Link2, Bot, Settings, Users, Mail, Cpu, Menu: MenuIcon,
  BarChart3, Map, Truck, Zap, Fuel, Bell, Globe, ExternalLink, Briefcase, GitBranch, GraduationCap, Coins,
}

export type NavItem = { id: string; label: string; path: string; icon?: string | null; isExternal?: boolean }

const DEFAULT_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard' },
  { id: 'library', label: 'Widget Library', path: '/library', icon: 'Library' },
  { id: 'marketplace', label: 'Marketplace', path: '/marketplace', icon: 'Store' },
]

export function AppNav({ onOpenPinSettings, children }: { onOpenPinSettings?: () => void; children?: React.ReactNode }) {
  const { data: session } = useSession() || {}
  const pathname = usePathname()
  const initial = (session?.user?.name ?? session?.user?.email ?? 'U').charAt(0).toUpperCase()
  const role = (session?.user as any)?.role as string | undefined
  const isSuperAdmin = role === 'super_admin'
  const [nav, setNav] = useState<NavItem[]>(DEFAULT_NAV)
  const [usageOpen, setUsageOpen] = useState(false)

  useEffect(() => {
    const h = () => setUsageOpen(true)
    window.addEventListener(OPEN_USAGE_EVENT, h)
    return () => window.removeEventListener(OPEN_USAGE_EVENT, h)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/menu', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && Array.isArray(d) && d.length > 0) setNav(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [role])

  const isActive = (n: NavItem) => !n.isExternal && (pathname === n.path || pathname?.startsWith(n.path + '/'))
  // Keep the header compact: show up to 4 items inline, the rest under "More".
  const MAX_INLINE = 4
  const inlineNav = nav.length > MAX_INLINE ? nav.slice(0, MAX_INLINE - 1) : nav
  const overflowNav = nav.length > MAX_INLINE ? nav.slice(MAX_INLINE - 1) : []
  const overflowActive = overflowNav.some(isActive)

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-card/80 backdrop-blur-xl">
      <div className="h-14 flex items-center justify-between px-4 gap-4">
        <div className="flex items-center gap-4 flex-shrink-0">
          <Link href="/dashboard" className="flex items-center gap-2 flex-shrink-0">
            <span className="inline-flex items-center rounded-md bg-white px-1.5 py-0.5">
              <Image src="/taabi-logo-v1.png" alt="Taabi" width={72} height={26} priority className="h-[22px] w-auto" />
            </span>
            <span className="font-display font-semibold text-foreground hidden xl:inline">FleetAI Dash</span>
          </Link>
          <nav className="flex items-center gap-1 min-w-0">
            {inlineNav.map(n => {
              const Icon = (n.icon && ICONS[n.icon]) || (n.isExternal ? ExternalLink : LayoutDashboard)
              const active = isActive(n)
              const cls = `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
                active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              }`
              return n.isExternal ? (
                <a key={n.id} href={n.path} target="_blank" rel="noopener noreferrer" className={cls} title={n.label}>
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">{n.label}</span>
                </a>
              ) : (
                <Link key={n.id} href={n.path} className={cls} title={n.label}>
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">{n.label}</span>
                </Link>
              )
            })}
            {overflowNav.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
                      overflowActive ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                    }`}
                    title="More"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">More</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {overflowNav.map(n => {
                    const Icon = (n.icon && ICONS[n.icon]) || (n.isExternal ? ExternalLink : LayoutDashboard)
                    return (
                      <DropdownMenuItem key={n.id} asChild>
                        {n.isExternal ? (
                          <a href={n.path} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer">
                            <Icon className="w-4 h-4" /> {n.label}
                          </a>
                        ) : (
                          <Link href={n.path} className={`flex items-center gap-2 cursor-pointer ${isActive(n) ? 'text-primary' : ''}`}>
                            <Icon className="w-4 h-4" /> {n.label}
                          </Link>
                        )}
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-2 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {children}
          <ThemeToggle />
          <NotificationBell />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button aria-label="Account menu" className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary hover:bg-primary/30 transition-colors">
                {initial}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs">
                <div className="font-medium text-foreground truncate">{session?.user?.name ?? 'User'}</div>
                <div className="text-muted-foreground truncate font-normal">{session?.user?.email}</div>
                {role && <div className="mt-1 inline-block px-1.5 py-0.5 rounded bg-white/5 text-[10px] uppercase tracking-wide text-muted-foreground">{role.replace('_', ' ')}</div>}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {isSuperAdmin && (
                <DropdownMenuItem asChild className="text-xs gap-2">
                  <Link href="/admin"><Shield className="w-3.5 h-3.5" /> Admin console</Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setUsageOpen(true)} className="text-xs gap-2">
                <Coins className="w-3.5 h-3.5" /> AI usage & credits
              </DropdownMenuItem>
              {onOpenPinSettings && (
                <DropdownMenuItem onClick={onOpenPinSettings} className="text-xs gap-2">
                  <ShieldCheck className="w-3.5 h-3.5" /> AI Assistant PIN
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => signOut({ redirectTo: '/login' })} className="text-xs gap-2 text-destructive focus:text-destructive">
                <LogOut className="w-3.5 h-3.5" /> Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <UsageDialog open={usageOpen} onOpenChange={setUsageOpen} />
    </header>
  )
}

export function LogoutButton() {
  return (
    <Button variant="ghost" size="sm" onClick={() => signOut({ redirectTo: '/login' })} className="text-xs text-muted-foreground gap-1">
      <LogOut className="w-3 h-3" /> Logout
    </Button>
  )
}
