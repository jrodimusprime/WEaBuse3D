// Abuse in 3D, from the cop's eyes: WEaBuse's simulation runs the game, the
// Quake-style engine draws it, and you play it like Quake.
//
// The rules run in Abuse's plane (WEaBuse), and the depth layer (depth.js)
// adds the third dimension: the cop, the enemies, items, switches and shots
// all have a place across the hall.
//   - mouse look turns the view freely (pitch and yaw), like Quake;
//   - W A S D move relative to the view (cl_input.c CL_BaseMove): the part along
//     the hall is Abuse's own running, the part across it is the depth layer's;
//   - the aim is where you look: Abuse aims along it in the plane, and the shot
//     travels across the hall along the line of sight.
// (The 2.5D cameras, angled and side, live on the branch feature/2.5d.)
//
// URL options (screenshots and tests):
//   ?level=0            which level (web/maps/levelNN.bsp must exist)
//   ?watch=1            play the recorded winning run of the level
//   ?watch3d=1          play it under the 3D rules (client/autopilot.js), and the next levels, to WATCH3D_LAST
//   ?still=N            step N simulation steps with no input, then hold
//   ?yaw=deg&pitch=deg  the view
//   ?at=x,y             put the player here
//   ?kill=TYPE          review: kill the nearest one of that type shortly after play starts (its corpse)
//   ?splash=1           show the splash screen (it shows once a session, on a plain link)
//   ?weapon=NAME        review: all weapons, this one in hand (MGUN PGUN GRENADE ROCKET FIREBOMB DFRIS LSABER)
//   ?fire=1             review: hold the trigger while ?still steps run
//   ?effect=TYPE&frame=N&fxd=px  review: an effect (EXPLODE1...) frozen at a frame, fxd px ahead
//   &pose=STATE&frame=N with ?look: show the object in that state (review only; use with ?still=0); STATE>NEXT
//   switches to NEXT a second later; &onwall=1|-1 puts an ant on the back or front side wall
//   ?solo=1             with ?look: draw only that object, on black (for checking models)
//   ?look=TYPE&ang=deg&dist=units&n=k   model review: the eye `dist` units from the k-th object of that
//                       type, `ang` degrees round from straight in front, looking at it (use with ?still=0)
import { windowCells, backdropCanvas } from './backdrop.js';
import { loadBSP } from '../engine/bsp.js';
import { Renderer } from '../engine/render.js';
import { createGame, levelFile, aimAt, STEP } from './sim-host.js';
import { collectScene } from './scene.js';
import { createStatbar } from './statbar.js';
import { Depth, EYE } from './depth.js';
import { placeScene, frameBoxes } from './place.js';
{ const a = new URLSearchParams(location.search).get('ant'); placeScene.antVariant = a === null ? undefined : Number(a); } // ?ant=0..7 (7, Xeno with Mandible's pincers, is the default)
import { viewModel, VIEW_SCALE, VIEW_HOLD } from './viewmodel.js';
import { atmosphere } from './atmosphere.js';
import { ShotFx } from './particles.js';
import { shotParts } from './shots.js';
import { Corpses } from './corpses.js';
import { splash } from './splash.js';
import { sayHints } from './hints.js';
import { JumpAssist, climbIntent } from './controls.js';
import { piecesFor, autopilotStep } from './autopilot.js';

const params = new URLSearchParams(location.search);
const level = Number(params.get('level') || 0);
const canvas = document.getElementById('view');
const hudEl = document.getElementById('status');
const helpEl = document.getElementById('help');
const msgEl = document.getElementById('msg');
const lockEl = document.getElementById('lock');
const setMsg = (html) => { msgEl.innerHTML = html; msgEl.hidden = !html; };

const gl = canvas.getContext('webgl2', { antialias: true });
if (!gl) { setMsg('This browser has no WebGL2.'); throw new Error('no webgl2'); }

