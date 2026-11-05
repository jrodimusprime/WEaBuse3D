// The depth layer: things meet in 3D only at the right depth, and a 3D session repeats exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import '../sim/web/tools/headless.mjs';
import { createGame, levelFile, aimAt, stateHash, STEP } from '../client/sim-host.js';
import { Depth, PLAYER_HALF } from '../client/depth.js';
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

test('an ant still in its cocoon on the ceiling stays where it hangs', async () => {
  await g.start(levelFile(1));
  g.freshRun();
  const d = new Depth(g, LANE); d.install();
  g.update(STEP);
  const ant = g.entities.find((e) => e.type === 'ANT_ROOF' && e.state === 'hanging');
  assert.ok(ant, 'a hanging ant on level 1');
  let fy = ant.y + 2; // on the floor near it, but not under it
  while (!g.solidAt(ant.x + 160, fy + 1) && fy < ant.y + 200) fy++;
  put(ant.x + 160, fy);
  d.depthOf(ant);
  ant.depth = -100; d.pd = 100;
  steps(60);
  assert.equal(ant.state, 'hanging');
  assert.ok(Math.abs(g.player.x - ant.x - 160) < 20, 'the player stayed beside it');
  assert.equal(ant.depth, -100, 'it does not slide across the hall towards the player');
});

test("level 2's switch beside the lift can be reached and used", async () => {
  await g.start(levelFile(2));
  g.freshRun();
  const d = new Depth(g, LANE); d.install();
  const sw = g.entities.find((e) => e.ai === 'switch_once_ai' && e.x === 1993 && e.y === 557);
  let fy = sw.y; while (!g.solidAt(sw.x, fy + 1)) fy++;
  put(sw.x, fy); d.pd = d.openFor(d.zonesAt(sw.x, fy)[0])[0] + 1; // in front of it, where the shaft lets them be
  steps(2);
  steps(60, () => d.movePlayer(1, 1 / 60)); // walking towards the back wall, as far as the frame walls let them
  assert.ok(d.pd >= LANE - PLAYER_HALF - 72, `within reach of the back wall: ${d.pd}`);
  const before = sw.aistate;
  steps(20, () => g.keys.add('ArrowDown'));
  g.keys.clear(); steps(2);
  assert.equal(g.player.x, sw.x, 'the lift shaft beside it did not push the player off');
  assert.notEqual(sw.aistate, before, 'switched');
});

test('on every level, nothing used on the back wall is shut off from it by a doorway or shaft', async () => {
  const need = LANE - PLAYER_HALF - 72; // the reach a wall switch asks for
  const blocked = [];
  for (let L = 0; L < 22; L++) {
    await g.start(levelFile(L));
    g.freshRun();
    const d = new Depth(g, LANE); d.install();
    for (const e of g.entities) {
      if (d.kind(e) !== 'wall' || !(/switch/.test(e.ai || '') || e.ai === 'restart_ai')) continue;
      let fy = e.y; while (!g.solidAt(e.x, fy + 1) && fy < e.y + 300) fy++;
      for (let x = e.x - 12; x <= e.x + 12; x += 4) {
        if (d.zonesAt(x, fy).some((z) => d.openFor(z)[1] < need)) { blocked.push(`level ${L} ${e.type} at ${e.x},${e.y}`); break; }
      }
    }
    d.uninstall();
  }
  assert.deepEqual(blocked, []);
});

test("a jugger shoves the player back only from its own depth, and one standing guard stays put", async () => {
  await g.start(levelFile(2));
  g.freshRun();
  const d = new Depth(g, LANE); d.install();
  g.god = true;
  const jug = g.entities.find((e) => e.type === 'JUGGER' && !e.links.length);
  const jd = d.depthOf(jug);
  const shoved = (pd) => {
    put(jug.x - 22, jug.y); d.pd = pd;
    const x0 = g.player.x;
    steps(8);
    return Math.abs(g.player.x - x0);
  };
  assert.ok(shoved(jd > 0 ? jd - 150 : jd + 150) < 2, 'not from across the hall');
  assert.ok(shoved(jd) > 4, 'shoved at its depth');
  assert.equal(d.depthOf(jug), jd, 'standing guard, it did not slide across the hall');
  g.god = false;
});

// an ant running at the player on level 1's floor (it starts in its cocoon; this puts it down running)
const runningAnt = async () => {
  await g.start(levelFile(1));
  g.freshRun();
  const d = new Depth(g, LANE); d.install();
  const ant = g.entities.find((e) => e.type === 'ANT_ROOF' && e.x === 1922);
  while (!g.solidAt(ant.x, ant.y + 1)) ant.y++;
  ant.a.st = 'running'; ant.setState('stopped'); ant.dir = 1;
  let fy = ant.y - 5; while (!g.solidAt(ant.x + 150, fy + 1)) fy++;
  put(ant.x + 150, fy); d.pd = -80;
  return { d, ant };
};

