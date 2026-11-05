// The depth layer: things meet in 3D only at the right depth, and a 3D session repeats exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import '../sim/web/tools/headless.mjs';
import { createGame, levelFile, aimAt, stateHash, STEP } from '../client/sim-host.js';
import { Depth } from '../client/depth.js';
import { LANE } from '../content/compile.mjs';

const g = await createGame();
g.audio.muted = true;
const fresh = async () => {
  await g.start(levelFile(0));
  g.freshRun();
  const d = new Depth(g, LANE);
  d.install();
  return d;
};
const steps = (n, fn) => { for (let i = 0; i < n; i++) { fn?.(i); g.update(STEP); } };
const find = (type) => g.entities.find((e) => e.type === type && !e.dead);
// the game only runs objects near its camera, so the camera goes along when the player is moved
const put = (x, y) => { g.teleportPlayer(x, y); g.cam.x = x - 160; g.cam.y = y - 100; };

test('an item is picked up only at its depth', async () => {
  const d = await fresh();
  const heart = find('HEALTH');
  d.depthOf(heart);
  g.player.hp = 50;
  put(heart.x, heart.y);
  d.pd = heart.depth > 0 ? heart.depth - 80 : heart.depth + 80; // beside it
  steps(10);
  assert.equal(heart.dead, false, 'not picked up from beside it');
  assert.equal(g.player.hp, 50);
  d.pd = heart.depth;
  steps(10);
  assert.ok(heart.dead || g.player.hp > 50, 'picked up when standing on it');
});

test('a wall switch is used only at the back wall', async () => {
  const d = await fresh();
  const sw = find('SWITCH');
  assert.equal(d.kind(sw), 'wall');
  put(sw.x, sw.y);
  d.pd = 0;
  const before = sw.aistate;
  steps(20, () => g.keys.add('ArrowDown'));
  assert.equal(sw.aistate, before, 'not from the middle of the hall');
  g.keys.clear(); steps(5);
  d.pd = LANE - 20;
  steps(20, () => g.keys.add('ArrowDown'));
  assert.notEqual(sw.aistate, before, 'switched at the wall');
});

test('enemies close in on the player across the hall', async () => {
  const d = await fresh();
  const who = find('WHO');
  put(who.x - 60, who.y + 40);
  d.depthOf(who);
  who.depth = -100; d.pd = 100;
  const before = Math.abs(who.depth - d.pd);
  steps(60);
  assert.ok(Math.abs(who.depth - d.pd) < before - 50, `${before} -> ${Math.abs(who.depth - d.pd)}`);
});

test("a shot hits what is at its depth and misses what is not", async () => {
  const d = await fresh();
  const who = find('WHO');
  // a still target: the flyer kept where it is, at depth 0
  const shoot = (playerDepth, ratio) => {
    who.hp = 20; who.dead = false; who.aistate = 1; who.shootable = true; // awake (flyer_ai aistate 0 is dormant)
    g.player.hp = 100;
    put(who.x - 90, who.y + 25);
    d.pd = playerDepth; d.shotRatio = ratio;
    who.depth = 0;
    const hp = who.hp;
    let hit = false;
    for (let i = 0; i < 40 && !hit; i++) {
      who.depth = 0;
      aimAt(g, who.x, who.y - 10);
      g.mouseDown = true;
      g.update(STEP);
      hit = who.hp < hp || who.dead;
    }
    g.mouseDown = false;
    g.projs.length = 0;
    return hit;
  };
  assert.equal(shoot(0, 0), true, 'aimed straight at it at its depth');
  assert.equal(shoot(120, 0), false, 'fired straight from far across the hall');
  // aimed across the hall at it: the line of sight from the eye (25 px above the feet) to its middle
  const eyeToTarget = Math.sqrt(90 * 90 + (25 - 25 - 10) ** 2);
  assert.equal(shoot(120, -120 / eyeToTarget), true, 'fired across the hall, aimed at it');
});

test('a 3D session repeats exactly', async () => {
  const run = async () => {
    const d = await fresh();
    const hashes = [];
    steps(900, (i) => {
      g.keys.clear();
      if (i % 200 < 120) g.keys.add('ArrowRight');
      if (i % 90 === 0) g.keys.add('Space');
      d.movePlayer(Math.sin(i / 50) > 0 ? 1 : -1, STEP);
      d.shotRatio = (i % 7) / 10 - 0.3;
      aimAt(g, Math.round(g.player.x + 100), Math.round(g.player.y - 20));
      g.mouseDown = i % 30 < 5;
      if (i % 60 === 0) hashes.push(stateHash(g) ^ Math.round(d.pd * 1000));
    });
    return hashes;
  };
  await run(); // (earlier tests leave the player's aim frame behind; freshRun does not reset it)
  assert.deepEqual(await run(), await run());
});

test('with the layer off the game is WEaBuse again', async () => {
  const d = await fresh();
  d.uninstall();
  assert.equal(g.apart, undefined);
  assert.equal(g.touchesPlayer, Object.getPrototypeOf(g).touchesPlayer);
});

test("an enemy's shot meets the player only where it was aimed, and blasts fall off in 3D", async () => {
  const d = await fresh();
  const p = g.player;
  // a shot fired at the player standing at depth 60, from 100 px away along the lane
  d.pd = 60;
  const shot = { x: p.x - 100, y: p.y - 15, kind: 'acid' };
  g.projs.push(shot);
  d.adopt(g.projs.length - 1, { type: 'WHO', ai: 'flyer_ai', depth: -60, x: shot.x, y: shot.y });
  shot.x = p.x; // arrived
  assert.equal(d.apart(shot, p), false, 'hits a player who stayed');
  d.pd = -20;
  assert.equal(d.apart(shot, p), true, 'misses a player who stepped aside');
  // a blast of radius 40 px at the player's spot in the plane: in reach at the same depth, not 120 units away
  const blast = { x: p.x, y: p.y - 18, radius: 40, d0: 0, ratio: 0, sx: p.x, sy: p.y - 18 };
  g.blast = blast;
  d.pd = 0;
  assert.equal(d.apart(blast, p), false);
  d.pd = 120;
  assert.equal(d.apart(blast, p), true);
  g.blast = null;
  g.projs.length = 0;
});
