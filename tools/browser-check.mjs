// Cross-runtime determinism: plays the scripted walk in headless Chrome and in
// Node and checks that both end with the same hash and position.
//
//   node tools/browser-check.mjs [ticks]
//
// Serves the repo itself on a free port (no other server needed). Set CHROME
// to the browser binary if it is not in the usual macOS or Linux place.
// Exit code 0 when they match, 1 when they differ, 2 when no Chrome was found.
import { createServer } from 'node:http';
import { readFile, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extname, join, normalize } from 'node:path';
import { loadBSP } from '../engine/bsp.js';
import { scriptedCommands, runWalk } from '../client/walk-script.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.bsp': 'application/octet-stream', '.lmp': 'application/octet-stream' };

export async function findChrome() {
  for (const c of [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean)) {
    try { await access(c); return c; } catch { /* next */ }
  }
  return null;
}

export function serve() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    try {
      const body = await readFile(join(ROOT, path));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

export async function browserWalk(ticks) {
  const chrome = await findChrome();
  if (!chrome) return null;
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/web/walktest.html?ticks=${ticks}`;
  try {
    const dom = await new Promise((ok, fail) => execFile(chrome, ['--headless=new', '--disable-gpu', '--virtual-time-budget=60000', '--user-data-dir=' + join(ROOT, 'ref', '.chrome-check'), '--dump-dom', url], { timeout: 120000, maxBuffer: 1 << 24 }, (err, out) => (err ? fail(err) : ok(out))));
    const m = dom.match(/WALK (\d+) (\d+) (\d+) ([-\d.,e]+)/);
    if (!m) throw new Error(`no result in page: ${dom.slice(0, 300)}`);
    return { ticks: Number(m[1]), hash: Number(m[2]), stuck: Number(m[3]), origin: m[4].split(',').map(Number) };
  } finally { server.close(); }
}

export async function nodeWalk(ticks) {
  const world = loadBSP(new Uint8Array(await readFile(join(ROOT, 'web/maps/level00.bsp'))));
  return runWalk(world, scriptedCommands(ticks));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ticks = Number(process.argv[2] || 7200);
  const b = await browserWalk(ticks);
  if (!b) { console.log('no Chrome found (set CHROME)'); process.exit(2); }
  const n = await nodeWalk(ticks);
  const same = b.hash === n.hash && b.origin.every((v, i) => v === n.origin[i]);
  console.log(`node   ${n.hash} ${n.origin.join(',')}\nchrome ${b.hash} ${b.origin.join(',')}\n${same ? 'SAME' : 'DIFFERENT'}`);
  process.exit(same ? 0 : 1);
}
