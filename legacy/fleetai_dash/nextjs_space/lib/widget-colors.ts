// Shared colour helpers for dashboard widgets.
// Keeps a single source of truth for named schemes, the default multi-item
// palette, and generating a themed palette from a base colour.

export const NAMED_SCHEMES: Record<string, string> = {
  blue: '#3B82F6',
  green: '#10B981',
  orange: '#F59E0B',
  purple: '#6366F1',
  red: '#EF4444',
  teal: '#14B8A6',
}

export const DEFAULT_PALETTE = [
  '#6366F1', '#10B981', '#F59E0B', '#EF4444',
  '#3B82F6', '#14B8A6', '#EC4899', '#8B5CF6',
]

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function isHex(v: unknown): v is string {
  return typeof v === 'string' && HEX_RE.test(v)
}

/** Resolve a colorScheme (named key or hex) to a concrete hex value. */
export function resolveColor(colorScheme?: string, fallback = '#6366F1'): string {
  if (!colorScheme) return fallback
  if (isHex(colorScheme)) return colorScheme
  return NAMED_SCHEMES[colorScheme] ?? fallback
}

/** Keep only valid hex strings from an arbitrary array. */
export function sanitizeColors(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined
  const out = input.filter(isHex) as string[]
  return out.length ? out : undefined
}

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d) % 6; break
      case g: h = (b - r) / d + 2; break
      default: h = (r - g) / d + 4
    }
    h *= 60
    if (h < 0) h += 360
  }
  return [h, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x } else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c } else { r = c; b = x }
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

/**
 * Build a palette of `count` distinguishable colours.
 * - explicit `colors` (per-item hex) always win by index.
 * - otherwise, if a colorScheme/base is given, produce a themed ramp
 *   (varying lightness + gentle hue shift) so slices/bars stay on-brand
 *   but remain distinguishable.
 * - otherwise fall back to the default categorical palette.
 */
export function buildPalette(
  count: number,
  opts: { colors?: string[]; colorScheme?: string } = {},
): string[] {
  const explicit = sanitizeColors(opts.colors) ?? []
  const hasBase = !!opts.colorScheme
  const base = hasBase ? resolveColor(opts.colorScheme) : undefined
  const result: string[] = []
  for (let i = 0; i < Math.max(0, count); i++) {
    if (explicit[i]) { result.push(explicit[i]); continue }
    if (base) {
      const [h, s, l] = hexToHsl(base)
      // Spread lightness across the series, nudge hue slightly for separation.
      const t = count > 1 ? i / (count - 1) : 0
      const light = Math.min(0.78, Math.max(0.34, l - 0.18 + t * 0.4))
      const hue = (h + (i * 12)) % 360
      const sat = Math.min(0.9, Math.max(0.35, s))
      result.push(hslToHex(hue, sat, light))
    } else {
      result.push(DEFAULT_PALETTE[i % DEFAULT_PALETTE.length])
    }
  }
  return result
}
