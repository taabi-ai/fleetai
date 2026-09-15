import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { isSuperAdmin } from '@/lib/admin'

/**
 * Permission catalog. Keys are `<area>.<action>`. Super admins implicitly hold every permission.
 * Roles are stored in the `Role` table and edited at /admin/roles.
 */
export const PERMISSIONS = [
  { key: 'dashboards.view', group: 'Dashboards', label: 'View dashboards' },
  { key: 'dashboards.edit', group: 'Dashboards', label: 'Create / edit own dashboards & widgets' },
  { key: 'dashboards.publish', group: 'Dashboards', label: 'Publish dashboards to the marketplace' },
  { key: 'dashboards.collaborate', group: 'Dashboards', label: 'Edit published / shared dashboards' },
  { key: 'ai.use', group: 'AI assistant', label: 'Use the AI assistant to generate & edit widgets' },
  { key: 'library.publish', group: 'Widget library', label: 'Publish widgets to the shared library' },
  { key: 'crm.view', group: 'Sales & CRM', label: 'View the Sales & CRM workspace' },
  { key: 'crm.manage', group: 'Sales & CRM', label: 'Manage CRM data sources, KAM / sales / marketing scorecards' },
  { key: 'dora.view', group: 'Engineering', label: 'View DORA / engineering metrics' },
  { key: 'dora.manage', group: 'Engineering', label: 'Manage engineering integrations (Plane.so, Jira) & telemetry' },
  { key: 'training.internal', group: 'Training', label: 'Watch internal (staff-only) training modules' },
  { key: 'training.manage', group: 'Training', label: 'Create & publish training modules and lessons' },
  { key: 'media.manage', group: 'Media', label: 'Upload & manage documents, videos and media assets' },
  { key: 'admin.users', group: 'Administration', label: 'Manage users' },
  { key: 'admin.roles', group: 'Administration', label: 'Manage roles & permissions' },
  { key: 'admin.integrations', group: 'Administration', label: 'Manage integrations (New Relic, Plane.so, Jira, MCP)' },
  { key: 'admin.settings', group: 'Administration', label: 'Manage LLM providers, SMTP, menu' },
] as const

export type Permission = (typeof PERMISSIONS)[number]['key']
export const PERMISSION_KEYS = PERMISSIONS.map(p => p.key) as Permission[]

export type RoleDef = { name: string; label: string; description: string; permissions: Permission[]; isSystem: boolean }

/** Roles created by the seed. `user`, `manager`, `super_admin` are system roles (cannot be deleted). */
export const DEFAULT_ROLES: RoleDef[] = [
  { name: 'user', label: 'User', description: 'Default role for self-registered accounts.', isSystem: true,
    permissions: ['dashboards.view', 'dashboards.edit', 'dashboards.publish', 'dashboards.collaborate', 'ai.use', 'library.publish'] },
  { name: 'manager', label: 'Manager', description: 'Team lead: everything a user can do plus Sales & CRM and engineering read access.', isSystem: true,
    permissions: ['dashboards.view', 'dashboards.edit', 'dashboards.publish', 'dashboards.collaborate', 'ai.use', 'library.publish', 'crm.view', 'dora.view', 'training.internal'] },
  { name: 'sales', label: 'Sales / KAM', description: 'Sales, key-account and marketing staff: dashboards + Sales & CRM workspace.', isSystem: false,
    permissions: ['dashboards.view', 'dashboards.edit', 'dashboards.collaborate', 'ai.use', 'crm.view', 'training.internal'] },
  { name: 'crm_manager', label: 'CRM manager', description: 'Owns CRM sources and sales scorecards.', isSystem: false,
    permissions: ['dashboards.view', 'dashboards.edit', 'dashboards.publish', 'dashboards.collaborate', 'ai.use', 'library.publish', 'crm.view', 'crm.manage', 'training.internal'] },
  { name: 'engineer', label: 'Engineer', description: 'Engineering team: dashboards + DORA metrics.', isSystem: false,
    permissions: ['dashboards.view', 'dashboards.edit', 'dashboards.collaborate', 'ai.use', 'dora.view', 'training.internal'] },
  { name: 'eng_manager', label: 'Engineering manager', description: 'Owns engineering integrations and DORA telemetry.', isSystem: false,
    permissions: ['dashboards.view', 'dashboards.edit', 'dashboards.publish', 'dashboards.collaborate', 'ai.use', 'library.publish', 'dora.view', 'dora.manage', 'training.internal'] },
  { name: 'super_admin', label: 'Super admin', description: 'Full access to everything, including the admin console.', isSystem: true,
    permissions: [...PERMISSION_KEYS] },
]

// Small in-process cache so permission checks do not hit the DB on every request.
let cache: { at: number; roles: Map<string, string[]> } | null = null
const TTL = 30_000

export function invalidateRoleCache() { cache = null }

export async function loadRoleMap(): Promise<Map<string, string[]>> {
  if (cache && Date.now() - cache.at < TTL) return cache.roles
  const rows = await prisma.role.findMany({ select: { name: true, permissions: true } })
  const roles = new Map<string, string[]>()
  if (rows.length === 0) DEFAULT_ROLES.forEach(r => roles.set(r.name, r.permissions))
  else rows.forEach(r => roles.set(r.name, r.permissions))
  cache = { at: Date.now(), roles }
  return roles
}

export async function permissionsForRole(role: string | null | undefined): Promise<Permission[]> {
  if (isSuperAdmin(role)) return [...PERMISSION_KEYS]
  const map = await loadRoleMap()
  return (map.get(role ?? 'user') ?? map.get('user') ?? []) as Permission[]
}

export async function roleHas(role: string | null | undefined, permission: Permission) {
  if (isSuperAdmin(role)) return true
  const perms = await permissionsForRole(role)
  return perms.includes(permission)
}

/** Returns the session when the current user holds `permission`, otherwise null. Use in pages & API routes. */
export async function requirePermission(permission: Permission) {
  const session = await auth()
  if (!session?.user?.id) return null
  return (await roleHas(session.user.role, permission)) ? session : null
}

/** True when `name` is a role that exists in the Role table (or the built-in defaults when the table is empty). */
export async function isValidRole(name: unknown): Promise<boolean> {
  if (typeof name !== 'string' || !name) return false
  const map = await loadRoleMap()
  return map.has(name)
}

/** Ensure the default roles exist (idempotent; never overwrites admin-edited permissions). */
/** Permissions introduced after the initial release: appended to existing default roles on startup (never removed). */
const LATE_PERMISSIONS: Permission[] = ['training.internal', 'training.manage', 'media.manage']

export async function ensureDefaultRoles() {
  for (const r of DEFAULT_ROLES) {
    const existing = await prisma.role.findUnique({ where: { name: r.name } })
    if (!existing) {
      await prisma.role.create({ data: { name: r.name, label: r.label, description: r.description, permissions: r.permissions, isSystem: r.isSystem } })
      continue
    }
    const missing = r.permissions.filter(p => LATE_PERMISSIONS.includes(p) && !existing.permissions.includes(p))
    if (missing.length) {
      await prisma.role.update({ where: { name: r.name }, data: { permissions: [...existing.permissions, ...missing] } })
    }
  }
  invalidateRoleCache()
}
