const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Exactly ONE single PORT and HOST declaration (Task 2)
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.resolve(__dirname);

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

  let parsedUrl;
  try {
    parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Malformed request URL' }));
    return;
  }

  // --- Health Check Endpoint (Task 5) ---
  if (parsedUrl.pathname === '/health') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // --- Favicon Handling (Task 9) ---
  if (parsedUrl.pathname === '/favicon.ico') {
    const icoPath = path.join(PUBLIC_DIR, 'favicon.ico');
    if (fs.existsSync(icoPath)) {
      res.writeHead(200, { 'Content-Type': 'image/x-icon' });
      fs.createReadStream(icoPath).pipe(res);
      return;
    }
    const svgPath = path.join(PUBLIC_DIR, 'favicon.svg');
    if (fs.existsSync(svgPath)) {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      fs.createReadStream(svgPath).pipe(res);
      return;
    }
    res.writeHead(204);
    res.end();
    return;
  }

  // --- Transparent API Proxy to bypass Browser CORS (Tasks 8, 10, 13) ---
  if (parsedUrl.pathname === '/proxy') {
    const targetUrlStr = parsedUrl.searchParams.get('url');
    if (!targetUrlStr) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing url parameter' }));
      return;
    }

    try {
      const targetParsed = new URL(targetUrlStr);
      if (targetParsed.protocol !== 'http:' && targetParsed.protocol !== 'https:') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Only HTTP and HTTPS protocols are supported' }));
        return;
      }

      // SSRF protection: block loopback and cloud metadata
      const hostnameLower = (targetParsed.hostname || '').toLowerCase();
      if (['localhost', '127.0.0.1', '0.0.0.0', '::1', '169.254.169.254'].includes(hostnameLower)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden target host' }));
        return;
      }

      const isHttps = targetParsed.protocol === 'https:';
      const client = isHttps ? https : http;

      const proxyHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': req.headers['accept'] || 'application/json'
      };

      if (req.headers['authorization']) proxyHeaders['Authorization'] = req.headers['authorization'];
      if (req.headers['content-type']) proxyHeaders['Content-Type'] = req.headers['content-type'];

      const targetPath = targetParsed.pathname + targetParsed.search;

      const proxyReq = client.request({
        protocol: targetParsed.protocol,
        hostname: targetParsed.hostname,
        port: targetParsed.port || (isHttps ? 443 : 80),
        path: targetPath,
        method: req.method,
        headers: proxyHeaders,
        timeout: 12000 // 12 second timeout
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, {
          'Content-Type': proxyRes.headers['content-type'] || 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        proxyRes.pipe(res);
      });

      proxyReq.on('timeout', () => {
        proxyReq.destroy(new Error('Proxy request timed out'));
      });

      proxyReq.on('error', (err) => {
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Proxy Gateway Error', message: err.message }));
        }
      });

      req.pipe(proxyReq);
      return;
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Proxy Exception', message: err.message }));
      }
      return;
    }
  }

  // --- Static Files Serving (Task 9 & Task 13) ---
  let reqPath = decodeURI(parsedUrl.pathname);
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const safeReqPath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safeReqPath);
  const resolvedPath = path.resolve(filePath);

  // Security: prevent directory traversal outside PUBLIC_DIR
  if (!resolvedPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(resolvedPath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });

    const stream = fs.createReadStream(resolvedPath);
    stream.on('error', (streamErr) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
      }
    });
    stream.pipe(res);
  });
}

// Application HTTP server listener
const server = http.createServer(handleRequest);

server.on('error', (err) => {
  console.error('Primary server error:', err.message);
});

server.listen(PORT, HOST, () => {
  // Startup Diagnostics (Task 6)
  console.log('==================================================');
  console.log('MyTempMails starting...');
  console.log(`Node.js version : ${process.version}`);
  console.log(`Environment     : ${process.env.NODE_ENV || 'production'}`);
  console.log(`Listening on    : ${HOST}:${PORT}`);
  console.log(`Server URL      : http://${HOST}:${PORT}`);
  console.log(`Health endpoint : http://${HOST}:${PORT}/health`);
  console.log('==================================================');
});

// Dual-port listener for reverse proxies (e.g. Coolify / Traefik routing to 80 or 3000)
let serverAlt = null;
const ALT_PORT = PORT === 80 ? 3000 : 80;

try {
  serverAlt = http.createServer(handleRequest);
  // Attach error handler BEFORE listen to guarantee no crash if port 80 requires root / is restricted
  serverAlt.on('error', (err) => {
    console.log(`Notice: Alternative port ${ALT_PORT} listener inactive (${err.message}). Primary port ${PORT} active.`);
    serverAlt = null;
  });
  serverAlt.listen(ALT_PORT, HOST, () => {
    console.log(`🚀 Also listening on reverse proxy port ${ALT_PORT} (http://${HOST}:${ALT_PORT})`);
  });
} catch (err) {
  console.log(`Notice: Could not bind alternative port ${ALT_PORT}: ${err.message}`);
  serverAlt = null;
}

// Graceful Shutdown (Task 7)
let isShuttingDown = false;

function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\nReceived ${signal}. Gracefully shutting down MyTempMails server...`);

  let closedCount = 0;
  const totalServers = serverAlt ? 2 : 1;

  function onClosed() {
    closedCount++;
    if (closedCount >= totalServers) {
      console.log('All HTTP server listeners closed cleanly. Exiting.');
      process.exit(0);
    }
  }

  server.close((err) => {
    if (err) console.error('Error closing primary server:', err);
    onClosed();
  });

  if (serverAlt) {
    serverAlt.close((err) => {
      if (err) console.error('Error closing alt server:', err);
      onClosed();
    });
  }

  // Force shutdown after 5 seconds if connections linger
  setTimeout(() => {
    console.error('Forced shutdown due to timeout.');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
