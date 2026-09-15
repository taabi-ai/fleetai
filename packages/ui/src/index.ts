/**
 * @fleetai/ui — Shared shadcn/ui components for apps.
 *
 * The web app will copy the legacy shadcn components (from
 * `legacy/fleetai_dash/nextjs_space/components/ui/**`) into this package during
 * prompt 11 (web frontend port). Until then this package exports a tiny helper
 * so it typechecks and builds.
 */

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
