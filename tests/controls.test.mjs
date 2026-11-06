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
  p.y -= 40; // in the air (standing counts the floor under the body, so clearing the flag alone is not the air)
  for (let i = 0; i <= COYOTE + 1; i++) { p.ground = false; a.step(g, false); }
  p.vy = 0;
  a.step(g, true);
  assert.equal(p.jumpQueued, false);
});

test('over a gap narrower than the body, held up at both edges, the player is standing: a press jumps', async () => {
  await g.start(levelFile(2));
  const { Depth } = await import('../client/depth.js'), { LANE } = await import('../content/compile.mjs');
  const d = new Depth(g, LANE); d.install();
  const p = g.player; p.x = 1820; p.y = 1023; p.vy = 0;
  for (let i = 0; i < 30; i++) { g.keys.clear(); g.update(STEP); }
  const a = new JumpAssist();
  let jumped = false, over = false, air = 0;
  for (let i = 0; i < 40 && !jumped; i++) {
    g.keys.clear(); g.keys.add('ArrowLeft');
    air = p.ground ? 0 : air + 1; // over the slit by the lift Abuse has the player in the air
    const press = air === COYOTE + 1; // late in the crossing, past the coyote time
    if (press) over = true;
    a.step(g, press);
    const wasOver = air > 0;
    g.update(STEP);
    if (p.vy < 0 && over && wasOver) jumped = true; // from over the slit, not once landed beyond it
    if (over && p.ground && !jumped) break;
  }
  d.uninstall();
  assert.ok(over, 'crossed the slit');
  assert.ok(jumped, 'jumped from over it');
});

// Quake keeps a runner on a ramp (client/depth.js stepDown). Without it the player, standing by their
// centre, was in the air for 26 of 30 frames running up level 0's first slope, and 11 running down the next.
for (const [what, x, y, dir, n] of [['up the slope at the start', 200, 100, -1, 30], ['down the slope at x 1272', 1220, 190, 1, 45]]) {
  test(`running ${what} of level 0 keeps the player on the ground`, async () => {
    await g.start(levelFile(0));
    const { Depth } = await import('../client/depth.js'), { LANE } = await import('../content/compile.mjs');
    const d = new Depth(g, LANE); d.install();
    const p = g.player; p.x = x; p.y = y; p.vy = 0;
    for (let i = 0; i < 30; i++) { g.keys.clear(); g.update(STEP); }
    const y0 = p.y;
    let air = 0;
    for (let i = 0; i < n; i++) { g.keys.clear(); g.keys.add(dir > 0 ? 'ArrowRight' : 'ArrowLeft'); g.update(STEP); if (!p.ground) air++; }
    d.uninstall();
    assert.notEqual(p.y, y0, 'went up or down the slope');
    assert.equal(air, 0, `${air} frames in the air`);
  });
}

// Jared: "the forward button now doesnt quite go forward anymore when facing on an angle". Quake moves the
// player where they face; Abuse's run along the hall is all or nothing. Facing 45 degrees across the hall the
// run is capped at the forward share of its speed (depth.js alongWish), so the player goes the way they face.
test('facing at an angle, the run along the hall goes at the forward share of its speed', async () => {
  await g.start(levelFile(2));
  const { Depth } = await import('../client/depth.js'), { LANE } = await import('../content/compile.mjs');
  const d = new Depth(g, LANE); d.install();
  const p = g.player; p.x = 1180; p.y = 1300; p.vy = 0;
  for (let i = 0; i < 30; i++) { g.keys.clear(); g.update(STEP); }
  const run = (w) => {
    const x0 = p.x;
    d.alongWish = w;
    for (let i = 0; i < 60; i++) { g.keys.clear(); g.keys.add('ArrowRight'); g.update(STEP); }
    for (let i = 0; i < 30; i++) { g.keys.clear(); g.update(STEP); }
    return p.x - x0;
  };
  const full = run(1);
  p.x = 1180; p.vx = 0;
  for (let i = 0; i < 10; i++) { g.keys.clear(); g.update(STEP); }
  const slant = run(Math.SQRT1_2);
  d.uninstall();
  assert.ok(full > 100, `ran ${Math.round(full)} px`);
  assert.ok(Math.abs(slant / full - Math.SQRT1_2) < 0.08, `at 45 degrees ${Math.round(slant)} of ${Math.round(full)} px`);
});

// Jared: "it says press down to active platform on screen and with voice over. can you make it say press E".
test('every hint that names one of Abuse\'s keys is said in this game\'s controls', async () => {
  const { HINTS_3D, sayHints } = await import('../client/hints.js');
  const src = await (await import('node:fs/promises')).readFile(new URL('../sim/web/src/behaviors.js', import.meta.url), 'utf8');
  const hints = [...src.slice(src.indexOf('const HINTS = ['), src.indexOf('];', src.indexOf('const HINTS = ['))).matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(hints.length >= 12);
  for (const h of hints) {
    const shown = HINTS_3D[h] ?? h;
    assert.ok(!/\bdown key\b|press down|up key|CTRL|INS/i.test(shown), `"${shown}"`);
  }
  await g.start(levelFile(0));
  sayHints(g);
  const played = [];
  g.audio.play = (name) => played.push(name);
  g.showHelp('Press down to activate platform', 'platfo_1');
  assert.equal(g.helpText, 'Press E to activate the platform');
  assert.deepEqual(played, ['../../../../web/voice/platform_e'], 'its own voice-over, through the game\'s audio');
  // every 3D line has its voice-over (tools/make-voices.mjs)
  const { VOICES_3D } = await import('../client/hints.js');
  const { access } = await import('node:fs/promises');
  for (const h of hints) { const said = HINTS_3D[h] ?? h; assert.ok(VOICES_3D[said], `"${said}" has its voice-over`); await access(new URL(`../web/voice/${VOICES_3D[said]}.wav`, import.meta.url)); } // every hint, in the one voice
});
