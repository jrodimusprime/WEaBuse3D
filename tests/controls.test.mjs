// Jumping on slopes: a press on a frame where a bump lifted the player off the ground still jumps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../sim/web/tools/headless.mjs';
import { createGame, levelFile, STEP } from '../client/sim-host.js';
import { JumpAssist, COYOTE } from '../client/controls.js';

const g = await createGame();
g.audio.muted = true;
await g.start(levelFile(0));
g.freshRun();
const settle = () => { for (let i = 0; i < 60; i++) { g.keys.clear(); g.update(STEP); } assert.ok(g.player.ground, 'standing'); };

const pressOnBump = (assist) => {
  settle();
  const p = g.player;
  const a = new JumpAssist();
  a.step(g, false); // standing, key up
  p.ground = false; p.vy = 0; // a bump: off the ground for this frame
  g.keys.clear(); g.keys.add('Space');
  if (assist) a.step(g, true);
  let rose = false;
  for (let i = 0; i < 8; i++) { g.update(STEP); if (p.vy < 0) rose = true; g.keys.clear(); if (assist) a.step(g, false); }
  return rose;
};

test('without the assist, a press on a bump is lost (what Jared saw)', () => {
  assert.equal(pressOnBump(false), false);
});

test('with the assist, a press on a bump jumps', () => {
  assert.equal(pressOnBump(true), true);
});

test('coyote time ends: a press long after leaving the ground does not jump', () => {
  settle();
  const p = g.player, a = new JumpAssist();
  a.step(g, false);
  for (let i = 0; i <= COYOTE + 1; i++) { p.ground = false; a.step(g, false); }
  p.vy = 0;
  a.step(g, true);
  assert.equal(p.jumpQueued, false);
});
