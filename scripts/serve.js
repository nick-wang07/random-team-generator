// Static server for local development.
//
// Sends Cache-Control: no-store on everything. Chrome will otherwise hold on
// to styles.css across reloads — including reloads of a page URL carrying a
// fresh ?v= query, because that query does not change the stylesheet's own
// URL — and you edit CSS, reload, and see the previous version.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname: on Windows the latter yields "/C:/Users/..."
// with forward slashes, which never matches the backslash paths join() builds,
// so the containment check below rejected every request with a 403.
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.argv[2] ?? 8777);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // normalize collapses any ../ before it can climb out of the project.
  const file = resolve(join(root, path === '/' ? '/index.html' : path));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
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

server.listen(port, () => console.log(`Team Generator on http://localhost:${port}`));

// A plain `throw` here printed an unhandled 'error' event and a stack trace,
// which says nothing about what to do next.
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

// Shut down on a signal so the port is released rather than held by a process
// that outlives the console it was started from.
//
// closeAllConnections() covers a request that is still in flight when the
// signal lands: server.close() stops new connections and waits for the current
// ones, and an in-flight request would hold the process open. It is NOT needed
// for parked keep-alive sockets, despite the folklore — measured on Node 24,
// close() reaps idle connections on its own (Node 19+ behaviour) and shutdown
// takes ~5ms with or without this call.
//
// SIGINT covers Ctrl+C; SIGTERM covers a kill from a task runner or an editor
// stopping the task. Neither fires if the process is orphaned — killed without
// a signal, or left behind when its parent npm wrapper dies — which is the
// usual reason a stale server is still holding the port. Hence serve:who.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  });
}
