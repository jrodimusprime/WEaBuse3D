// Abuse in 3D: WEaBuse's simulation runs the game, the 3D engine draws it.
//
// URL options:
//   ?level=0              which level (web/maps/levelNN.bsp must exist)
//   ?cam=angled|side|first   the camera (F3 cycles)
//   ?watch=1              play the recorded winning run of the level
//   ?still=N              screenshots: step N simulation steps with no input, then hold
//   ?aim=x,y              screenshots: aim at this level pixel
//   ?at=x,y               screenshots: put the player here
import { loadBSP } from '../engine/bsp.js';
import { Renderer } from '../engine/render.js';
import { createGame, levelFile, aimAt, STEP } from './sim-host.js';
import { collectScene } from './scene.js';

const params = new URLSearchParams(location.search);
const level = Number(params.get('level') || 0);
const canvas = document.getElementById('view');
const hudEl = document.getElementById('hud');
const helpEl = document.getElementById('help');
const msgEl = document.getElementById('msg');
const startEl = document.getElementById('start');
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

const g = await createGame(hudEl);
let finished = null;
g.nextLevel = (n) => { finished = n; g.transitioning = true; };
g.onEndGame = () => { finished = 'end'; };
await g.start(levelFile(level));
g.freshRun();
if (params.has('at')) { const [x, y] = params.get('at').split(',').map(Number); g.teleportPlayer(x, y); g.cam.x = x - 160; g.cam.y = y - 115; }
setMsg('');

// ---- cameras ----
const CAMS = ['angled', 'side', 'first'];
let cam = CAMS.includes(params.get('cam')) ? params.get('cam') : 'angled';
let fpPitch = 0, fpFace = 1, fpTurn = 0; // first person: view pitch (deg, + is down), facing, sideways mouse travel
const D = 620; // distance of the outside cameras from the lane

function view(w, h) {
  const p = g.player;
  if (cam === 'first') {
    const eye = [2 * p.x, 0, -2 * (p.y - 25)];
    const fovY = (2 * Math.atan(Math.tan(Math.PI / 4) / (w / h)) * 180) / Math.PI;
    return { v: { eye, angles: [fpPitch, fpFace > 0 ? 0 : 180, 0] }, front: true, caps: false, fovY };
  }
  // Follow Abuse's own camera (its look-ahead and area pans): the centre of its 320x200 view.
  const cx = g.cam.x + 160, cy = g.cam.y + 100;
  const target = [2 * cx, 0, -2 * cy];
  const eye = cam === 'side' ? [target[0], -D, target[2]] : [target[0] - 0.22 * D, -0.92 * D, target[2] + 0.36 * D];
  return { v: { eye, target }, front: false, caps: true, fovY: 50 };
}

