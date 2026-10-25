// Mali statički poslužitelj za lokalno testiranje aplikacije (docs/).
// node alati/posluzi.js [port]
const http = require('http');
const fs = require('fs');
const path = require('path');

const KORIJEN = path.join(__dirname, '..', 'docs');
const PORT = +process.argv[2] || 5173;
const TIPOVI = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(KORIJEN, path.normalize(p));
  if (!f.startsWith(KORIJEN)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': TIPOVI[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`http://localhost:${PORT}`));
