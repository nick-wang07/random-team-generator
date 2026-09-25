import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { publicPath } from '../scripts/public-path.js';

test('the app files are public', () => {
  for (const [url, rel] of [
    ['/', 'index.html'],
    ['/index.html', 'index.html'],
    ['/styles.css', 'styles.css'],
    ['/favicon.png', 'favicon.png'],
    ['/src/app.js', 'src/app.js'],
    ['/src/run-view.js?v=2', 'src/run-view.js'],
  ]) {
    assert.deepEqual(publicPath(url), { status: 200, rel }, url);
  }
});

test('everything else is not found', () => {
  for (const url of [
    '/.git/HEAD', '/.git/config', '/GIT~1/config', '/.gitignore', '/.gitattributes',
    '/package.json', '/README.md', '/AGENTS.md', '/scripts/serve.js', '/test/run.test.js',
    '/src', '/src/', '/src/nope.txt', '/SRC/app.js', '/src/App.js', '/src/app.js::$DATA',
    '/src/../package.json', '/src/%2e%2e/package.json', '/src\\..\\package.json',
    '/%2e%2e/%2e%2e/etc/passwd', '/src/sub/app.js', '/src/app.js/', '/index.html.bak',
  ]) {
    assert.deepEqual(publicPath(url), { status: 404 }, url);
  }
});

test('an undecodable URL is a bad request', () => {
  assert.deepEqual(publicPath('/%E0%A4%A'), { status: 400 });
  assert.deepEqual(publicPath('/%'), { status: 400 });
});

// A new source file whose name the allowlist rejects would quietly 404 and
// break the page, so fail here instead.
test('every file in src/ is public', () => {
  for (const name of readdirSync(new URL('../src/', import.meta.url))) {
    assert.equal(publicPath(`/src/${name}`).status, 200, `src/${name} would not be served`);
  }
});

function startServer() {
  const child = spawn(process.execPath, ['scripts/serve.js', '0'], {
    cwd: new URL('..', import.meta.url),
  });
  const port = new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => {
      const match = /localhost:(\d+)/.exec(String(chunk));
      if (match) resolve(Number(match[1]));
    });
    child.on('exit', (code) => reject(new Error(`server exited with ${code}`)));
  });
  return { child, port };
}

test('the real server serves the app, refuses the rest and survives bad URLs', async (t) => {
  const { child, port: portPromise } = startServer();
  t.after(() => child.kill());
  const port = await portPromise;
  const base = `http://127.0.0.1:${port}`;

  const index = await fetch(`${base}/`);
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-type'), /text\/html/);
  assert.equal(index.headers.get('cache-control'), 'no-store');
  assert.match(await index.text(), /<title>Team Generator<\/title>/);

  const script = await fetch(`${base}/src/app.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type'), /text\/javascript/);

  assert.equal((await fetch(`${base}/.git/HEAD`)).status, 404);
  assert.equal((await fetch(`${base}/package.json`)).status, 404);
  assert.equal((await fetch(`${base}/%E0%A4%A`)).status, 400);
  // Still up after the bad request.
  assert.equal((await fetch(`${base}/styles.css`)).status, 200);

  // Not reachable on this machine's network addresses, only on loopback.
  const external = Object.values(networkInterfaces()).flat()
    .find((a) => a && a.family === 'IPv4' && !a.internal);
  if (external) {
    await assert.rejects(fetch(`http://${external.address}:${port}/`, { signal: AbortSignal.timeout(2000) }));
  }
});
