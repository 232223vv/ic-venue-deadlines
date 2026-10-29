import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { refreshAndWrite } from './scripts/scrape.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

let refreshing = false;

function sendJson(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

async function serveStatic(res, urlPath) {
  const relative = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
  const target = path.resolve(ROOT, relative);
  if (!target.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    const info = await stat(target);
    if (!info.isFile()) throw new Error('not a file');
    const body = await readFile(target);
    res.writeHead(200, {
      'content-type': TYPES[path.extname(target)] || 'application/octet-stream',
      'cache-control': 'no-store'
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

  if (url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true, refreshing });
    return;
  }

  if (url.pathname === '/api/refresh' && req.method === 'POST') {
    if (refreshing) {
      sendJson(res, 409, { error: '已有一次抓取在进行中' });
      return;
    }
    refreshing = true;
    try {
      const result = await refreshAndWrite();
      sendJson(res, 200, {
        report: result.report,
        applied: result.applied,
        wrote: result.wrote,
        today: result.today,
        data: result.data
      });
    } catch (err) {
      sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
    } finally {
      refreshing = false;
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/refresh') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }

  await serveStatic(res, url.pathname);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`投稿日历:http://127.0.0.1:${PORT}/  (Ctrl+C 停止)`);
});
