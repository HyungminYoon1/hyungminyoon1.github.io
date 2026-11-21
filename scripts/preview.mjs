import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicFiles } from './public-files.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const allowed = new Set(publicFiles);
const port = Number(process.env.PORT || 4177);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port.');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

const server = http.createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }
  let name;
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    name = pathname.replace(/^\//, '');
    if (!name || name.endsWith('/')) name += 'index.html';
    if (name.includes('\\') || !allowed.has(name)) throw new Error('Not public');
  } catch {
    response.writeHead(404).end('Not found');
    return;
  }
  try {
    const body = await readFile(path.join(root, name));
    response.writeHead(200, { 'Content-Type': types[path.extname(name)] || 'text/plain; charset=utf-8' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(500).end('Run npm run build before starting preview.');
  }
});
server.on('error', (error) => {
  console.error(`Preview startup failed: ${error.code || 'unknown'}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`Local portfolio preview: http://127.0.0.1:${port}/`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
