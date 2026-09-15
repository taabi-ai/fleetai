import { prisma } from '@/lib/db'

/**
 * Integration registry. Each integration stores a JSON `config`; fields marked `secret` are never
 * returned to the browser (only a `has<Field>` flag) and are kept when the form is saved blank.
 */
export type IntegrationField = { key: string; label: string; placeholder?: string; hint?: string; secret?: boolean; required?: boolean }
export type IntegrationDef = { key: string; name: string; group: 'Observability' | 'Engineering' | 'Sales & CRM'; description: string; docs: string; fields: IntegrationField[]; testable: boolean }

export const INTEGRATIONS: IntegrationDef[] = [
  {
    key: 'new_relic',
    name: 'New Relic Browser (RUM)',
    group: 'Observability',
    description: 'Injects the New Relic browser agent on every page so page views, Core Web Vitals, JS errors and AJAX calls are reported to your New Relic account. Values come from New Relic → Browser → your app → Application settings → copy/paste snippet.',
    docs: 'https://docs.newrelic.com/docs/browser/browser-monitoring/installation/install-browser-monitoring-agent/',
    testable: false,
    fields: [
      { key: 'accountID', label: 'Account ID', required: true, placeholder: '1234567' },
      { key: 'applicationID', label: 'Application ID', required: true, placeholder: '987654321' },
      { key: 'agentID', label: 'Agent ID', placeholder: 'usually equal to the Application ID' },
      { key: 'trustKey', label: 'Trust key', placeholder: 'usually equal to the Account ID' },
      { key: 'licenseKey', label: 'Browser license key', required: true, secret: true, placeholder: 'NRJS-…' },
      { key: 'beacon', label: 'Beacon host', placeholder: 'bam.nr-data.net (US) or bam.eu01.nr-data.net (EU)' },
      { key: 'appName', label: 'Application name (label only)', placeholder: 'FleetAI Dash' },
    ],
  },
  {
    key: 'plane',
    name: 'Plane.so (plane.taabi.co)',
    group: 'Engineering',
    description: 'Work-item source for lead time, throughput and cycle reporting on the DORA page. Create a personal API token in Plane → Profile settings → API tokens.',
    docs: 'https://developers.plane.so/api-reference/introduction',
    testable: true,
    fields: [
      { key: 'baseUrl', label: 'Base URL', required: true, placeholder: 'https://plane.taabi.co' },
      { key: 'workspaceSlug', label: 'Workspace slug', required: true, placeholder: 'taabi' },
      { key: 'apiKey', label: 'API token (X-API-Key)', required: true, secret: true, placeholder: 'plane_api_…' },
      { key: 'projectIds', label: 'Project IDs (comma separated, blank = all)', placeholder: 'uuid, uuid' },
    ],
  },
  {
    key: 'jira',
    name: 'Jira Cloud (legacy)',
    group: 'Engineering',
    description: 'Kept for the migration period. Uses basic auth with an Atlassian API token.',
    docs: 'https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/',
    testable: true,
    fields: [
      { key: 'baseUrl', label: 'Site URL', required: true, placeholder: 'https://your-org.atlassian.net' },
      { key: 'email', label: 'Account email', required: true, placeholder: 'you@taabi.ai' },
      { key: 'apiToken', label: 'API token', required: true, secret: true },
      { key: 'jql', label: 'Default JQL', placeholder: 'project = FLEET AND statusCategory = Done' },
    ],
  },
  {
    key: 'dora_webhook',
    name: 'DORA telemetry webhook',
    group: 'Engineering',
    description: 'CI/CD and monitoring systems POST deployment / incident events to /api/dora/events with header `x-dora-token`. Deployment frequency, change-failure rate and MTTR are computed from these events.',
    docs: '/DEPLOYMENT.md',
    testable: false,
    fields: [
      { key: 'token', label: 'Shared webhook token', required: true, secret: true, hint: 'Generate with `openssl rand -hex 24` and add it as a CI secret.' },
    ],
  },
  {
    key: 'crm',
    name: 'Taabi CRM (crm.taabi.ai)',
    group: 'Sales & CRM',
    description: 'REST access to the CRM for leads, accounts, KAM / sales-person ownership and onboarding status. Prefer registering the CRM MCP server under MCP servers (category “crm”) once it exists; this REST config is the fallback.',
    docs: 'https://crm.taabi.ai',
    testable: true,
    fields: [
      { key: 'baseUrl', label: 'API base URL', required: true, placeholder: 'https://crm.taabi.ai/api' },
      { key: 'apiKey', label: 'API key / bearer token', required: true, secret: true },
      { key: 'healthPath', label: 'Health / ping path (used by “Test connection”)', placeholder: '/health' },
    ],
  },
]

