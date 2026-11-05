// The weapons as the original has them (sim game.js originalWeapons, on in WEaBuse3D): Jared, "make sure they
// align in functionality and damage". Each against Abuse 0.8's weapons.lsp, guns.lsp and cop.cpp, on a long
// flat open floor of level 2 (x 1170-1490, y 1307), at a track gun put up as a target.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../sim/web/tools/headless.mjs';
import { createGame, levelFile, STEP, aimAt } from '../client/sim-host.js';

const g = await createGame();
g.audio.muted = true;
assert.equal(g.originalWeapons, true);

async function armed(weapon) {
  await g.start(levelFile(2));
  for (const e of g.entities) if (e.shootable && e.ai !== 'hwall_ai') e.dead = true;
  const p = g.player;
  p.x = 1180; p.y = 1300; p.vy = 0;
  for (let i = 0; i < 30; i++) { g.keys.clear(); g.update(STEP); }
  p.owned.add(weapon); p.weapon = weapon; p.ammo[weapon] = 50; p.hp = 100;
  return p;
}
const target = (x, y) => { const e = g.spawn('TRACK_GUN', x, y); e.hp = 1000; return e; }; // standing where the player stands
function play(n, { fire = 1, aim }) {
  const made = [];
  for (let i = 0; i < n; i++) {
    g.keys.clear();
    aimAt(g, aim[0], aim[1]);
    g.mouseDown = i < fire;
    const before = g.entities.length;
    g.update(STEP);
    for (const e of g.entities.slice(before)) made.push(e.type);
  }
  g.mouseDown = false;
  return made;
}

test('plasma: a line at once, 10 damage to the first thing within 200 px (guns.lsp fire_object 4)', async () => {
  let p = await armed('PGUN'), e = target(p.x + 100, p.y);
  play(6, { aim: [p.x + 300, p.y - 20] }); // (traced on the next tick, a 15th of a second)
  assert.equal(1000 - e.hp, 10);
  assert.ok(g.projs.some((b) => b.kind === 'beam' && b.style === 'plasma'), 'its line is left to fade');
  p = await armed('PGUN'); e = target(p.x + 260, p.y);
  play(8, { aim: [p.x + 300, p.y - 20] });
  assert.equal(e.hp, 1000, 'out of reach');
});

test('light saber: 30 damage within 45 px, nothing further (fire_object 7)', async () => {
  let p = await armed('LSABER'), e = target(p.x + 30, p.y);
  play(6, { aim: [p.x + 300, p.y - 20] }); // (traced on the next tick, a 15th of a second)
  assert.equal(1000 - e.hp, 30);
  p = await armed('LSABER'); e = target(p.x + 90, p.y);
  play(8, { fire: 8, aim: [p.x + 300, p.y - 20] });
  assert.equal(e.hp, 1000);
});

test('fire bomb: a fire that runs on, bursting into flame every tick and burning all round, not the thrower (firebomb_ai)', async () => {
  const p = await armed('FIREBOMB'), e = target(p.x + 120, p.y);
  assert.ok(g.projs.length === 0);
  const made = play(120, { aim: [p.x + 300, p.y - 10] });
  const flames = made.filter((t) => t === 'EXPLODE1').length;
  assert.ok(flames >= 5 && flames <= 21, `${flames} flames`);
  assert.ok(1000 - e.hp > 40, `burned ${Math.round(1000 - e.hp)}`);
  assert.equal(p.hp, 100);
});

test('rocket: locks on to the nearest bad guy and turns to it (player_rocket_ufun, rocket_ai)', async () => {
  const p = await armed('ROCKET'), e = target(p.x + 120, p.y - 90);
  play(3, { aim: [p.x + 300, p.y - 20] }); // fired level
  const r = g.projs.find((b) => b.kind === 'rocket');
  assert.equal(r.target, e, 'locked on');
  play(90, { fire: 0, aim: [p.x + 300, p.y - 20] });
  assert.ok(1000 - e.hp > 20, `hit for ${Math.round(1000 - e.hp)}`);
  assert.equal(p.hp, 100, 'not hurt by its own rocket');
});

test('death frisbee: steered towards the pointer (dfris_ai)', async () => {
  const p = await armed('DFRIS');
  let disc = null, rose = 0;
  for (let i = 0; i < 12; i++) {
    g.keys.clear(); aimAt(g, p.x + 60, p.y - 150); g.mouseDown = i < 1; g.update(STEP);
    disc = g.projs.find((b) => b.kind === 'disc') || disc;
    rose = Math.max(rose, p.y - disc.y);
  }
  assert.ok(rose > 60, `climbed ${Math.round(rose)} px towards the pointer`);
});

test('grenade: blows 40 px for 36 and spares the thrower (do_explo 40 36)', async () => {
  const p = await armed('GRENADE');
  play(150, { aim: [p.x + 30, p.y + 40] });
  assert.equal(p.hp, 100);
});
