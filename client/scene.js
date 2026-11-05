// What WEaBuse would draw this frame, as a list in level pixels instead of
// pixels on a 320x200 screen. The 3D renderer turns each entry into a voxel
// model (sprites) or a small box (bullets, plasma, beams).
//
// This mirrors the object part of sim/web/src/game.js render() — the entity
// loop, the player's legs and gun, the projectiles and the middle-drawn
// effects — in the same order and with the same rules. It reads simulation
// state and changes none of it (game.js render() itself clears p.justFired,
// a drawing-only flag; here it is left for the game's own render to clear,
// which never runs, so it is cleared by the caller after drawing instead).
import { isHiddenInPlay } from '../sim/web/src/behaviors.js';
import { WEAPONS, drawProjectiles } from '../sim/web/src/weapons.js';

const MIDDLE_DRAW = new Set(['exp_draw', 'middle_draw']); // game.js
const POWER_STATES = new Set(['stopped', 'running', 'start_run_jump', 'run_jump', 'run_jump_fall', 'end_run_jump']); // game.js
const TICK = 1 / 15;

// One sprite: `img` (palette pixels), its top-left corner in level pixels,
// mirrored or not, and how bright (the player's muzzle flash).
// One box: a palette colour over a pixel rectangle (bullets, plasma, beams).
export function collectScene(g) {
  const sprites = [], boxes = [];
  const lv = g.level;
  if (!lv || !g.player) return { sprites, boxes };
  const alpha = Math.min(1, g.tickAcc / TICK);
  const blit = (def, stateName, frame, x, y, dir, middle = false, tint = null, bright = 1) => {
    const frames = def.states.get(stateName) || def.states.get('stopped');
    if (!frames || !def.file) return;
    let img = g.assets.sprite(def.file, frames[Math.floor(frame) % frames.length]);
    if (!img) return;
    if (tint) img = g.assets.tinted(img, tint);
    const ox = dir < 0 ? img.w - img.xcfg - 1 : img.xcfg; // game.js blit
    const yy = middle ? y + img.h / 2 : y;
    sprites.push({ img, x: Math.round(x - ox), y: Math.round(yy - img.h + 1), flip: dir < 0, bright, id: def.name });
  };

  const fx = [];
  for (const e of g.entities) {
    if (e.dead || e.hidden) continue;
    const still = e.ai === 'platform_ai';
    const x = still ? e.x : e.px + (e.x - e.px) * alpha, y = still ? e.y : e.py + (e.y - e.py) * alpha;
    if (isHiddenInPlay(e.def)) continue;
    if (e.ai === 'tele_beam_ai' && e.fade < 8 && (g.tickCount & 1)) continue;
    if (e.ai === 'boss_ai' && e.fade > 0 && (g.tickCount * 5 + e.id) % 14 < e.fade) continue;
    if (MIDDLE_DRAW.has(e.def.funs.get('draw_fun'))) { fx.push([e, x, y]); continue; }
    blit(e.def, e.state, e.frame, x, y, e.dir, false, g.assets.tintFor(e));
    if (e.a.beam) {
      const { x0, x1, y0, y1 } = e.a.beamRect; // game.js drawBeam
      const flick = (g.tickCount || 0) % 3;
      boxes.push({ x: Math.round((x0 + x1) / 2) - 1, y: Math.round(y0), w: 3, h: Math.round(y1 - y0), idx: flick ? g.colors.cyan : g.colors.white });
    }
  }

  const p = g.player;
  const body = g.assets.defs.get('DARNEL');
  const bright = p.justFired ? 1.8 : 1;
  const pre = p.power === 'FAST' ? 'fast_' : p.power === 'FLY' ? 'fly_' : '';
  const drawState = pre && POWER_STATES.has(p.state) && body?.states.has(pre + p.state) ? pre + p.state : p.state;
  if (body) blit(body, p.dead ? 'dead' : drawState, p.anim, p.x, p.y, p.dir, false, null, bright);
  const top = !p.dead && g.assets.defs.get(WEAPONS[p.weapon]?.top);
  if (top && !p.climbing) {
    const bf = body.states.get(drawState) || body.states.get('stopped');
    const bimg = bf ? g.assets.sprite(body.file, bf[Math.floor(p.anim) % bf.length]) : null;
    const topY = p.y + 29 - (bimg?.h || 29);
    blit(top, 'stopped', p.aim, p.dir > 0 ? p.x : p.x + 4, topY, 1, false, null, bright);
  }

  // projectiles: weapons.js drawProjectiles, through a recorder in place of the renderer
  const cx = Math.floor(g.cam.x), cy = Math.floor(g.cam.y);
  const recorder = {
    draw: (img, x, y, { flip = false } = {}) => sprites.push({ img, x: x + cx, y: y + cy, flip, bright: 1, id: 'proj' }),
    rect: (x, y, w, h, idx) => boxes.push({ x: x + cx, y: y + cy, w, h, idx }),
  };
  drawProjectiles({ ...g, r: recorder, cam: g.cam, projs: g.projs, colors: g.colors, assets: g.assets }, alpha);
  for (const [e, x, y] of fx) blit(e.def, e.state, e.frame, x, y, e.dir, true);
  return { sprites, boxes };
}