export function integrationDef(key: string) { return INTEGRATIONS.find(i => i.key === key) ?? null }

export type IntegrationConfig = Record<string, string>

export async function getIntegration(key: string): Promise<{ enabled: boolean; config: IntegrationConfig } | null> {
  const row = await prisma.integrationSetting.findUnique({ where: { key } })
  if (!row) return null
  return { enabled: row.enabled, config: (row.config as IntegrationConfig) ?? {} }
}

/** Strip secret fields for the browser. */
export function publicView(def: IntegrationDef, row: { enabled: boolean; config: IntegrationConfig; updatedAt?: Date } | null) {
  const cfg: Record<string, string | boolean> = {}
  for (const f of def.fields) {
    if (f.secret) cfg[`has_${f.key}`] = !!row?.config?.[f.key]
    else cfg[f.key] = row?.config?.[f.key] ?? ''
  }
  return { key: def.key, enabled: row?.enabled ?? false, config: cfg, updatedAt: row?.updatedAt ?? null }
}

/** Merge a browser submission into the stored config, keeping secrets when the field is blank. */
export function mergeConfig(def: IntegrationDef, existing: IntegrationConfig, incoming: Record<string, unknown>): IntegrationConfig {
  const out: IntegrationConfig = { ...existing }
  for (const f of def.fields) {
    const v = incoming[f.key]
    if (typeof v !== 'string') continue
    const trimmed = v.trim()
    if (f.secret && trimmed === '') continue
    if (trimmed === '') delete out[f.key]
    else out[f.key] = trimmed
  }
  return out
}

/** Live connectivity test for the integrations that support it. Never returns secrets. */
export async function testIntegration(key: string, config: IntegrationConfig): Promise<{ ok: boolean; message: string }> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 10_000)
  try {
    if (key === 'plane') {
      const base = (config.baseUrl ?? '').replace(/\/$/, '')
      const res = await fetch(`${base}/api/v1/workspaces/${encodeURIComponent(config.workspaceSlug ?? '')}/projects/`, {
        headers: { 'X-API-Key': config.apiKey ?? '', Accept: 'application/json' }, signal: ctl.signal, cache: 'no-store',
      })
      if (!res.ok) return { ok: false, message: `Plane responded ${res.status} ${res.statusText}` }
      const data = await res.json().catch(() => ({}))
      const n = Array.isArray(data?.results) ? data.results.length : Array.isArray(data) ? data.length : 0
      return { ok: true, message: `Connected. ${n} project(s) visible in workspace “${config.workspaceSlug}”.` }
    }
    if (key === 'jira') {
      const base = (config.baseUrl ?? '').replace(/\/$/, '')
      const basic = Buffer.from(`${config.email ?? ''}:${config.apiToken ?? ''}`).toString('base64')
      const res = await fetch(`${base}/rest/api/3/myself`, { headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' }, signal: ctl.signal, cache: 'no-store' })
      if (!res.ok) return { ok: false, message: `Jira responded ${res.status} ${res.statusText}` }
      const me = await res.json().catch(() => ({}))
      return { ok: true, message: `Connected as ${me?.displayName ?? config.email}.` }
    }
    if (key === 'crm') {
      const base = (config.baseUrl ?? '').replace(/\/$/, '')
      const res = await fetch(`${base}${config.healthPath || '/health'}`, { headers: { Authorization: `Bearer ${config.apiKey ?? ''}`, Accept: 'application/json' }, signal: ctl.signal, cache: 'no-store' })
      return res.ok ? { ok: true, message: `CRM responded ${res.status}.` } : { ok: false, message: `CRM responded ${res.status} ${res.statusText}` }
    }
    return { ok: false, message: 'This integration has no connectivity test.' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Connection failed' }
  } finally {
    clearTimeout(timer)
  }
}