setMsg('Loading level and art…');
const name = `level${String(level).padStart(2, '0')}`;
const [bspBuf, palBuf] = await Promise.all([
  fetch(`maps/${name}.bsp`).then((r) => { if (!r.ok) throw new Error(`no ${name}.bsp`); return r.arrayBuffer(); }),
  fetch('maps/palette.lmp').then((r) => r.arrayBuffer()),
]);
const world = loadBSP(new Uint8Array(bspBuf));
const renderer = new Renderer(gl);
renderer.load(world, new Uint8Array(palBuf));
// the Quake look: Quake's palette (from LibreQuake, BSD licence) and about Quake's resolution; F4 toggles it
if (new URLSearchParams(location.search).get('quake') !== '0') {
  fetch('palettes/quake.lmp').then((r) => r.arrayBuffer()).then((b) => renderer.setQuakePalette(new Uint8Array(b))).catch(() => {});
}
addEventListener('keydown', (e) => { if (e.code === 'F4') { renderer.quake = !renderer.quake && !!renderer.lutTex; e.preventDefault(); } });

// ---- progress: the levels passed in this browser, so any of them can be played again ----
const LEVELS = 22;
const PROGRESS_KEY = 'weabuse3d.passed';
const loadPassed = () => { try { return new Set(JSON.parse(localStorage.getItem(PROGRESS_KEY) || '[]')); } catch { return new Set(); } };
const savePassed = (set) => { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify([...set].sort((a, b) => a - b))); } catch { /* private mode: progress lasts this visit */ } };
const passed = loadPassed();
const levelSelect = document.getElementById('levels');
function fillLevels() {
  // every level (Jared: "show all levels in the dropdown"), a tick by each one passed
  levelSelect.innerHTML = '';
  for (let n = 0; n < LEVELS; n++) {
    const o = document.createElement('option');
    o.value = n; o.textContent = `${n}${passed.has(n) ? ' ✓' : ''}`; o.selected = n === level;
    levelSelect.append(o);
  }
}
fillLevels();
levelSelect.addEventListener('change', () => { levelSelect.blur(); location.search = `?level=${levelSelect.value}`; });

const g = await createGame(hudEl);
sayHints(g); // the hints in this game's controls, on screen and spoken (client/hints.js)
let finished = null;
g.nextLevel = (n) => {
  finished = n; g.transitioning = true;
  if (!watch) { passed.add(level); savePassed(passed); fillLevels(); } // (a watched run passes nothing)
  else if (watch.three && n <= WATCH3D_LAST) setTimeout(() => { location.search = `?level=${n}&watch3d=1`; }, 1500); // on to the next level, in 3D
};
g.onEndGame = () => { finished = 'end'; if (!watch) { passed.add(level); savePassed(passed); fillLevels(); } };
// the splash (client/splash.js) while the level loads: once a session, not for review or watch links
const plain = [...params.keys()].every((k) => k === 'level' || k === 'quake');
let firstVisit = true;
try { firstVisit = !sessionStorage.getItem('weabuse3d-splash'); sessionStorage.setItem('weabuse3d-splash', '1'); } catch { /* private mode: shown each time */ }
if (plain && firstVisit || params.has('splash')) {
  setMsg('');
  lockEl.hidden = true;
  const cross = document.getElementById('cross'); if (cross) cross.hidden = true;
  const loading = g.start(levelFile(level));
  await splash(renderer, g, canvas, loading);
  await loading;
  lockEl.hidden = document.pointerLockElement === canvas;
  if (cross) cross.hidden = false;
} else await g.start(levelFile(level));
// the level's background, seen out of the windows (Abuse's parallax layer, at its own scroll rate)
{
  const lv = g.level, back = { size: [g.bw, g.bh], tile: (n) => g.assets.backTile(n) };
  const cells = windowCells({ ...lv, rate: lv.bgRate, tile: [g.tw, g.th], back, fore: (n) => g.assets.foreTile(n), palette: g.assets.palette });
  const canvas = lv.bgW && lv.bgH ? backdropCanvas({ ...lv, back, palette: g.assets.palette }) : null;
  renderer.setBackdrop({ canvas, rate: lv.bgRate, view: [320, 200], cells });
}
g.freshRun();
const statbar = await createStatbar(g, document.getElementById('statbar'));
const LANE = Number(world.entities[0]._abuse_lane || 160);
const depth = new Depth(g, LANE);
depth.install();
const palette = new Uint8Array(palBuf);
renderer.setFrames(frameBoxes(depth, LANE, g, renderer));
if (params.has('at')) { const [x, y] = params.get('at').split(',').map(Number); g.teleportPlayer(x, y); }
setMsg('');

