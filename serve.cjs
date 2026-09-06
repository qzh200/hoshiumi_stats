const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve('dist');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json'
};
http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p.endsWith('/')) p += 'index.html';
  let f = path.join(root, p);
  if (!f.startsWith(root)) { res.statusCode = 403; return res.end(); }
  fs.stat(f, (e, s) => {
    if (e || !s.isFile()) { res.statusCode = 404; res.end('not found: ' + p); return; }
    const ext = path.extname(f);
    res.setHeader('content-type', types[ext] || 'application/octet-stream');
    fs.createReadStream(f).pipe(res);
  });
}).listen(4322, '127.0.0.1', () => console.log('serve on 4322'));
