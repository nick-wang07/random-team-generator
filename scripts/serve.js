// Static server for local development. Sends Cache-Control: no-store so an
// edited styles.css is never served stale from Chrome's cache.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicPath } from './public-path.js';

// fileURLToPath, not URL.pathname, which gives "/C:/..." on Windows.
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.argv[2] ?? 8777);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
};

const server = createServer(async (req, res) => {
  const { status, rel } = publicPath(req.url);
  if (status !== 200) {
    res.writeHead(status).end(status === 400 ? 'Bad request' : 'Not found');
    return;
  }
  const file = join(root, rel);
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    }).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

// Loopback only: nothing else on the network can reach it.
server.listen(port, '127.0.0.1', () => {
  // The real port, which differs from `port` when started with 0 (as the tests do).
  console.log(`Team Generator on http://localhost:${server.address().port}`);
});

// Say what to do about a taken port instead of throwing.
server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(
    `Port ${port} is already in use — most likely an earlier server that did ` +
    `not shut down.
` +
    `  Find it:  npm run serve:who
` +
    `  Or pick another port:  npm start -- 8778`
  );
  process.exit(1);
});

// Release the port on Ctrl+C or a kill. closeAllConnections() stops an
// in-flight request from holding the process open. An orphaned process gets
// neither signal, which is what `npm run serve:who` is for.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  });
}
