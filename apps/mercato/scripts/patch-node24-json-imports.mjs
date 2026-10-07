// Patches bare JSON ESM imports in @open-mercato node_modules so they
// work on Node 24, which requires `with { type: 'json' }`.
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const files = [
  'node_modules/@open-mercato/shared/dist/lib/location/countries.js',
  'node_modules/@open-mercato/core/dist/modules/payment_gateways/i18n/en.js',
  'node_modules/@open-mercato/core/dist/modules/payment_gateways/i18n/pl.js',
  'node_modules/@open-mercato/core/dist/modules/workflows/lib/workflow-templates.js',
  'node_modules/@open-mercato/gateway-stripe/dist/modules/gateway_stripe/i18n/en.js',
  'node_modules/@open-mercato/gateway-stripe/dist/modules/gateway_stripe/i18n/pl.js',
  'node_modules/@open-mercato/sync-akeneo/dist/modules/sync_akeneo/i18n/en.js',
];

// Matches: import <name> from "<path>.json";  — no existing with/assert
const bare = /^(import\s+\w+\s+from\s+["'][^"']*\.json["'])(\s*;)/gm;

let patched = 0;
for (const rel of files) {
  const abs = join(root, rel);
  let content;
  try { content = readFileSync(abs, 'utf8'); } catch { console.log('skip (not found):', rel); continue; }
  const fixed = content.replace(bare, (m, imp, tail) => {
    if (m.includes(' with ') || m.includes(' assert ')) return m;
    return imp + " with { type: 'json' }" + tail;
  });
  if (fixed !== content) {
    writeFileSync(abs, fixed, 'utf8');
    console.log('patched:', rel);
    patched++;
  } else {
    console.log('already ok:', rel);
  }
}
console.log('patch-node24-json-imports: done,', patched, 'file(s) patched');