// ---- the view: Quake's viewangles, in degrees (pitch + is down, yaw 0 is +X = Abuse's right) ----
let yaw = Number(params.get('yaw') || 0), pitch = Number(params.get('pitch') || 0);
if (params.has('depth')) depth.pd = Number(params.get('depth'));
if (params.has('weapon')) { g.giveAllWeapons(); for (const w of g.player.owned) g.player.ammo[w] = 99; g.selectWeapon(params.get('weapon')); } // review: every weapon, loaded, this one in hand
const holdFire = params.has('fire'); // review: the trigger held while ?still steps run
if (params.has('effect')) { // review: an effect in front of the player, at a frame of its animation
  const fx = g.effect(params.get('effect'), g.player.x + Number(params.get('fxd') || 70), g.player.y - 20);
  if (fx) { fx.frame = Number(params.get('frame') || 0); fx.depth = depth.pd; fx.ai = null; }
}
let lookEye = null, lookTarget = null;
const solo = params.has('solo');
if (params.has('look')) {
  const e = g.entities.filter((q) => q.type === params.get('look'))[Number(params.get('n') || 0)];
  if (e) {
    lookTarget = e;
    if (params.has('pose')) { // review only; A>B: state A, then B a second later (an ant's cocoon, then its husk)
      const [first, then] = params.get('pose').split('>');
      e.setState(first); e.frame = Number(params.get('frame') || 0); e.stateTime = 99; // (long settled into it)
      if (then) setTimeout(() => { e.setState(then); e.frame = 0; }, 1000);
    }
    if (params.has('onwall')) { // review only: an ant clinging to a side wall (1 the back, -1 the front), as the depth layer's wall run has it
      const side = Number(params.get('onwall')) < 0 ? -1 : 1;
      e.w = { phase: 'cling', t: 1, side, d0: 0, y0: e.y, h: 0 };
      e.depth = side * (LANE - 18);
    }
    const img = g.spriteOf(e);
    const ang = (Number(params.get('ang') || 0) * Math.PI) / 180, dist = Number(params.get('dist') || 160);
    const k = depth.kind(e);
    const tz = -2 * (e.y - (img?.h || 20) / 2), tx = 2 * e.x, ty = k === 'wall' ? LANE - 6 : depth.depthOf(e) ?? 0;
    // in front means from the middle of the hall for things on the wall, from along the hall otherwise
    const ex = k === 'wall' ? tx + dist * Math.sin(ang) : tx - dist * Math.cos(ang);
    const ey = k === 'wall' ? ty - dist * Math.cos(ang) : ty + dist * Math.sin(ang);
    const ez = tz + Number(params.get('up') || 30);
    lookEye = [ex, ey, ez];
    yaw = (Math.atan2(ty - ey, tx - ex) * 180) / Math.PI;
    pitch = (-Math.atan2(tz - ez, Math.hypot(tx - ex, ty - ey)) * 180) / Math.PI;
  }
}

