// Runs WEaBuse's simulation (sim/web/src/game.js Game) inside the 3D client.
//
// The Game is built exactly as WEaBuse's headless runner builds it
// (sim/web/tools/headless.mjs makeGame): its 2D renderer gets a WebGL stand-in
// that accepts every call and draws nothing, and autoPause hands the stepping
// to us. The game's own window key listeners still fill g.keys, so Abuse's
// controls work unchanged; the mouse is fed in by the 3D client (aimAt).
import { Game } from '../sim/web/src/game.js';

export const STEP = 1 / 60; // game.js STEP; logic ticks at 15 Hz inside update()

const nullGL = new Proxy({}, { get: () => () => 1 });
const nullCanvas = { getContext: () => nullGL, addEventListener: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 200 }) };

export async function createGame(hud = { textContent: '' }, { originalWeapons = true } = {}) {
  const g = new Game(nullCanvas, hud);
  const debug = console.debug;
  console.debug = () => {}; // the Lisp reader's notes
  try { await g.init(); } finally { console.debug = debug; }
  g.autoPause = true; // we call update()
  g.renderThrottle = Infinity; // and its own 2D render never runs
  // the weapons as the original has them (sim game.js originalWeapons: off in WEaBuse, whose recorded
  // runs were played with its own simplified ones; Jared: make them "align in functionality and damage")
  g.originalWeapons = originalWeapons;
  // lifts wait for their rider (sim game.js liftHold: a rider is drawn across the deck to where the shaft lets them
  // through, and a lift does not rise through a player half on it; Jared: "dont let it go up if you block it")
  g.liftWaits = true;
  return g;
}

export const levelFile = (n) => `level${String(n).padStart(2, '0')}.spe`;

// Points the player's aim at level pixel (x, y). The game reads the pointer as
// view coordinates plus its camera (game.js updatePlayer: mwx = mouse.x + cam.x),
// so this has to be set just before each update, against the camera of that moment.
export function aimAt(g, x, y) {
  g.mouse = { x: x - g.cam.x, y: y - g.cam.y };
}

// FNV-1a over the state that matters for play: the player, every object and
// every projectile, plus the random number generator. Exact float64 bytes.
const dv = new DataView(new ArrayBuffer(8));
export function stateHash(g) {
  let h = 0x811c9dc5;
  const num = (v) => {
    dv.setFloat64(0, typeof v === 'number' ? v : v ? 1 : 0, true);
    for (let i = 0; i < 8; i++) { h ^= dv.getUint8(i); h = Math.imul(h, 0x01000193) >>> 0; }
  };
  const p = g.player;
  [p.x, p.y, p.vx, p.vy, p.hp, p.dead, p.dir, p.aim, p.cooldown, g.rng, g.tickCount || 0, g.ambient].forEach(num);
  for (const e of g.entities) [e.x, e.y, e.hp, e.dead, e.aistate, e.frame, e.dir].forEach(num);
  for (const b of g.projs) [b.x, b.y, b.vx, b.vy].forEach(num);
  return h;
}
