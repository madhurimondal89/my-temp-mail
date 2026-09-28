const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

function handleRequest(req, res) {
  // Global CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);

  // --- Transparent API Proxy to bypass Browser CORS ---
  if (parsedUrl.pathname === '/proxy') {
    const targetUrlStr = parsedUrl.query.url;
    if (!targetUrlStr) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing url parameter');
      return;
    }

    try {
      const targetParsed = url.parse(targetUrlStr);
      const isHttps = targetParsed.protocol === 'https:';
      const client = isHttps ? https : http;

      const proxyHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': req.headers['accept'] || 'application/json'
      };

      if (req.headers['authorization']) proxyHeaders['Authorization'] = req.headers['authorization'];
      if (req.headers['content-type']) proxyHeaders['Content-Type'] = req.headers['content-type'];

      const proxyReq = client.request({
        protocol: targetParsed.protocol,
        hostname: targetParsed.hostname,
        port: targetParsed.port || (isHttps ? 443 : 80),
        path: targetParsed.path,
        method: req.method,
        headers: proxyHeaders
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, {
          'Content-Type': proxyRes.headers['content-type'] || 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (err) => {
        console.error('Proxy request error:', err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Proxy Gateway Error', message: err.message }));
      });

      req.pipe(proxyReq);
      return;
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Proxy exception: ${err.message}`);
      return;
    }
  }

  // --- Static Files Serving ---
  let reqPath = decodeURI(parsedUrl.pathname);
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, reqPath);

  // Security: prevent directory traversal outside PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

const server = http.createServer(handleRequest);
const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`\n🚀 MyTempMails server running with Built-in Proxy at: http://${HOST}:${PORT}`);
  console.log(`Press Ctrl+C to stop.\n`);
});

// Also listen on Port 80 for reverse proxies (like Coolify Traefik default)
if (PORT !== 80) {
  try {
    const server80 = http.createServer(handleRequest);
    server80.listen(80, HOST, () => {
      console.log(`🚀 Also listening on port 80 (http://${HOST}:80) for reverse proxy\n`);
    });
    server80.on('error', (err) => {
      console.log(`Notice: Port 80 listener (${err.message})`);
    });
  } catch (err) {
    console.log(`Port 80 catch: ${err.message}`);
  }
}
