/**
 * Minimal static file server for the built client (`dist/`), with path-traversal protection.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.map': 'application/json',
};

/**
 * Serves a file from `root`, falling back to `index.html` for unknown paths.
 * @param root - Absolute directory to serve from.
 * @param urlPath - Request path without the query string.
 * @param res - Response to write to.
 */
export function serveStatic(root: string, urlPath: string, res: ServerResponse): void {
  let rel: string;
  try {
    rel = normalize(decodeURIComponent(urlPath));
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  let file = resolve(join(root, rel));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Client not built yet. Run "npm run build" first (or use "npm run dev").');
    return;
  }
  const hashed = file.includes(`${sep}assets${sep}`);
  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}