// ---- input ----
const held = new Set();
const jumpAssist = new JumpAssist();
const shotFx = new ShotFx();
const corpses = new Corpses();
if (params.has('kill')) { // review: kill one of a type and run the game 4 s on at once, to see its corpse (client/corpses.js)
  const type = params.get('kill'), p = g.player;
  // (with ?look of the same type, the one looked at: ?look=TYPE&n=k&kill=TYPE&solo=1 shows its corpse alone)
  const near = params.get('look') === type ? g.entities.filter((q) => q.type === type)[Number(params.get('n') || 0)]
    : g.entities.filter((e) => e.type === type && !e.dead).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  if (near) {
    corpses.update(g, depth, performance.now() - 5000);
    near.hp = 0;
    for (let i = 0; i < 240; i++) { g.keys.clear(); depth.movePlayer(0, STEP); g.update(STEP); corpses.update(g, depth, performance.now() - 5000); }
  }
}
addEventListener('keydown', (e) => {
  held.add(e.code);
  if (e.code === 'F2') { renderer.brightness = renderer.brightness >= 2 ? 1 : renderer.brightness + 0.5; e.preventDefault(); }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => held.delete(e.code));
addEventListener('blur', () => held.clear());
canvas.addEventListener('mousedown', (e) => {
  if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); return; }
  if (e.button === 0) g.mouseDown = true;
  if (e.button === 2) g.rightDown = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) g.mouseDown = false; if (e.button === 2) g.rightDown = false; });
document.addEventListener('pointerlockchange', () => { lockEl.hidden = document.pointerLockElement === canvas; });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  // in_win.c IN_MouseMove: m_yaw 0.022, m_pitch 0.022, sensitivity 3; cl_pitchup 70, cl_pitchdown 80
  yaw -= e.movementX * 0.022 * 3;
  pitch = Math.max(-70, Math.min(80, pitch + e.movementY * 0.022 * 3));
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { e.preventDefault(); g.cycleWeapon(e.deltaY > 0 ? 1 : -1); }, { passive: false });

const down = (...codes) => (codes.some((c) => held.has(c)) ? 1 : 0);
const rad = (d) => (d * Math.PI) / 180;

// Turns this step's Quake input into the keys and aim Abuse's game reads.
function feedInput() {
  // keyboard turning, like Quake's arrow keys (cl_yawspeed 140 degrees a second)
  yaw += (down('ArrowLeft') - down('ArrowRight')) * 140 * STEP;
  // CL_BaseMove: forward along the view, sideways along its right; only the part along the lane counts
  const fwd = down('KeyW', 'ArrowUp') - down('KeyS', 'ArrowDown');
  const side = down('KeyD') - down('KeyA');
  const along = Math.cos(rad(yaw)) * fwd + Math.sin(rad(yaw)) * side; // forward.x * fwd + right.x * side
  const across = Math.sin(rad(yaw)) * fwd - Math.cos(rad(yaw)) * side; // forward.y * fwd + right.y * side
  depth.movePlayer(Math.max(-1, Math.min(1, across)), STEP);
  const p = g.player;
  const onLadder = g.ladders.some((l) => p.x >= l.x0 - 5 && p.x <= l.x1 + 5 && p.y >= l.y0 && p.y <= l.y1 + 3);
  g.keys.clear();
  const climb = climbIntent(g, fwd, pitch, depth.offLadder > 0); // controls.js
  if (climb > 0) g.keys.add('ArrowUp');
  if (climb < 0) g.keys.add('ArrowDown');
  // along the hall at the forward share of the speed, as across it (depth.js alongWish caps Abuse's run)
  depth.alongWish = Math.min(1, Math.abs(along));
  if (!climb && along > 0.05) g.keys.add('ArrowRight');
  if (!climb && along < -0.05) g.keys.add('ArrowLeft');
  if (held.has('Space')) g.keys.add('Space'); // Space jumps, off a ladder too (Jared: "you should be able to jump off a ladder")
  if (held.has('KeyE')) g.keys.add('ArrowDown'); // use: switches, lifts, doors; down a ladder
  if (held.has('KeyF') || held.has('ControlLeft')) g.keys.add('KeyF'); // fire from the keyboard
  if (!onLadder) jumpAssist.step(g, held.has('Space')); // a press on a slope's bump is not lost (controls.js)
  // aim: the view direction (AngleVectors forward: x = cp*cy, y = cp*sy, z = -sp). Abuse aims along
  // its part in the plane; the shot crosses the hall by the rest: depth units per pixel along the plane
  let ax = Math.cos(rad(pitch)) * Math.cos(rad(yaw)), az = -Math.sin(rad(pitch));
  const ay = Math.cos(rad(pitch)) * Math.sin(rad(yaw));
  const len = Math.sqrt(ax * ax + az * az);
  depth.shotRatio = Math.max(-12, Math.min(12, (2 * ay) / Math.max(len, 1e-6)));
  if (len < 0.2) { ax = p.dir; az = 0; } else { ax /= len; az /= len; }
  aimAt(g, Math.round(p.x + 200 * ax), Math.round(p.y - EYE - 200 * az));
}

