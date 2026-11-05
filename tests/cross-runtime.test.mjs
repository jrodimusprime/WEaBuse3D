// The scripted walk gives the same bits in Chrome as in Node (skipped when no Chrome is installed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findChrome, browserWalk, nodeWalk } from '../tools/browser-check.mjs';

const chrome = await findChrome();

test('Chrome and Node walk the same, bit for bit', { skip: !chrome && 'no Chrome (set CHROME)' }, async () => {
  const ticks = 3600;
  const [b, n] = [await browserWalk(ticks), await nodeWalk(ticks)];
  assert.equal(b.stuck, 0);
  assert.equal(b.hash, n.hash);
  assert.deepEqual(b.origin, n.origin);
});
