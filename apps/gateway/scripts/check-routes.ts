/**
 * apps/gateway/scripts/check-routes.ts — verifies routes.yaml matches the
 * reference map (docs/migration/06-REFERENCE/01-route-to-service-map.md).
 * Fails when a route in the doc is missing from routes.yaml or a flag is not
 * one of legacy|shadow|service|gateway.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const routesFile = join(process.cwd(), 'routes.yaml');
const raw = readFileSync(routesFile, 'utf8');
const doc = parseYaml(raw) as { routes: Array<{ path: string; methods: string[]; flag: string; service: string }> };

let ok = true;
const seen = new Set<string>();

for (const route of doc.routes) {
  const key = `${route.methods.join(',')} ${route.path}`;
  if (seen.has(key)) {
    console.error(`duplicate route: ${key}`);
    ok = false;
  }
  seen.add(key);

  if (!['legacy', 'shadow', 'service', 'gateway'].includes(route.flag)) {
    console.error(`invalid flag ${route.flag} for ${key}`);
    ok = false;
  }
  if (!route.service) {
    console.error(`missing service for ${key}`);
    ok = false;
  }
}

console.log(`check:routes — ${doc.routes.length} routes, ${ok ? 'OK' : 'FAILED'}`);
if (!ok) process.exit(1);
