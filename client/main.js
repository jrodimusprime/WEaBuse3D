// First-person walk through a compiled level: pointer-lock mouse look, WASD,
// jump, on Quake's movement physics at a fixed tick, drawn with interpolation.
//
// URL options (for screenshots and tests):
//   ?level=0            which level (web/maps/levelNN.bsp)
//   ?at=x,y             start at Abuse pixel (x, y) (feet), instead of the level's start
//   ?origin=X,Y,Z       start at this Quake-unit origin
//   ?yaw=deg&pitch=deg  initial view
//   ?still=1            no input; just draw (screenshots)
//   ?bright=1.6         lightmap brightness
import { loadBSP } from '../engine/bsp.js';
import { Renderer } from '../engine/render.js';
import { newPlayer, playerTick, makeCommand, FRAMETIME, VIEW_HEIGHT, onGround } from '../engine/move.js';
import { fromDegrees } from '../engine/detmath.js';
import { boxInSolid } from '../engine/trace.js';

const params = new URLSearchParams(location.search);
const level = Number(params.get('level') || 0);
const canvas = document.getElementById('view');
const hud = document.getElementById('hud');
const help = document.getElementById('help');

const gl = canvas.getContext('webgl2', { antialias: false });
if (!gl) { help.textContent = 'This browser has no WebGL2.'; throw new Error('no webgl2'); }

const name = `level${String(level).padStart(2, '0')}`;
const [bspBuf, palBuf] = await Promise.all([
  fetch(`maps/${name}.bsp`).then((r) => r.arrayBuffer()),
  fetch('maps/palette.lmp').then((r) => r.arrayBuffer()),
]);
const world = loadBSP(new Uint8Array(bspBuf));
const renderer = new Renderer(gl);
renderer.load(world, new Uint8Array(palBuf));
if (params.has('bright')) renderer.brightness = Number(params.get('bright'));
const scale = Number(world.entities[0]._abuse_scale || 2);

// where to start
let origin = world.entities.find((e) => e.classname === 'info_player_start').origin.split(' ').map(Number);
if (params.has('at')) {
  const [x, y] = params.get('at').split(',').map(Number);
  origin = [scale * x, 0, -scale * y + 24 + 1];
}
if (params.has('origin')) origin = params.get('origin').split(',').map(Number);
const player = newPlayer(origin);
let yaw = Number(params.get('yaw') || 0), pitch = Number(params.get('pitch') || 0);
let prev = player.origin.slice();
const still = params.has('still');

// input
const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.code === 'F2') { renderer.brightness = renderer.brightness >= 2 ? 1 : renderer.brightness + 0.5; e.preventDefault(); }
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
canvas.addEventListener('click', () => { if (!still) canvas.requestPointerLock?.(); });
document.addEventListener('pointerlockchange', () => { help.hidden = document.pointerLockElement === canvas; });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  // cl_main.c / in_win.c: m_yaw 0.022, m_pitch 0.022, sensitivity 3; pitch clamped (cl_pitchdown 80, cl_pitchup 70)
  yaw -= e.movementX * 0.022 * 3;
  pitch = Math.max(-70, Math.min(80, pitch + e.movementY * 0.022 * 3));
});

const down = (...codes) => (codes.some((c) => keys.has(c)) ? 1 : 0);
function command() {
  if (still) return makeCommand({ yaw: fromDegrees(yaw), pitch: fromDegrees(pitch) });
  return makeCommand({
    fwd: down('KeyW', 'ArrowUp'), back: down('KeyS', 'ArrowDown'),
    left: down('KeyA', 'ArrowLeft'), right: down('KeyD', 'ArrowRight'),
    run: !!down('ShiftLeft', 'ShiftRight'), jump: !!down('Space'),
    yaw: fromDegrees(yaw) & 0xffff, pitch: fromDegrees(pitch),
  });
}

// fixed tick, interpolated drawing
let acc = 0, last = performance.now(), frames = 0, fps = 0, fpsT = last;
function frame(now) {
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  while (acc >= FRAMETIME) {
    prev = player.origin.slice();
    if (!still) playerTick(world, player, command());
    acc -= FRAMETIME;
  }
  const a = acc / FRAMETIME;
  const eye = [0, 1, 2].map((i) => prev[i] + (player.origin[i] - prev[i]) * a);
  eye[2] += VIEW_HEIGHT;
  const w = Math.floor(canvas.clientWidth * devicePixelRatio), h = Math.floor(canvas.clientHeight * devicePixelRatio);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const fovY = (2 * Math.atan(Math.tan(Math.PI / 4) / (w / h)) * 180) / Math.PI; // CalcFov for fov 90
  renderer.frame({ eye, angles: [pitch, yaw, 0] }, w, h, { mode: 'lightmap', front: true, caps: false, fovY });
  frames++;
  if (now - fpsT > 500) { fps = Math.round((frames * 1000) / (now - fpsT)); frames = 0; fpsT = now; }
  const px = Math.round(player.origin[0] / scale), py = Math.round(-(player.origin[2] - 24) / scale);
  hud.textContent = `${name}  ·  Abuse (${px}, ${py})  ·  depth ${player.origin[1].toFixed(0)}  ·  ${onGround(player) ? 'ground' : 'air'}${boxInSolid(world, player.origin, [-16, -16, -24], [16, 16, 32]) ? ' · STUCK' : ''}  ·  ${fps} fps  ·  ${renderer.triangles} tris`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.body.dataset.ready = '1';