// ---- the recorded run (Watch), in 2D's rules or in 3D's ----
// In 3D (?watch3d=1, the "Watch levels 0-4 in 3D" button): the depth layer stays on and the run is played as
// the tests and the search play it (client/autopilot.js), with the pieces the search found for the 3D rules
// where the 2D ones do not survive them (tests/data/depth-runs.json); at each exit it goes on to the next
// level, up to WATCH3D_LAST.
const WATCH3D_LAST = 4;
let watch = null;
async function startWatch(three = false) {
  const [ppo, demo, own] = await Promise.all([import('../sim/web/src/ppo.js'), fetch('../sim/web/data/ppo-demo.json').then((r) => r.json()),
    three ? fetch('../tests/data/depth-runs.json').then((r) => r.json()).catch(() => ({})) : null]);
  const pieces = three ? piecesFor(demo, own, level, ppo.decodeActs) : demo.pieces.filter((p) => p.levelIdx === level);
  if (!pieces.length) { setMsg('No recorded run for this level.'); return; }
  watch = { ppo, pieces, three, k: -1, i: 0, n: 0, acts: null, face: 1, act: 0, loading: false };
  g.demo = true; // the game ignores the keyboard while a recorded run plays
  depth.alongWish = 1; // (the run's own keys, at full speed)
  if (!three) depth.uninstall(); // the run was found under the 2D rules, so it plays under them
  depth.pd = 0;
  await nextPiece();
}
async function nextPiece() {
  const w = watch;
  w.k++;
  if (w.k >= w.pieces.length) { watch = null; g.demo = false; depth.install(); return; }
  const piece = w.pieces[w.k];
  w.loading = true;
  if (w.three) depth.uninstall(); // (each piece starts from its saved state, as the tests play it)
  await w.ppo.startRun(g, levelFile(level), piece.seed || null);
  if (w.three) depth.install();
  w.acts = w.three ? piece.acts : w.ppo.decodeActs(piece.acts);
  w.n = Math.min(piece.steps, w.acts.length * 4);
  w.i = 0;
  w.loading = false;
}
function watchStep() {
  const w = watch;
  if (w.loading) return;
  if (w.i >= w.n) { nextPiece(); return; }
  if (w.i % 4 === 0) { w.act = w.acts[w.i / 4]; const mv = (w.act % 3) - 1; if (mv !== 0) w.face = mv; }
  if (w.three) autopilotStep(g, depth, w.act, w.face, w.ppo.applyAction, STEP);
  else { w.ppo.applyAction(g, w.act, w.face); g.update(STEP); }
  w.i++;
  // the view turns to where the cop faces and looks where he aims
  const want = g.player.dir > 0 ? 0 : 180;
  const d = ((want - yaw) % 360 + 540) % 360 - 180;
  yaw += d * 0.12;
  const a = g.player.aimAngle ?? 0; // degrees, up is positive (lisp_atan2)
  const up = a > 180 ? a - 360 : a;
  pitch += (-(Math.abs(up) > 90 ? Math.sign(up) * (180 - Math.abs(up)) : up) - pitch) * 0.12;
}

