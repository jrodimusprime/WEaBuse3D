// Designed 3D models (CLAUDE.md, 3D conversion rules). Each design reads its
// sprite's frames for what the thing is and its colours, and is posed from the
// simulation's state; it never changes the simulation.
//
// A design returns the parts to draw: {mesh, basis, offset, bright}. Meshes
// are built once per object type (in its sprite's colours) and reused; the
// pose is in the transforms. Anything without a design returns null and is
// drawn by the voxel placeholder (BACKLOG.md, "Models awaiting design").
import { Mesh, rotation, spriteColours, shade } from '../engine/mesh.js';

const I3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const meshes = new Map(); // type -> built meshes
const built = (key, make) => { if (!meshes.has(key)) meshes.set(key, make()); return meshes.get(key); };

// the fraction of the way through the object's current state (its frame over the state's frames)
function progress(e) {
  const n = e.def.states.get(e.state)?.length || 1;
  return n <= 1 ? 1 : Math.min(1, (Math.floor(e.frame) % n + 1) / n);
}

// ---- WHO: a hovercraft (jugger.lsp WHO, flyer_ai) ----
// The sprite is a flat craft side-on: a brown hull with an orange glowing
// thruster duct at each end; its narrower frames are the craft turning to face
// the other way. In 3D: a hull with a canopy, struts out to two ducted fans
// that glow, turning, banking and bobbing as it flies.
function drone(s, ctx) {
  const { e, img } = s;
  const parts = built('WHO', () => {
    const c = spriteColours(img, ctx.palette);
    const hull = new Mesh()
      .ellipsoid([0, 0, 0], [26, 15, 8], 6, 10, c.body)
      .ellipsoid([10, 0, 5], [11, 8, 5], 4, 8, shade(c.dark, 1.2)) // canopy
      .ellipsoid([-14, 0, -2], [10, 10, 6], 4, 8, shade(c.second, 0.9)) // engine bay
      .box([24, 0, -3], [8, 2, 2], shade(c.dark, 0.9)) // gun
      .box([0, 0, -9], [14, 3, 2], shade(c.second, 0.8)) // keel
      .box([-36, 0, 0], [10, 3, 2], shade(c.body, 0.8)).box([36, 0, 0], [10, 3, 2], shade(c.body, 0.8)) // struts
      .done();
    const duct = new Mesh().torus([0, 0, 0], 11, 3, 14, 6, c.vivid).done();
    const fan = new Mesh().box([0, 0, 0], [10, 1.5, 0.8], shade(c.dark, 0.7)).box([0, 0, 0], [1.5, 10, 0.8], shade(c.dark, 0.7)).done();
    const eye = new Mesh().box([0, 0, 0], [2, 2.5, 1.5], [1, 0.25, 0.1]).done();
    return { hull, duct, fan, eye };
  });
  const n = e.def.states.get(e.state)?.length || 1;
  // facing: turn_around frames swing the craft round; otherwise it faces its direction
  let yaw = e.dir > 0 ? 0 : Math.PI;
  if (e.state === 'turn_around') yaw += Math.PI * (1 - (Math.floor(e.frame) % n) / Math.max(1, n - 1));
  const bank = Math.max(-0.35, Math.min(0.35, (e.vx || 0) * 0.02 * (e.dir || 1)));
  const tilt = e.state === 'flinch_up' ? -0.5 : Math.max(-0.25, Math.min(0.25, (e.vy || 0) * 0.03));
  const t = ctx.time / 1000;
  const bob = Math.sin(t * 3 + (e.id || 0)) * 2.5;
  const R = rotation(yaw, tilt, bank);
  const centre = [2 * (s.x + img.w / 2), ctx.depthOf(e), -2 * (s.y + img.h / 2) + bob];
  const at = (local) => [0, 1, 2].map((k) => centre[k] + R[k] * local[0] + R[3 + k] * local[1] + R[6 + k] * local[2]);
  const spin = (a) => mul3(R, rotation(a));
  return [
    { mesh: parts.hull, basis: R, offset: centre },
    { mesh: parts.duct, basis: R, offset: at([48, 0, 0]), bright: 1.7 },
    { mesh: parts.duct, basis: R, offset: at([-48, 0, 0]), bright: 1.7 },
    { mesh: parts.fan, basis: spin(t * 25), offset: at([48, 0, 0]) },
    { mesh: parts.fan, basis: spin(-t * 25), offset: at([-48, 0, 0]) },
    { mesh: parts.eye, basis: R, offset: at([31, 0, -3]), bright: 2.2 },
  ];
}

