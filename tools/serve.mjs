// Server statis lokal (hanya 127.0.0.1), tanpa dependensi: node tools/serve.mjs . 8080
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = process.argv[2], port = +process.argv[3] || 8080;
const T = {'.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm'};
http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.resolve(root, '.' + p);
  if (!f.startsWith(path.resolve(root))) { r.writeHead(403); return r.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { r.writeHead(404); return r.end('404'); }
    r.writeHead(200, {'content-type': T[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store'}); r.end(d);
  });
}).listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:' + port));