const stop = (e) => e.currentTarget.blur(); // (or Space, the jump, would press the button again)
// sound on or off (WEaBuse's Audio.setUserMuted also silences what is already playing); remembered in this browser
const muteBtn = document.getElementById('mute');
const MUTE_KEY = 'weabuse3d.muted';
const setMuted = (on) => {
  g.audio.setUserMuted(on);
  muteBtn.textContent = on ? 'Sound: off' : 'Sound: on';
  try { localStorage.setItem(MUTE_KEY, on ? '1' : '0'); } catch { /* private mode */ }
};
let startMuted = false;
try { startMuted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* private mode */ }
setMuted(startMuted);
muteBtn.addEventListener('click', (e) => { stop(e); setMuted(!g.audio.userMuted); });
// god mode (the G key does the same): WEaBuse's setGod, and the button shows which it is
const godBtn = document.getElementById('god');
g.onGod = (on) => { godBtn.textContent = on ? 'God mode: on' : 'God mode: off'; };
godBtn.addEventListener('click', (e) => { stop(e); g.setGod(!g.god); });
document.getElementById('watch').addEventListener('click', (e) => { stop(e); finished = null; setMsg(''); startWatch(); });
document.getElementById('watch3d').addEventListener('click', (e) => { stop(e); location.search = '?level=0&watch3d=1'; });
document.getElementById('restart').addEventListener('click', async (e) => {
  stop(e);
  watch = null; g.demo = false; finished = null; setMsg('');
  await g.start(levelFile(level));
  g.freshRun();
  depth.install(); depth.pd = 0; depth.pv = 0;
});
if (params.has('watch')) startWatch();
if (params.has('watch3d')) startWatch(true);