// ---- the industrial kit: lifts, doors and trap doors share one design ----
// Jared: "the trap door should be like the elevator in design, also doors".
// All three are built from the lift's sprite colours: a bevelled metal slab
// with a tread plate and a yellow trim, and the trap door's yellow and black
// hazard stripes where something moves.
function kitColours(ctx) {
  return built('kit:colours', () => {
    const def = ctx.g.assets.defs.get('SMART_PLAT_SMALL');
    const img = def && ctx.g.assets.sprite(def.file, def.states.get('stopped')[0]);
    const c = img ? spriteColours(img, ctx.palette) : { main: [0.35, 0.35, 0.37], second: [0.5, 0.5, 0.52], dark: [0.12, 0.12, 0.13], light: [0.8, 0.8, 0.4] };
    return { metal: c.main, tread: shade(c.second, 1.05), under: shade(c.main, 0.75), trim: shade(c.light, 0.8), dark: shade(c.dark, 1.3), hazard: [0.92, 0.72, 0.12], black: [0.08, 0.08, 0.08], lamp: [1, 0.85, 0.3] };
  });
}

// hazard stripes: alternating yellow and black blocks from `from` to `to` along x or y, centred at `across`, height z
function stripes(m, axis, from, to, across, z, k, half = 3) {
  const n = Math.max(2, Math.round((to - from) / 8));
  for (let i = 0; i < n; i++) {
    const a = from + ((to - from) * i) / n, b = from + ((to - from) * (i + 1)) / n, mid = (a + b) / 2, hw = (b - a) / 2;
    const c = i % 2 ? k.black : k.hazard;
    if (axis === 'x') m.box([mid, across, z], [hw, half, 1], c); else m.box([across, mid, z], [half, hw, 1], c);
  }
}

// ---- lifts (platform.lsp, platform_ai) ----
// The sprite is a deck with sloped sides and a lamp in the middle. In 3D: a
// lift-sized deck, as deep as it is wide, with bevelled sides, a tread, a trim,
// an undercarriage and a lamp that lights while it runs.
function lift(s, ctx) {
  const { e } = s;
  const z = ctx.zoneOf(e), r = ctx.g.deckRect(e);
  if (!z || !r) return null;
  const parts = built(`lift:${e.type}`, () => {
    const k = kitColours(ctx);
    const hw = r.x1 - r.x0 + 1, hd = z.h; // half sizes in units (2 per pixel)
    const deck = new Mesh()
      .taper([0, 0, -14], [hw - 10, hd - 10], [hw, hd], -2, k.under)
      .box([0, 0, -1], [hw, hd, 1], k.metal)
      .box([0, 0, 0.4], [hw - 8, hd - 8, 0.5], k.tread)
      .box([hw - 2, 0, 0], [2, hd, 1.2], k.trim).box([-hw + 2, 0, 0], [2, hd, 1.2], k.trim)
      .box([0, hd - 2, 0], [hw, 2, 1.2], k.trim).box([0, -hd + 2, 0], [hw, 2, 1.2], k.trim)
      .box([0, 0, -20], [hw * 0.45, hd * 0.45, 6], k.dark)
      .done();
    const lamp = new Mesh().cylinder([0, 0, -27], 7, 4, 10, k.lamp).done();
    return { deck, lamp };
  });
  const x = r.x0 + r.x1 + 1, top = -2 * r.y0;
  return [
    { mesh: parts.deck, basis: I3, offset: [x, z.c, top] },
    { mesh: parts.lamp, basis: I3, offset: [x, z.c, top], bright: e.aistate === 3 ? 2 : 0.6 },
  ];
}

