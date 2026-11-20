import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const hash = data => createHash('sha256').update(data).digest('hex');

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? files(filename) : [filename];
  }))).flat();
}

for (const app of ['gomoku', 'shooter', 'survivor']) {
  const origin = `https://${app}.dev.kupac.org`;
  const root = path.join(app, 'dist');
  for (const filename of await files(root)) {
    const relative = path.relative(root, filename).split(path.sep).join('/');
    const response = await fetch(`${origin}/${relative}`, { signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200, `${app}/${relative}: HTTP status`);
    const actual = Buffer.from(await response.arrayBuffer());
    assert.equal(hash(actual), hash(await readFile(filename)), `${app}/${relative}: deployed content`);
    const type = response.headers.get('content-type');
    if (relative.endsWith('.js')) assert.match(type, /javascript/, `${relative}: MIME type`);
    if (relative.endsWith('.css')) assert.match(type, /text\/css/, `${relative}: MIME type`);
    if (relative === 'index.html') {
      assert.match(type, /text\/html/);
      assert.equal(response.headers.get('cache-control'), 'no-cache');
    } else {
      assert.match(response.headers.get('cache-control'), /immutable/);
    }
  }
  const home = await fetch(origin, { signal: AbortSignal.timeout(30000) });
  assert.equal(home.status, 200, `${app}: root`);
  assert.equal(hash(Buffer.from(await home.arrayBuffer())), hash(await readFile(`${root}/index.html`)));
  const redirect = await fetch(origin.replace('https:', 'http:'), {
    redirect: 'manual', signal: AbortSignal.timeout(30000),
  });
  assert.equal(redirect.status, 301, `${app}: HTTPS redirect`);
  assert.equal(new URL(redirect.headers.get('location')).protocol, 'https:');
  const missing = await fetch(`${origin}/assets/nonexistent-deployment-check.js`, {
    signal: AbortSignal.timeout(30000),
  });
  assert.ok([403, 404].includes(missing.status), `${app}: missing asset must keep an error status`);
  console.log(`Verified HTTPS, redirect, all build files and cache headers: ${origin}`);
}

for (const route of ['/debug', '/debug/', '/debug/stage/1', '/debug/boss/3/phase/4']) {
  const response = await fetch(`https://shooter.dev.kupac.org${route}`, {
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200, `STARFALL ${route}`);
  assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(await readFile('shooter/dist/index.html')));
}
console.log('Verified STARFALL direct debug routes.');
