import { auth } from '@/auth'

export const SUPER_ADMIN = 'super_admin'
export const ROLES = ['user', 'manager', 'super_admin'] as const
export type Role = (typeof ROLES)[number]

export function isSuperAdmin(role?: string | null) {
  return role === SUPER_ADMIN
}

/** Returns the session if the current user is a super admin, otherwise null. */
export async function requireSuperAdmin() {
  const session = await auth()
  if (!session?.user?.id || !isSuperAdmin(session.user.role)) return null
  return session
}
