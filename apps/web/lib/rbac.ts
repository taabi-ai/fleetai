/**
 * apps/web/lib/rbac.ts — client-safe permission helper.
 *
 * The legacy server-side role/permission logic now lives in the identity
 * service and the gateway; pages here check against the session's expanded
 * `perms` array (populated at login).
 */

export type SessionLike = { user?: { perms?: string[]; role?: string } } | null;

export function sessionHas(session: SessionLike, permission: string): boolean {
  if (session?.user?.role === 'super_admin') return true;
  return (session?.user?.perms ?? []).includes(permission);
}

/** Legacy-style guard for server components: returns session when it holds the permission. */
export async function requirePermission(permission: string) {
  const { auth } = await import('@/auth');
  const session = await auth();
  if (!session?.user?.id) return null;
  return sessionHas(session, permission) ? session : null;
}
