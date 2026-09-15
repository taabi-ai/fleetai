'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AppNav } from '@/components/app-nav'
import { Gauge, Users, Link2, Cpu, Mail, Menu, Rocket, ShieldCheck, Plug, ScrollText, Coins, KeyRound, FolderOpen, GraduationCap } from 'lucide-react'

const SECTIONS = [
  { href: '/admin', label: 'Overview', icon: Gauge },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/roles', label: 'Roles & permissions', icon: ShieldCheck },
  { href: '/admin/integrations', label: 'Integrations', icon: Plug },
  { href: '/admin/mcp-servers', label: 'MCP servers & agents', icon: Link2 },
  { href: '/admin/llm-providers', label: 'LLM providers', icon: Cpu },
  { href: '/admin/usage', label: 'LLM usage & quotas', icon: Coins },
  { href: '/admin/audit', label: 'Audit logs', icon: ScrollText },
  { href: '/admin/env', label: 'Environment variables', icon: KeyRound },
  { href: '/admin/media', label: 'Media & storage', icon: FolderOpen },
  { href: '/admin/training', label: 'Training modules', icon: GraduationCap },
  { href: '/admin/smtp', label: 'SMTP / Email', icon: Mail },
  { href: '/admin/menu', label: 'Menu & access', icon: Menu },
  { href: '/admin/deploy', label: 'Deployment', icon: Rocket },
]

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col md:flex-row gap-6">
        <aside className="md:w-56 flex-shrink-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground px-3 mb-2">Admin console</div>
          <nav className="flex md:flex-col gap-1 overflow-x-auto">
            {SECTIONS.map(s => {
              const active = pathname === s.href
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                  }`}
                >
                  <s.icon className="w-3.5 h-3.5" /> {s.label}
                </Link>
              )
            })}
          </nav>
        </aside>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  )
}
