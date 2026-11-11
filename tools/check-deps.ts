/**
 * Enforces the layering rule between the three source folders: `shared` is pure (no DOM, no Node, no
 * three.js, nothing from the other folders), `server` never sees `client` or three.js, and `client`
 * never sees `server`. Run with `npm run check:deps`; exits non-zero and lists every violation.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

type Layer = 'shared' | 'server' | 'client';

/** What each layer may NOT import (alias prefixes or package names). */
const FORBIDDEN: Record<Layer, readonly string[]> = {
  shared: ['@client/', '@server/', 'three', 'ws', 'node:'],
  server: ['@client/', 'three'],
  client: ['@server/', 'ws', 'node:'],
};

/** Lists every .ts file under a directory. */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = path.join(dir, e);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const problems: string[] = [];
for (const layer of Object.keys(FORBIDDEN) as Layer[]) {
  const root = path.join('src', layer);
  for (const file of walk(root)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/(?:from\s+|import\s+|import\()['"]([^'"]+)['"]/g)) {
      const spec = m[1]!;
      const bad = FORBIDDEN[layer].some((f) => (f.endsWith('/') || f === 'node:' ? spec.startsWith(f) : spec === f || spec.startsWith(`${f}/`)));
      // A relative import that climbs out of the layer is also a violation.
      const escapes = spec.startsWith('.') && path.relative(root, path.resolve(path.dirname(file), spec)).startsWith('..');
      if (bad || escapes) problems.push(`${file}: ${layer} must not import "${spec}"`);
    }
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('check:deps OK');
