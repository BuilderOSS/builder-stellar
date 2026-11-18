// Serves the static export (out/) the way a static host does: /a/b/ is out/a/b/index.html,
// and anything missing gets out/404.html with a 404. Usage: node scripts/serve.mjs [port]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'out');
const port = Number(process.argv[2] ?? process.env.PORT ?? 4321);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain'
};

function resolve(urlPath) {
  const clean = path.normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const file = path.join(root, clean);
  if (!file.startsWith(root)) return null;
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  const index = path.join(file, 'index.html');
  return fs.existsSync(index) ? index : null;
}

export function startServer(listenPort = port) {
  const server = http.createServer((req, res) => {
    const file = resolve(req.url ?? '/');
    const status = file ? 200 : 404;
    const body = file ?? path.join(root, '404.html');
    res.writeHead(status, { 'content-type': types[path.extname(body)] ?? 'application/octet-stream' });
    fs.createReadStream(body).pipe(res);
  });
  return new Promise((done) => server.listen(listenPort, () => done(server)));
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await startServer();
  console.info(`Docs on http://localhost:${port}`);
}
