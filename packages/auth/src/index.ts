/**
 * @fleetai/auth — JWT/JWKS verification, permission catalog, internal header signing.
 *
 * Permission strings are FROZEN (see AGENTS.md rule 8). Super admins implicitly
 * hold every permission. The catalog is ported from legacy `lib/rbac.ts`.
 */

import type { Principal } from '@fleetai/contracts';

// ---------------------------------------------------------------------------
// Permission catalog (FROZEN — do not rename)
// ---------------------------------------------------------------------------

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
] as const;

export type Permission = (typeof PERMISSIONS)[number]['key'];
export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key) as Permission[];

export type RoleDef = { name: string; label: string; description: string; permissions: Permission[]; isSystem: boolean };

export const DEFAULT_ROLES: RoleDef[] = [
  { name: 'user', label: 'User', description: 'Default role for self-registered accounts.', isSystem: true,
    permissions: ['dashboards.view', 'dashboards.edit', 'dashboards.publish', 'dashboards.collaborate', 'ai.use', 'library.publish'] },
  { name: 'manager', label: 'Manager', description: 'Team lead.', isSystem: true,
    permissions: ['dashboards.view', 'dashboards.edit', 'dashboards.publish', 'dashboards.collaborate', 'ai.use', 'library.publish', 'crm.view', 'dora.view', 'training.internal'] },
  { name: 'sales', label: 'Sales / KAM', description: 'Sales, key-account and marketing staff.', isSystem: false,
    permissions: ['dashboards.view', 'dashboards.edit', 'dashboards.collaborate', 'ai.use', 'crm.view', 'training.internal'] },
  { name: 'crm_manager', label: 'CRM manager', description: 'Owns CRM sources and sales scorecards.', isSystem: false,
    permissions: ['dashboards.view', 'dashboards.edit', 'dashboards.publish', 'dashboards.collaborate', 'ai.use', 'library.publish', 'crm.view', 'crm.manage', 'training.internal'] },
  { name: 'engineer', label: 'Engineer', description: 'Engineering team.', isSystem: false,
    permissions: ['dashboards.view', 'dashboards.edit', 'dashboards.collaborate', 'ai.use', 'dora.view', 'training.internal'] },
  { name: 'eng_manager', label: 'Engineering manager', description: 'Owns engineering integrations and DORA telemetry.', isSystem: false,
    permissions: ['dashboards.view', 'dashboards.edit', 'dashboards.publish', 'dashboards.collaborate', 'ai.use', 'library.publish', 'dora.view', 'dora.manage', 'training.internal'] },
  { name: 'super_admin', label: 'Super admin', description: 'Full access to everything.', isSystem: true, permissions: [...PERMISSION_KEYS] },
];

export const SUPER_ADMIN_ROLES = ['super_admin'];
export function isSuperAdmin(role: string | null | undefined): boolean {
  return !!role && SUPER_ADMIN_ROLES.includes(role);
}

export function permissionsForRoleName(role: string | null | undefined, roleMap: Map<string, string[]>): Permission[] {
  if (isSuperAdmin(role)) return [...PERMISSION_KEYS];
  return (roleMap.get(role ?? 'user') ?? roleMap.get('user') ?? []) as Permission[];
}

export function roleHas(role: string | null | undefined, permission: Permission, roleMap: Map<string, string[]>): boolean {
  if (isSuperAdmin(role)) return true;
  return permissionsForRoleName(role, roleMap).includes(permission);
}

// ---------------------------------------------------------------------------
// JWT verification (RS256 via jose, JWKS)
// ---------------------------------------------------------------------------

import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface JwtClaims {
  sub: string;
  email?: string;
  name?: string;
  role?: string;
  perms?: string[];
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
  aiPinVerified?: boolean;
}

export interface JwtVerifier {
  verify(token: string): Promise<Principal> | Promise<JwtClaims>;
}

export function createJwksVerifier(jwksUrl: string, audience = 'fleetai', issuer = 'fleetai-identity'): JwtVerifier {
  const jwks = createRemoteJWKSet(new URL(jwksUrl));
  return {
    async verify(token: string): Promise<JwtClaims> {
      try {
        const { payload } = await jwtVerify(token, jwks, { audience, issuer });
        return payload as unknown as JwtClaims;
      } catch (err) {
        throw new Error(`JWT verification failed: ${(err as Error).message}`);
      }
    },
  };
}

export function principalFromClaims(claims: JwtClaims): Principal {
  return {
    sub: claims.sub,
    email: claims.email,
    name: claims.name,
    role: claims.role ?? 'user',
    perms: claims.perms ?? [],
    aiPinVerified: claims.aiPinVerified,
  };
}

// ---------------------------------------------------------------------------
// Internal-call HMAC header signing (x-fleetai-internal)
// ---------------------------------------------------------------------------

import { createHmac, timingSafeEqual } from 'node:crypto';

export const INTERNAL_HEADER = 'x-fleetai-internal';
export const PRINCIPAL_HEADER = 'x-fleetai-principal';

export function signInternalHeader(secret: string, method: string, path: string, body?: unknown): string {
  const payload = [method.toUpperCase(), path, body ? JSON.stringify(body) : ''].join('|');
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyInternalHeader(secret: string, header: string | undefined, method: string, path: string, body?: unknown): boolean {
  if (!header) return false;
  const expected = signInternalHeader(secret, method, path, body);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(header, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
