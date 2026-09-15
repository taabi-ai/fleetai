/**
 * @fleetai/contracts — Shared HTTP/DTO contracts.
 *
 * Start with shared DTOs only: ErrorResponse, Pagination, Principal, WidgetConfig.
 * Service-specific DTOs are added by each service prompt.
 */

import { z } from 'zod';
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

// ---------------------------------------------------------------------------
// Shared DTOs
// ---------------------------------------------------------------------------

export const ErrorResponseSchema = z.object({
  type: z.string().url().describe('RFC 9457 error type URI'),
  title: z.string().describe('Short human-readable error title'),
  status: z.number().int().describe('HTTP status code'),
  detail: z.string().optional().describe('Human-readable detail'),
  instance: z.string().optional().describe('Request instance URI'),
  traceId: z.string().optional().describe('Correlation trace id'),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const PaginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).default(0),
});
export type Pagination = z.infer<typeof PaginationSchema>;

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number().int().min(0),
    limit: z.number().int(),
    offset: z.number().int(),
  });

export const PrincipalSchema = z.object({
  sub: z.string().describe('User id'),
  email: z.string().email().optional(),
  name: z.string().optional(),
  role: z.string(),
  perms: z.array(z.string()).describe('Expanded permission strings'),
  aiPinVerified: z.boolean().optional().describe('Short-lived AI PIN verification claim'),
});
export type Principal = z.infer<typeof PrincipalSchema>;

// ---------------------------------------------------------------------------
// Widget contract (FROZEN — see AGENTS.md rule 9)
//
// The legacy UI persists these exact keys. Do NOT add required fields and
// never rename an existing key. v1.1 added `markerStyle`, `animate` and
// `code` (custom widgets) — all optional.
// ---------------------------------------------------------------------------

export const WidgetTypeSchema = z.enum([
  'kpi_card',
  'line_chart',
  'bar_chart',
  'pie_chart',
  'area_chart',
  'table',
  'map',
  'weather',
  'gauge',
  'custom', // v1.1: self-contained HTML/CSS/JS in `code`
]);

export const DATA_SOURCE_LABELS = ['fleet', 'tms', 'adas', 'fuel', 'ev', 'weather', 'crm', 'dora', 'training'] as const;
export const DataSourceSchema = z.enum(DATA_SOURCE_LABELS);

export const COLOR_SCHEMES = ['green', 'blue', 'orange', 'teal', 'purple', 'red', 'default', 'mono', 'warm', 'cool', 'ocean', 'sunset'] as const;
export const ColorSchemeSchema = z.enum(COLOR_SCHEMES);

/**
 * The frozen widget-config contract. Mirrors legacy
 * `app/api/dashboard/**` + `app/dashboard/_components/widget-renderer.tsx`.
 */
export const WidgetConfigSchema = z.object({
  type: WidgetTypeSchema,
  title: z.string(),
  dataSource: DataSourceSchema,
  metric: z.string(),
  params: z
    .object({
      days: z.number().int().min(1).max(365).optional(),
      city: z.string().optional(),
    })
    .optional()
    .default({}),
  colorScheme: ColorSchemeSchema.optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  refreshSec: z.number().int().min(5).max(3600).optional(),
  mcpServerId: z.string().optional(),
  mcpServerName: z.string().optional(),
  mcpServerLink: z.string().url().optional(),
  // v1.1 additions — custom code widgets and map options
  markerStyle: z
    .object({
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      pulse: z.boolean().optional(),
      icon: z.string().optional(),
    })
    .optional(),
  animate: z.boolean().optional(),
  code: z
    .string()
    .optional()
    .describe('Self-contained HTML/CSS/JS for custom widgets (opaque, never executed server-side)'),
});
export type WidgetConfig = z.infer<typeof WidgetConfigSchema>;

export const GridPosSchema = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
export type GridPos = z.infer<typeof GridPosSchema>;

export const PresetWidgetSchema = z.object({
  widgetConfig: WidgetConfigSchema,
  gridPos: GridPosSchema,
});

export const WidgetDataRequestSchema = z.object({
  widgetId: z.string().optional(),
  config: WidgetConfigSchema,
});
export type WidgetDataRequest = z.infer<typeof WidgetDataRequestSchema>;

// ---------------------------------------------------------------------------
// OpenAPI registry helper
// ---------------------------------------------------------------------------

export function buildOpenApi(serviceName: string, schemas: Record<string, z.ZodTypeAny>) {
  const registry = new OpenAPIRegistry();
  const all = { ErrorResponse: ErrorResponseSchema, Principal: PrincipalSchema, WidgetConfig: WidgetConfigSchema, ...schemas };
  registry.register('Schema', all as never);
  return registry;
}
