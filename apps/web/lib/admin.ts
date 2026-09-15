/**
 * apps/web/lib/admin.ts — client-safe admin checks.
 *
 * Server-only admin logic was removed in the port; the web app derives
 * super-admin status from the session role (the gateway enforces the real
 * permission check server-side).
 */

export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === 'super_admin';
}
