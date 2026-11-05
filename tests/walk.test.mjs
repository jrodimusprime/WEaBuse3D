// Walking: Quake's physics on the compiled level. Never inside a wall, lands
// on the floor, and the same commands always give the same result.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadBSP } from '../engine/bsp.js';
import { newPlayer, playerTick, makeCommand, onGround, TICK_HZ } from '../engine/move.js';
import { scriptedCommands, runWalk } from '../client/walk-script.js';
import { isin, icos, ANGLE_UNITS } from '../engine/detmath.js';

const world = loadBSP(new Uint8Array(await readFile(new URL('../web/maps/level00.bsp', import.meta.url))));
const start = () => newPlayer(world.entities.find((e) => e.classname === 'info_player_start').origin.split(' ').map(Number));

test('the angle table is a sine', () => {
  for (let a = 0; a < ANGLE_UNITS; a += 97) {
    assert.ok(Math.abs(isin(a) - Math.sin((a * 2 * Math.PI) / ANGLE_UNITS)) < 1e-15);
    assert.ok(Math.abs(isin(a) ** 2 + icos(a) ** 2 - 1) < 1e-15);
  }
  assert.equal(isin(0), 0);
  assert.equal(isin(ANGLE_UNITS / 4), 1);
});

test('the player falls from the start and lands on the platform', () => {
  const p = start();
  for (let i = 0; i < TICK_HZ * 2; i++) playerTick(world, p, makeCommand({}));
  assert.ok(onGround(p), 'on ground');
  // feet (origin - 24) on the platform top at y = 92 px = Z -184 (DIST_EPSILON leaves a hair above)
  assert.ok(Math.abs(p.origin[2] - 24 - -184) < 0.1, `feet at ${p.origin[2] - 24}`);
});

test('walking forward moves along the lane and jumping leaves the ground', () => {
  const p = start();
  for (let i = 0; i < TICK_HZ; i++) playerTick(world, p, makeCommand({}));
  const x0 = p.origin[0];
  for (let i = 0; i < TICK_HZ / 2; i++) playerTick(world, p, makeCommand({ fwd: 1 }));
  assert.ok(p.origin[0] - x0 > 50, `moved ${p.origin[0] - x0}`);
  playerTick(world, p, makeCommand({ jump: true }));
  assert.ok(!onGround(p) && p.velocity[2] > 200, 'jumped');
});

test('a long random walk never ends a tick inside a wall, and repeats exactly', () => {
  const cmds = scriptedCommands(TICK_HZ * 120);
  const a = runWalk(world, cmds);
  const b = runWalk(world, cmds);
  assert.equal(a.stuck, 0, 'ticks inside solid');
  assert.equal(a.hash, b.hash);
  assert.ok(a.far > 300, `walk only got ${a.far} units from the start`);
});