test('an ant runs up a side wall of the hall, scuttles along it and springs off at the player (a Jared rule)', async () => {
  const runs = [];
  for (let run = 0; run < 3; run++) {
    const seen = new Set();
    const { d, ant } = await runningAnt();
    g.god = true;
    let floorY = ant.y, onWall = null, landed = null;
    for (let i = 0; i < 1200 && !landed; i++) {
      g.update(STEP);
      if (ant.w) seen.add(ant.w.phase);
      if (ant.w?.phase === 'cling' && !onWall) onWall = { depth: ant.depth, up: floorY - ant.y };
      if (ant.wSpring) seen.add('spring');
      if (seen.has('spring') && !ant.wSpring && ant.a.st !== 'jump') landed = { dx: ant.x - g.player.x, depth: ant.depth };
    }
    g.god = false;
    assert.deepEqual([...seen].sort(), ['cling', 'leap', 'spring']);
    assert.ok(onWall && Math.abs(onWall.depth) === LANE - 18, `on the wall: ${onWall?.depth}`);
    assert.ok(onWall.up >= 16, `up the wall: ${onWall.up} px`);
    assert.ok(landed && Math.abs(landed.dx) < 40, `landed at the player, not past them: ${landed?.dx}`);
    assert.ok(Math.abs(landed.depth - d.pd) < 100, `came off the wall across the hall at the player: ${landed.depth}`);
    runs.push(stateHash(g) + ':' + Math.round(ant.depth * 1000));
  }
  assert.equal(runs[1], runs[2], 'the wall run repeats exactly'); // (the first warms up what freshRun does not reset)
});

test('a pack of ants spreads across the hall instead of coming in single file', async () => {
  await g.start(levelFile(1));
  g.freshRun();
  const d = new Depth(g, LANE); d.install();
  g.god = true;
  const pack = g.entities.filter((e) => e.type === 'ANT_ROOF' && e.y === 270); // the five over the bridge
  assert.equal(pack.length, 5);
  let fy = 280; while (!g.solidAt(2120, fy + 1)) fy++;
  put(2120, fy); d.pd = 0;
  steps(300, (i) => { if (i % 4 === 0) for (const a of pack) if (a.links[0]) a.links[0].aistate = 1; });
  g.god = false;
  const depths = pack.filter((a) => !a.dead && a.state !== 'hanging').map((a) => a.depth);
  assert.ok(depths.length >= 4, 'they dropped');
  assert.ok(Math.max(...depths) - Math.min(...depths) > 60, `spread across the hall: ${depths.map(Math.round)}`);
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

// Jared: "on this trapdoor in level 2 i got stuck in the wall and cant walk". The trap door at 2310,1199 stands
// 3 px proud of the floor; the simulation lets the feet into its top for a few frames before lifting the player
// onto it, and the hole's frame walls took that for being in the hole, undoing every step.
test('level 2: the player walks onto the trap door by the wall, at any depth across the hall', async () => {
  for (const dep of [-120, -40, 40, 120]) {
    const g = await createGame();
    g.audio.muted = true;
    await g.start(levelFile(2));
    g.god = true;
    const d = new Depth(g, LANE); d.install();
    for (const e of g.entities) if (d.kind(e) === 'enemy') e.dead = true;
    const p = g.player; p.x = 2265; p.y = 1182; p.vy = 0; d.pd = dep;
    for (let i = 0; i < 40; i++) { g.keys.clear(); d.movePlayer(0, STEP); g.update(STEP); }
    for (let i = 0; i < 60; i++) { g.keys.clear(); g.keys.add('ArrowRight'); d.movePlayer(0, STEP); g.update(STEP); }
    assert.ok(p.x > 2320, `at depth ${dep}: reached ${Math.round(p.x)}, the trap door is 2301-2349`);
    d.uninstall();
  }
});

// A Jared rule: turrets fire three times as often in 3D, where most of their shots cross the hall wide of the
// player ("the turent lasers arent as dangerous as they shoot through the whole room ... speed them up").
test('a track gun fires three times as often in 3D as in the plane', async () => {
  const { behaviors } = await import('../sim/web/src/behaviors.js');
  const count = async (on) => {
    const g = await createGame();
    g.audio.muted = true;
    await g.start(levelFile(2));
    const d = new Depth(g, LANE); if (on) d.install();
    const t = g.entities.find((e) => e.ai === 'track_ai');
    t.links = []; g.player.x = t.x - 60; g.player.y = t.y + 80;
    let shots = 0;
    for (let i = 0; i < 150; i++) { const n = g.projs.length; behaviors[t.ai](t, g); shots += g.projs.length - n; g.projs.length = 0; }
    d.uninstall();
    return shots;
  };
  const flat = await count(false), deep = await count(true);
  assert.ok(flat >= 3, `${flat} shots in the plane`);
  assert.equal(deep, flat * 3);
});
