import { prisma } from '@/lib/db'
import { isSuperAdmin } from '@/lib/admin'
import { roleHas, type Permission } from '@/lib/rbac'

export type MenuEntry = {
  id: string
  label: string
  path: string
  icon: string | null
  order: number
  roles: string[]
  isActive: boolean
  isExternal: boolean
}

export const DEFAULT_MENU: Omit<MenuEntry, 'id'>[] = [
  { label: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard', order: 1, roles: [], isActive: true, isExternal: false },
  { label: 'Widget Library', path: '/library', icon: 'Library', order: 2, roles: [], isActive: true, isExternal: false },
  { label: 'Marketplace', path: '/marketplace', icon: 'Store', order: 3, roles: [], isActive: true, isExternal: false },
  { label: 'Training', path: '/training', icon: 'GraduationCap', order: 4, roles: [], isActive: true, isExternal: false },
  { label: 'Sales & CRM', path: '/sales', icon: 'Briefcase', order: 10, roles: [], isActive: true, isExternal: false },
  { label: 'Engineering', path: '/engineering', icon: 'GitBranch', order: 11, roles: [], isActive: true, isExternal: false },
  { label: 'Admin', path: '/admin', icon: 'Shield', order: 100, roles: ['super_admin'], isActive: true, isExternal: false },
]

/** Pages additionally gated by an RBAC permission (see lib/rbac.ts), on top of the menu role list. */
export const PERMISSION_PATHS: Record<string, Permission> = {
  '/sales': 'crm.view',
  '/engineering': 'dora.view',
}

export function menuVisibleTo(item: { roles: string[]; isActive: boolean; path: string }, role: string | undefined | null) {
  if (!item.isActive) return false
  if (item.path.startsWith('/admin')) return isSuperAdmin(role)
  if (isSuperAdmin(role)) return true
  if (!item.roles || item.roles.length === 0) return true
  return item.roles.includes(role ?? 'user')
}

export async function getMenuForRole(role: string | undefined | null): Promise<MenuEntry[]> {
  let items = await prisma.menuItem.findMany({ orderBy: { order: 'asc' } })
  // Add newly introduced default pages to an existing menu table once.
  if (items.length) {
    const missing = DEFAULT_MENU.filter(d => !items.some(i => i.path === d.path))
    if (missing.length) {
      await prisma.menuItem.createMany({ data: missing.map(({ label, path, icon, order, roles }) => ({ label, path, icon, order, roles })) })
      items = await prisma.menuItem.findMany({ orderBy: { order: 'asc' } })
    }
  }
  const source: MenuEntry[] = items.length
    ? items
    : DEFAULT_MENU.map((m, i) => ({ ...m, id: `default-${i}` }))
  const visible: MenuEntry[] = []
  for (const m of source) {
    if (!menuVisibleTo(m, role)) continue
    const perm = PERMISSION_PATHS[m.path]
    if (perm && !(await roleHas(role, perm))) continue
    visible.push(m)
  }
  return visible
}

/**
 * Whether a role may open an internal page. Pages not present in the menu table are open to everyone;
 * pages that are present are restricted to the roles configured by the super admin.
 */
export async function canAccessPath(role: string | undefined | null, path: string) {
  if (isSuperAdmin(role)) return true
  const perm = PERMISSION_PATHS[path]
  if (perm && !(await roleHas(role, perm))) return false
  const item = await prisma.menuItem.findFirst({ where: { path, isExternal: false } })
  if (!item) return true
  return menuVisibleTo(item, role)
}
