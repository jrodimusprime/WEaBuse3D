// Level 0 played through the 3D client's host: the recorded winning run still
// wins, and recording the scene for drawing never changes the game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import '../sim/web/tools/headless.mjs'; // Node stand-ins for fetch, localStorage, requestAnimationFrame
import { createGame, levelFile, stateHash, STEP } from '../client/sim-host.js';
import { collectScene } from '../client/scene.js';

const ppo = await import('../sim/web/src/ppo.js');
const demo = JSON.parse(await readFile(new URL('../sim/web/data/ppo-demo.json', import.meta.url), 'utf8'));
const g = await createGame();
g.audio.muted = true;

// Plays level `lv`'s recorded pieces (as sim/web/tools/regress.mjs does). With
// `draw`, the scene is collected after every step, as the client does.
async function playRecorded(lv, draw) {
  let exit = null;
  g.nextLevel = (n) => { exit = n; g.transitioning = true; };
  const pieces = demo.pieces.filter((p) => p.levelIdx === lv);
  const hashes = [];
  let sprites = 0;
  for (const piece of pieces) {
    await ppo.startRun(g, levelFile(lv), piece.seed || null);
    exit = null;
    const acts = ppo.decodeActs(piece.acts), n = Math.min(piece.steps, acts.length * 4);
    let face = 1, act = 0;
    for (let i = 0; i < n && exit === null && !g.player.dead; i++) {
      if (i % 4 === 0) { act = acts[i / 4]; const mv = (act % 3) - 1; if (mv !== 0) face = mv; }
      ppo.applyAction(g, act, face);
      g.update(STEP);
      if (draw) { const s = collectScene(g); sprites += s.sprites.length; g.player.justFired = false; }
      hashes.push(stateHash(g));
    }
  }
  return { exit, dead: g.player.dead, hashes, sprites, at: [Math.round(g.player.x), Math.round(g.player.y)] };
}

const plain = await playRecorded(0, false);
const drawn = await playRecorded(0, true);

test('the recorded run of level 0 reaches the exit through the host', () => {
  assert.equal(plain.dead, false, `died at ${plain.at}`);
  assert.equal(plain.exit, 1, `ended at ${plain.at} without taking the exit`);
});

test('collecting the scene every step never changes the game', () => {
  assert.equal(drawn.exit, 1);
  assert.equal(drawn.hashes.length, plain.hashes.length);
  const first = drawn.hashes.findIndex((h, i) => h !== plain.hashes[i]);
  assert.equal(first, -1, `state differs from step ${first}`);
  assert.ok(drawn.sprites > drawn.hashes.length, 'the scene has the player and objects in it');
});

test('the scene holds the player, the flyers and the lift', async () => {
  await g.start(levelFile(0));
  g.freshRun();
  const s = collectScene(g);
  const ids = new Set(s.sprites.map((x) => x.id));
  for (const want of ['DARNEL', 'WHO', 'SMART_PLAT_SMALL', 'SWITCH_DOOR']) assert.ok(ids.has(want), `${want} in the scene`);
  for (const sp of s.sprites) assert.ok(sp.img.w > 0 && Number.isFinite(sp.x) && Number.isFinite(sp.y));
});