// ---- the loop: fixed simulation steps, drawing every frame ----
let acc = 0, last = performance.now(), stillSteps = params.has('still') ? Number(params.get('still')) : -1;
let prev = { x: g.player.x, y: g.player.y, d: depth.pd };
function frame(now) {
  const w = Math.floor(canvas.clientWidth * devicePixelRatio), h = Math.floor(canvas.clientHeight * devicePixelRatio);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  while (acc >= STEP) {
    acc -= STEP;
    if (finished !== null || stillSteps === 0) continue;
    if (stillSteps > 0) stillSteps--;
    prev = { x: g.player.x, y: g.player.y, d: depth.pd };
    if (watch) { watchStep(); continue; }
    feedInput();
    if (holdFire) g.mouseDown = true;
    g.update(STEP);
  }
  if (finished !== null && !msgEl.innerHTML) {
    document.exitPointerLock?.();
    const next = typeof finished === 'number' ? finished : null;
    setMsg(`<b>${name} complete</b><br><br><a href="?level=${level}">Play again</a>${next !== null ? ` · <a href="?level=${next}">Level ${next}</a>` : ''}`);
  }
  // the eye, between the last two steps
  const a = acc / STEP, p = g.player;
  const ex = prev.x + (p.x - prev.x) * a, ey = prev.y + (p.y - prev.y) * a;
  const eye = lookEye || [2 * ex, prev.d + (depth.pd - prev.d) * a, -2 * (ey - EYE)];
  const fovY = (2 * Math.atan(Math.tan(Math.PI / 4) / (w / h)) * 180) / Math.PI; // fov 90, CalcFov
  renderer.setAbuseLights(g.level.lights, params.has('amb') ? Number(params.get('amb')) : g.ambient, g.lightsOn); // ?amb=N: review lighting
  corpses.update(g, depth, now);
  const scene = placeScene(collectScene(g), depth, LANE, now, g, palette, corpses);
  const fired = g.player.justFired;
  g.player.justFired = false; // game.js render clears it after drawing the flash
  // the weapon in the hands, placed in front of the eye along the view (forward, left, up)
  let vm = [], muzzle = null;
  if (!lookEye && !g.player.dead) {
    const cy = Math.cos(rad(yaw)), sy = Math.sin(rad(yaw)), cp = Math.cos(rad(pitch)), sp = Math.sin(rad(pitch));
    const F = [cp * cy, cp * sy, -sp], L = [-sy, cy, 0], U = [sp * cy, sp * sy, cp];
    const S = VIEW_SCALE, V = [...F, ...L, ...U].map((v) => v * S);
    const held = (R) => { const o = new Float32Array(9); for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) o[c * 3 + r] = V[r] * R[c * 3] + V[3 + r] * R[c * 3 + 1] + V[6 + r] * R[c * 3 + 2]; return o; };
    const basis = held(VIEW_HOLD);
    const run = Math.min(1, Math.abs(g.player.vx || 0) / 135 + Math.abs(depth.pv) / 270);
    // a part that turns (the frisbee's disc) turns about its own vertical axis, inside the view
    const turned = (a) => { const c = Math.cos(a), n = Math.sin(a); const R = VIEW_HOLD, T = [c, n, 0, -n, c, 0, 0, 0, 1], M = new Float32Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i * 3 + j] = R[j] * T[i * 3] + R[3 + j] * T[i * 3 + 1] + R[6 + j] * T[i * 3 + 2]; return held(M); };
    vm = viewModel(g, palette, { fired, run, t: now }).map((q) => ({
      mesh: q.mesh, basis: q.spin === undefined ? basis : turned(q.spin), bright: q.bright || 1, flash: q.flash,
      skin: q.skin ?? (q.bright && q.bright > 1.2 ? 0 : 0.85), skinKind: q.skinKind || 0, skinScale: q.skinScale || 1 / 10, // Quake-style skin on the gun (leather on the gloves), not on what glows
      offset: [0, 1, 2].map((k) => eye[k] + F[k] * q.at[0] + L[k] * q.at[1] + U[k] * q.at[2]),
    }));
    if (fired) muzzle = [0, 1, 2].map((k) => eye[k] + F[k] * 90 + L[k] * -8 - U[k] * 4);
  }
  // the shots in flight, in 3D, and their trails, bursts and sparks (client/shots.js, client/particles.js)
  const shotAt = (b, x, y) => {
    const d = b.d0 === undefined ? depth.pd : Math.max(-LANE, Math.min(LANE, b.d0 + Math.hypot(x - b.sx, y - b.sy) * b.ratio));
    return [2 * x, d, -2 * y];
  };
  for (const q of shotParts(g, shotAt, now)) scene.sprites.push(q);
  corpses.emit(shotFx, now);
  shotFx.update(g, shotAt, (e) => depth.depthOf(e) ?? depth.pd, Math.max(0, (now - (shotFx.lastT ?? now)) / 1000));
  shotFx.lastT = now;
  const fx = shotFx.draws();
  const atmo = atmosphere(g, depth, scene, { lane: LANE, time: now, eye, muzzle });
  renderer.frame({ eye, angles: [pitch, yaw, 0] }, w, h, {
    mode: 'abuse', front: true, caps: false, fovY,
    sprites: solo ? scene.sprites.filter((s) => s.e === lookTarget) : [...(lookEye ? scene.sprites : scene.sprites.filter((s) => !s.player)), ...atmo.draws], // the camera is inside the cop
    glows: solo ? [] : [...atmo.glows, ...fx.glows], smoke: solo ? [] : fx.smoke, dyn: solo ? [] : atmo.dyn, eye,
    world: !solo,
    viewmodel: vm,
    boxes: scene.boxes, red: g.redRamp || 0,
  });
  g.updateHud();
  statbar.draw();
  statbar.fit(innerWidth * 0.5 + 1, innerHeight * 0.14);
  helpEl.textContent = g.helpText || '';
  helpEl.hidden = !g.helpText;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.body.dataset.ready = '1';
