// Finds 3D walkthroughs for many levels at once (Jared: "create walkthroughs for all levels and test them all
// up to the boss"): for each level, tools/depth-run-search.mjs again and again until every piece survives the
// 3D rules and the last takes the exit; a piece it cannot do in time is tried again with other dice, longer.
// At most JOBS searches at once (the machine has about 9 GB).
//
//   node tools/depth-search-all.mjs 5 7 8 ...        (levels; default: all)
//
// Writes tests/data/depth-runs/NN.json (each search keeps its own level's) and logs to train-out/depth-search/.
import { spawn } from 'node:child_process';
import { mkdirSync, appendFileSync } from 'node:fs';

const JOBS = 3, ROUNDS = 40;
const levels = process.argv.slice(2).map(Number);
const queue = levels.length ? levels : [...Array(22).keys()];
const LOG = new URL('../train-out/depth-search/', import.meta.url);
mkdirSync(LOG, { recursive: true });
const log = (L, line) => { appendFileSync(new URL(`level${String(L).padStart(2, '0')}.log`, LOG), line + '\n'); };

const run = (L, seed, minutes) => new Promise((resolve) => {
  const p = spawn(process.execPath, [new URL('depth-run-search.mjs', import.meta.url).pathname, String(L), '--minutes', String(minutes), '--seed', String(seed)]);
  let out = '';
  p.stdout.on('data', (b) => { out += b; });
  p.stderr.on('data', () => {});
  p.on('close', () => resolve(out));
});

async function level(L) {
  let seed = 1, minutes = 8;
  for (let r = 0; r < ROUNDS; r++) {
    const out = await run(L, seed, minutes);
    const said = out.split('\n').filter((l) => /^(level|kept|no inputs|recorded)/.test(l));
    for (const l of said) log(L, `${new Date().toISOString().slice(11, 19)} ${l}`);
    if (/every piece survives/.test(out)) return `level ${L}: done`;
    if (!/kept:/.test(out)) { seed++; minutes = Math.min(30, minutes + 8); } // stuck: other dice, longer
    if (seed > 4) return `level ${L}: gave up (see train-out/depth-search)`;
  }
  return `level ${L}: out of rounds`;
}

const results = [];
await Promise.all(Array.from({ length: JOBS }, async () => {
  while (queue.length) { const L = queue.shift(); const r = await level(L); results.push(r); console.log(r); }
}));
console.log(results.sort().join('\n'));