// ---- trap doors (doors.lsp, strap_door_ai) ----
// The sprite is a floor hatch with yellow and black chevrons that slides into
// its housing as it opens (49 px down to 31). In 3D: a hatch its own size in a
// hole its own size (the depth layer's floor zone), built like the lift's deck,
// with hazard stripes along its edges, dropping a little and sliding under the
// floor as it opens (running), open (blocking), closing (walking).
function hatch(s, ctx) {
  const { e } = s;
  const z = ctx.zoneOf(e);
  if (!z) return null;
  const parts = built(`hatch:${e.type}`, () => {
    const k = kitColours(ctx);
    const hw = z.x1 - z.x0 + 1, hd = z.h;
    const plate = new Mesh()
      .taper([0, 0, -10], [hw - 6, hd - 6], [hw, hd], -1, k.under)
      .box([0, 0, -0.5], [hw, hd, 0.5], k.metal)
      .box([0, 0, 0.4], [hw - 12, hd - 12, 0.5], k.tread);
    stripes(plate, 'x', -hw, hw, hd - 4, 0.6, k);
    stripes(plate, 'x', -hw, hw, -hd + 4, 0.6, k);
    stripes(plate, 'y', -hd + 8, hd - 8, hw - 4, 0.6, k);
    stripes(plate, 'y', -hd + 8, hd - 8, -hw + 4, 0.6, k);
    const rim = new Mesh()
      .box([0, hd + 2, -4], [hw + 4, 2, 4], k.trim).box([0, -hd - 2, -4], [hw + 4, 2, 4], k.trim)
      .box([hw + 2, 0, -4], [2, hd, 4], k.trim).box([-hw - 2, 0, -4], [2, hd, 4], k.trim)
      .done();
    return { plate: plate.done(), rim, hw };
  });
  const open = e.state === 'blocking' ? 1 : e.state === 'running' ? progress(e) : e.state === 'walking' ? 1 - progress(e) : 0;
  const x = z.x0 + z.x1 + 1, top = -2 * z.y0;
  return [
    { mesh: parts.plate, basis: I3, offset: [x - open * 2 * parts.hw, z.c, top - Math.min(1, open * 4) * 3] },
    { mesh: parts.rim, basis: I3, offset: [x, z.c, top] },
  ];
}

// ---- doors (doors.lsp, sdoor_ai) ----
// The sprite is a panel in a frame whose middle block lifts, showing lit strips
// below. In 3D: a door-sized panel in its doorway, built like the lift (metal,
// tread plate, yellow trim, a lamp) with hazard stripes along its foot,
// sliding up into the lintel as it opens: running opens, blocking is open,
// walking closes. Frame posts stand at the edges of the opening.
function door(s, ctx) {
  const { e, img } = s;
  const z = ctx.zoneOf(e);
  if (!z) return null;
  const parts = built(`door:${e.type}`, () => {
    const k = kitColours(ctx);
    const H = 2 * img.h, D = z.h - 2;
    const panel = new Mesh()
      .box([0, 0, H / 2], [6, D, H / 2], k.metal)
      .box([0, 0, H / 2], [7, D - 8, H / 2 - 10], k.tread)
      .box([0, D - 3, H / 2], [7.5, 3, H / 2], k.trim).box([0, -D + 3, H / 2], [7.5, 3, H / 2], k.trim)
      .box([0, 0, H - 3], [7.5, D, 3], k.trim)
      .box([0, 0, H * 0.55], [8, 10, 4], k.lamp);
    stripes(panel, 'y', -D, D, 0, 4, k, 7.5);
    const post = new Mesh().taper([0, 0, 0], [12, 6], [10, 5], H, k.dark).box([0, 0, H / 2], [12.5, 2, H / 2 - 6], k.trim).done();
    const strip = new Mesh().box([0, 0, 1], [6, D - 6, 1], k.lamp).done();
    return { panel: panel.done(), post, strip, H };
  });
  const open = e.state === 'blocking' ? 1 : e.state === 'running' ? progress(e) : e.state === 'walking' ? 1 - progress(e) : 0;
  const x = 2 * (s.x + img.w / 2), floor = -2 * (s.y + img.h);
  return [
    { mesh: parts.panel, basis: I3, offset: [x, z.c, floor + open * (parts.H - 6)] },
    { mesh: parts.post, basis: I3, offset: [x, z.c - z.h - 2, floor] },
    { mesh: parts.post, basis: I3, offset: [x, z.c + z.h + 2, floor] },
    ...(open > 0.05 ? [{ mesh: parts.strip, basis: I3, offset: [x, z.c, floor], bright: 1 + open }] : []),
  ];
}