// ---- input: Abuse's keys reach the game through its own listeners; the mouse is ours ----
let mouse = null; // canvas pixels
canvas.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas) {
    fpPitch = Math.max(-80, Math.min(80, fpPitch + e.movementY * 0.15));
    fpTurn += e.movementX;
    if (fpTurn * fpFace < -60) { fpFace = -fpFace; fpTurn = 0; } // a flick the other way turns round
    if (fpTurn * fpFace > 0) fpTurn = 0;
  }
  const b = canvas.getBoundingClientRect();
  mouse = { x: (e.clientX - b.left) * devicePixelRatio, y: (e.clientY - b.top) * devicePixelRatio };
});
canvas.addEventListener('mousedown', (e) => {
  if (cam === 'first' && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
  if (e.button === 0) g.mouseDown = true;
  if (e.button === 2) g.rightDown = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) g.mouseDown = false; if (e.button === 2) g.rightDown = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { e.preventDefault(); g.cycleWeapon(e.deltaY > 0 ? 1 : -1); }, { passive: false });
addEventListener('keydown', (e) => {
  if (e.code === 'F3') { cam = CAMS[(CAMS.indexOf(cam) + 1) % CAMS.length]; if (cam !== 'first') document.exitPointerLock?.(); e.preventDefault(); }
  if (e.code === 'F2') { renderer.brightness = renderer.brightness >= 2 ? 1 : renderer.brightness + 0.5; e.preventDefault(); }
});

// The aim point, in level pixels: where the pointer meets the lane, or, in
// first person, straight along the view.
function aimPoint(w, h) {
  const p = g.player;
  if (params.has('aim')) { const [x, y] = params.get('aim').split(',').map(Number); return { x, y }; }
  if (cam === 'first') {
    const a = (fpPitch * Math.PI) / 180;
    return { x: p.x + fpFace * 200 * Math.cos(a), y: p.y - 15 + 200 * Math.sin(a) };
  }
  return mouse ? renderer.pick(mouse.x, mouse.y, w, h) : null;
}

// ---- the recorded run (Watch) ----
let watch = null;
async function startWatch() {
  const [ppo, demo] = await Promise.all([import('../sim/web/src/ppo.js'), fetch('../sim/web/data/ppo-demo.json').then((r) => r.json())]);
  const pieces = demo.pieces.filter((p) => p.levelIdx === level);
  if (!pieces.length) { setMsg('No recorded run for this level.'); return; }
  watch = { ppo, pieces, k: -1, i: 0, n: 0, acts: null, face: 1, act: 0, loading: false };
  g.demo = true; // the game ignores the keyboard while a recorded run plays
  await nextPiece();
}
async function nextPiece() {
  const w = watch;
  w.k++;
  if (w.k >= w.pieces.length) { watch = null; g.demo = false; return; }
  const piece = w.pieces[w.k];
  w.loading = true;
  await w.ppo.startRun(g, levelFile(level), piece.seed || null);
  w.acts = w.ppo.decodeActs(piece.acts);
  w.n = Math.min(piece.steps, w.acts.length * 4);
  w.i = 0;
  w.loading = false;
}
function watchStep() {
  const w = watch;
  if (w.loading) return;
  if (w.i >= w.n) { nextPiece(); return; }
  if (w.i % 4 === 0) { w.act = w.acts[w.i / 4]; const mv = (w.act % 3) - 1; if (mv !== 0) w.face = mv; }
  w.ppo.applyAction(g, w.act, w.face);
  g.update(STEP);
  w.i++;
}

// ---- the loop: fixed simulation steps, drawing every frame ----
let acc = 0, last = performance.now(), stillSteps = params.has('still') ? Number(params.get('still')) : -1;
let started = params.has('still') || params.has('watch');
startEl.hidden = started;
startEl.addEventListener('click', () => { started = true; startEl.hidden = true; });
if (params.has('watch')) startWatch();
document.getElementById('watch').addEventListener('click', (e) => { e.stopPropagation(); started = true; startEl.hidden = true; finished = null; setMsg(''); startWatch(); });

function frame(now) {
  const w = Math.floor(canvas.clientWidth * devicePixelRatio), h = Math.floor(canvas.clientHeight * devicePixelRatio);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  const aim = aimPoint(w, h);
  while (acc >= STEP) {
    acc -= STEP;
    if (finished !== null || !started) continue;
    if (stillSteps === 0) continue;
    if (stillSteps > 0) stillSteps--;
    if (watch) { watchStep(); continue; }
    if (aim) aimAt(g, Math.round(aim.x), Math.round(aim.y));
    g.update(STEP);
  }
  if (finished !== null && !msgEl.innerHTML) {
    const next = typeof finished === 'number' ? finished : null;
    setMsg(`<b>${name} complete</b><br><br><a href="?level=${level}&cam=${cam}">Play again</a>${next !== null ? ` · <a href="?level=${next}&cam=${cam}">Level ${next}</a>` : ''}`);
  }
  const vw = view(w, h);
  renderer.setAbuseLights(g.level.lights, g.ambient, g.lightsOn);
  const scene = collectScene(g);
  g.player.justFired = false; // game.js render clears it after drawing the flash
  renderer.frame(vw.v, w, h, { mode: 'abuse', front: vw.front, caps: vw.caps, fovY: vw.fovY, sprites: cam === 'first' ? scene.sprites.filter((sp) => !sp.player) : scene.sprites, boxes: scene.boxes, red: g.redRamp || 0 });
  g.updateHud();
  helpEl.textContent = g.helpText || '';
  helpEl.hidden = !g.helpText;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.body.dataset.ready = '1';