// ---- switches (switch.lsp, switcher_ai) ----
// The sprite is a small box with a green and a red lamp. In 3D: a panel on the
// back wall with a bezel and the two lamps; green lit while it is on.
function wallSwitch(s, ctx) {
  const { e, img } = s;
  const parts = built(`switch:${e.type}`, () => {
    const c = spriteColours(img, ctx.palette);
    return {
      plate: new Mesh().box([0, 0, 0], [15, 4, 13], shade(c.main, 0.9)).box([0, -4.5, 0], [12, 1, 10], shade(c.dark, 1.1)).done(),
      green: new Mesh().box([0, 0, 0], [6, 2, 4], [0.2, 0.9, 0.3]).done(),
      red: new Mesh().box([0, 0, 0], [6, 2, 4], [0.95, 0.15, 0.1]).done(),
    };
  });
  const on = e.aistate === 1 || e.aistate === 2 || e.aistate === 3;
  const x = 2 * (s.x + img.w / 2), zc = -2 * (s.y + img.h / 2), y = ctx.lane - 4;
  return [
    { mesh: parts.plate, basis: I3, offset: [x, y, zc] },
    { mesh: parts.green, basis: I3, offset: [x, y - 6, zc + 5], bright: on ? 2 : 0.45 },
    { mesh: parts.red, basis: I3, offset: [x, y - 6, zc - 5], bright: on ? 0.45 : 2 },
  ];
}

// ---- teleporters (teleport.lsp, tp2_ai) ----
// The sprite is a round pad seen at an angle, with a rim, crackling while it
// teleports. In 3D: a round pad on the floor at its spot, with a rim, a glowing
// disc and, while it runs, a column of light.
function teleporter(s, ctx) {
  const { e, img } = s;
  const pad = ctx.g.solids.find((q) => q.e === e);
  const parts = built(`tele:${e.type}`, () => {
    const c = spriteColours(img, ctx.palette);
    const R = img.w - 2;
    return {
      base: new Mesh().lathe([0, 0, 0], [[R, 0], [R, 6], [R - 4, 10], [0, 10]], 16, shade(c.main, 0.9)).done(),
      rim: new Mesh().torus([0, 0, 10], R - 3, 2.5, 18, 5, c.light).done(),
      disc: new Mesh().cylinder([0, 0, 10], R - 7, 1, 16, [0.55, 0.85, 1]).done(),
      beam: new Mesh().cylinder([0, 0, 12], R - 10, 90, 10, [0.6, 0.9, 1]).done(),
    };
  });
  const x = 2 * e.x, top = pad ? -2 * pad.y0 - 10 : -2 * e.y;
  const d = ctx.depthOf(e);
  const running = e.state === 'running';
  const flick = running ? 1.2 + 0.8 * Math.abs(Math.sin(ctx.time / 60)) : 1;
  return [
    { mesh: parts.base, basis: I3, offset: [x, d, top] },
    { mesh: parts.rim, basis: I3, offset: [x, d, top], bright: 1.3 },
    { mesh: parts.disc, basis: I3, offset: [x, d, top], bright: running ? 2.2 * flick : 1.1 },
    ...(running && Math.floor(ctx.time / 80) % 2 ? [{ mesh: parts.beam, basis: I3, offset: [x, d, top], bright: 1.6 }] : []),
  ];
}

const BY_AI = { flyer_ai: drone, sdoor_ai: door, strap_door_ai: hatch, platform_ai: lift, switcher_ai: wallSwitch, switch_once_ai: wallSwitch, tp2_ai: teleporter };
const BY_TYPE = { WHO: drone };

// The designed parts for a scene sprite of an object, or null for the placeholder.
export function design(s, ctx) {
  const e = s.e;
  if (!e) return null;
  const fn = BY_TYPE[e.type] || BY_AI[e.ai];
  return fn ? fn(s, ctx) : null;
}

export const designed = (e) => !!(BY_TYPE[e.type] || BY_AI[e.ai]);

function mul3(a, b) {
  const o = new Float32Array(9);
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) o[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2];
  return o;
}
