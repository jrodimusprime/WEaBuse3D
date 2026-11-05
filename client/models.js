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

// ---- items: floating and turning, like Quake's ----
// where an item hangs: over its spot on the floor, bobbing, turning
function itemPose(s, ctx, lift = 14) {
  const { e, img } = s;
  const t = ctx.time / 1000;
  const yaw = t * 2.2 + (e.id || 0);
  const centre = [2 * (s.x + img.w / 2), ctx.depthOf(e), -2 * (s.y + img.h) + lift + Math.sin(t * 2.5 + (e.id || 0)) * 3];
  return { R: rotation(yaw), centre };
}

// HEALTH (hp_up): the sprite is a red heart with an orange gleam. A glossy heart: two lobes and a point.
function heart(s, ctx) {
  const parts = built('HEALTH', () => {
    const c = spriteColours(s.img, ctx.palette);
    const red = c.red, gleam = c.vivid;
    const m = new Mesh()
      .ellipsoid([-5, 0, 4], [7, 5, 7], 6, 10, red).ellipsoid([5, 0, 4], [7, 5, 7], 6, 10, red)
      .lathe([0, 0, -13], [[0, 0], [8, 9], [11, 15], [0, 17]], 10, red)
      .ellipsoid([-6, -4, 7], [2.5, 1.5, 2.5], 3, 6, gleam);
    return { m: m.done() };
  });
  const { R, centre } = itemPose(s, ctx, 18);
  return [{ mesh: parts.m, basis: R, offset: centre, bright: 1.25 }];
}

// MBULLET_ICON*: a clip of red shells in a tan holder. A holder with a row of shells standing in it.
function shells(s, ctx) {
  const parts = built(`shells:${s.e.type}`, () => {
    const c = spriteColours(s.img, ctx.palette);
    const m = new Mesh().box([0, 0, 2], [13, 5, 2], shade(c.light, 0.7));
    for (let i = -2; i <= 2; i++) m.cylinder([i * 5, 0, 4], 2, 10, 8, c.red).cylinder([i * 5, 0, 13], 2.2, 2, 8, [0.85, 0.7, 0.3]);
    return { m: m.done() };
  });
  const { R, centre } = itemPose(s, ctx, 6);
  return [{ mesh: parts.m, basis: R, offset: centre, bright: 1.15 }];
}

// GRENADE_ICON*: green grenades side by side. Grenades on a tray, each with its cap and pin ring.
function grenades(s, ctx) {
  const parts = built(`grenades:${s.e.type}`, () => {
    const c = spriteColours(s.img, ctx.palette);
    const m = new Mesh().box([0, 0, 1], [16, 7, 1], shade(c.dark, 1.4));
    for (const x of [-9, 0, 9]) m.ellipsoid([x, 0, 7], [4, 4, 5.5], 5, 8, c.vivid).cylinder([x, 0, 12], 1.6, 2.5, 6, [0.55, 0.55, 0.55]).torus([x + 2, 0, 15], 1.8, 0.5, 8, 4, [0.7, 0.7, 0.7]);
    return { m: m.done() };
  });
  const { R, centre } = itemPose(s, ctx, 6);
  return [{ mesh: parts.m, basis: R, offset: centre, bright: 1.15 }];
}

// ROCKET_ICON*: a single rocket with a red band. A rocket standing on its fins.
function rocketItem(s, ctx) {
  const parts = built(`rocket:${s.e.type}`, () => {
    const c = spriteColours(s.img, ctx.palette);
    const body = shade(c.light, 0.85);
    const m = new Mesh().lathe([0, 0, 4], [[3.2, 0], [3.2, 26], [2.2, 31], [0, 35]], 8, body).cylinder([0, 0, 18], 3.5, 4, 8, c.vivid);
    for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) m.box([x * 4.5, y * 4.5, 6], [x ? 2.5 : 0.6, y ? 2.5 : 0.6, 5], shade(c.dark, 1.5));
    return { m: m.done() };
  });
  const { R, centre } = itemPose(s, ctx, 2);
  return [{ mesh: parts.m, basis: R, offset: centre, bright: 1.15 }];
}

// any other weapon pick-up: an ammunition crate in the icon's colours, with a band and a lit emblem
function crate(s, ctx) {
  const parts = built(`crate:${s.e.type}`, () => {
    const c = spriteColours(s.img, ctx.palette);
    return { m: new Mesh().box([0, 0, 7], [10, 8, 7], shade(c.body, 1.1)).box([0, 0, 7], [10.5, 8.5, 1.5], shade(c.dark, 1.3)).box([0, -8.6, 10], [4, 0.5, 2.5], c.vivid).done() };
  });
  const { R, centre } = itemPose(s, ctx, 2);
  return [{ mesh: parts.m, basis: R, offset: centre, bright: 1.15 }];
}

// POWER_* (powerUp): the speed power is a dark module with heat-sink fins and a lightning bolt.
// A floating module: a slab with fins down one side and a glowing bolt on its face.
function powerModule(s, ctx) {
  const parts = built(`power:${s.e.type}`, () => {
    const c = spriteColours(s.img, ctx.palette);
    const m = new Mesh().box([0, 0, 0], [12, 4, 16], shade(c.dark, 1.4));
    for (let i = -6; i <= 6; i++) m.box([13, 0, i * 2.2], [3, 3.5, 0.6], shade(c.light, 0.6));
    const bolt = new Mesh().hexa([[-2, -4.6, 9], [3, -4.6, 9], [3, -5.2, 9], [-2, -5.2, 9], [-6, -4.6, 1], [-1, -4.6, 1], [-1, -5.2, 1], [-6, -5.2, 1]], [0.95, 0.95, 1])
      .hexa([[1, -4.6, 1], [6, -4.6, 1], [6, -5.2, 1], [1, -5.2, 1], [-3, -4.6, -9], [2, -4.6, -9], [2, -5.2, -9], [-3, -5.2, -9]], [0.95, 0.95, 1])
      .box([0, -4.9, 1], [5, 0.3, 1.2], [0.95, 0.95, 1]);
    return { m: m.done(), bolt: bolt.done() };
  });
  const { R, centre } = itemPose(s, ctx, 30);
  const pulse = 1.6 + 0.6 * Math.sin(ctx.time / 150);
  return [{ mesh: parts.m, basis: R, offset: centre }, { mesh: parts.bolt, basis: R, offset: centre, bright: pulse }];
}

// ---- on the back wall ----
const ON_WALL = rotation(0, 0, Math.PI / 2); // a lathe's axis (Z) turned to face out of the wall (-Y)

// POINTER: a yellow arrow pointing down and to the left. A thick sign on the wall.
function pointer(s, ctx) {
  const parts = built('POINTER', () => {
    const c = spriteColours(s.img, ctx.palette);
    const y = c.light;
    // an arrow pointing along +X in the wall's plane (X, Z), 4 units thick
    const m = new Mesh().box([-6, 0, 0], [9, 2, 3], y)
      .hexa([[3, -2, -9], [14, -2, 0], [14, 2, 0], [3, 2, -9], [3, -2, 9], [14, -2, 0.01], [14, 2, 0.01], [3, 2, 9]], y)
      .box([-6, 2.5, 0], [11, 0.5, 5], shade(c.dark, 1.5));
    return { m: m.done() };
  });
  // turned to point down and left, as drawn (135 degrees round in the wall's plane)
  const R = rotation(0, Math.PI * 0.75, 0);
  return [{ mesh: parts.m, basis: R, offset: [2 * (s.x + s.img.w / 2), ctx.lane - 6, -2 * (s.y + s.img.h / 2)], bright: 1.4 }];
}

// SWITCH_BALL: a red eye in an octagonal metal frame with four prongs; shooting it throws its switch.
// A target on the wall: an eight-sided plate, a rim, prongs and a glowing eye.
function switchBall(s, ctx) {
  const parts = built('SWITCH_BALL', () => {
    const c = spriteColours(s.img, ctx.palette);
    const metal = shade(c.light, 0.7);
    const frame = new Mesh().cylinder([0, 0, 0], 16, 4, 8, shade(c.dark, 1.5)).torus([0, 0, 4], 13, 2, 8, 4, metal);
    for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) frame.box([x * 19, y * 19, 2], [x ? 4 : 1.5, y ? 4 : 1.5, 2], metal);
    return { frame: frame.done(), eye: new Mesh().ellipsoid([0, 0, 5], [8, 8, 6], 6, 10, c.vivid).done() };
  });
  const at = [2 * (s.x + s.img.w / 2), ctx.lane - 2, -2 * (s.y + s.img.h / 2)];
  return [
    { mesh: parts.frame, basis: ON_WALL, offset: at },
    { mesh: parts.eye, basis: ON_WALL, offset: at, bright: 1.4 + 0.5 * Math.sin(ctx.time / 200) },
  ];
}

// ---- on the floor ----

// SPRING: a disc with an up arrow. A jump pad: a base, a coil, and a top with a raised arrow that
// springs up while it fires (running).
function springPad(s, ctx) {
  const parts = built('SPRING', () => {
    const c = spriteColours(s.img, ctx.palette);
    const base = new Mesh().lathe([0, 0, 0], [[12, 0], [12, 3], [10, 4], [0, 4]], 12, shade(c.dark, 1.4));
    for (let i = 0; i < 3; i++) base.torus([0, 0, 6 + i * 3], 7, 1.2, 10, 4, shade(c.light, 0.7));
    const top = new Mesh().lathe([0, 0, 0], [[11, 0], [11, 2], [0, 3]], 12, c.main)
      .box([0, -1, 3.4], [1.5, 5, 0.6], [0.85, 0.95, 1])
      .hexa([[-5, 3, 3.1], [5, 3, 3.1], [0, 8, 3.1], [0, 8, 3.1], [-5, 3, 4], [5, 3, 4], [0, 8, 4], [0, 8.01, 4]], [0.85, 0.95, 1]);
    return { base: base.done(), top: top.done() };
  });
  const x = 2 * (s.x + s.img.w / 2), d = ctx.depthOf(s.e), floor = -2 * (s.y + s.img.h);
  const up = s.e.state === 'running' ? 8 : 0;
  return [{ mesh: parts.base, basis: I3, offset: [x, d, floor] }, { mesh: parts.top, basis: I3, offset: [x, d, floor + 14 + up], bright: 1.2 }];
}

// NEXT_LEVEL / NEXT_LEVEL_TOP: the exit, a dark oval pad. A round exit pad with a red glowing ring
// and a centre that turns slowly; stand on it and press use.
function exitPad(s, ctx) {
  const parts = built(`exit:${s.e.type}`, () => {
    const c = spriteColours(s.img, ctx.palette);
    const R = s.img.w - 4;
    return {
      base: new Mesh().lathe([0, 0, 0], [[R, 0], [R, 5], [R - 6, 8], [0, 8]], 20, shade(c.body, 1.1)).done(),
      ring: new Mesh().torus([0, 0, 8], R - 10, 2.5, 20, 5, [0.9, 0.12, 0.08]).done(),
      core: new Mesh().box([0, 0, 9], [R * 0.45, 3, 0.6], shade(c.light, 0.9)).box([0, 0, 9], [3, R * 0.45, 0.6], shade(c.light, 0.9)).done(),
    };
  });
  const x = 2 * (s.x + s.img.w / 2), d = ctx.depthOf(s.e), floor = -2 * (s.y + s.img.h);
  return [
    { mesh: parts.base, basis: I3, offset: [x, d, floor] },
    { mesh: parts.ring, basis: I3, offset: [x, d, floor], bright: 1.6 + 0.5 * Math.sin(ctx.time / 250) },
    { mesh: parts.core, basis: rotation(ctx.time / 900), offset: [x, d, floor], bright: 1.2 },
  ];
}

// TELE_BEAM: a blue column of light that brightens and fades. A beam: a core and a glow, on a base ring.
function teleBeam(s, ctx) {
  const parts = built('TELE_BEAM', () => {
    const c = spriteColours(s.img, ctx.palette);
    const H = 2 * s.img.h;
    return {
      glow: new Mesh().cylinder([0, 0, 0], 12, H, 12, c.light).done(),
      core: new Mesh().cylinder([0, 0, 0], 5, H, 8, [0.9, 0.97, 1]).done(),
      base: new Mesh().torus([0, 0, 1], 14, 2, 14, 4, shade(c.light, 0.9)).done(),
    };
  });
  const x = 2 * (s.x + s.img.w / 2), d = ctx.depthOf(s.e), floor = -2 * (s.y + s.img.h);
  const f = Math.max(0, Math.min(1, ((s.e.fade ?? 12) - 4) / 8));
  return [
    { mesh: parts.base, basis: I3, offset: [x, d, floor], bright: 1.3 },
    { mesh: parts.glow, basis: I3, offset: [x, d, floor], bright: 1 + 0.6 * f },
    { mesh: parts.core, basis: I3, offset: [x, d, floor], bright: 1.2 + 1.2 * f },
  ];
}

// TP_DOOR (tpd_ai): a camouflaged dome that opens as you come near, showing its red-lit inside;
// press use in it to be sent to its twin. A pod: a base ring, a red-lit floor and a dome that lifts.
function pod(s, ctx) {
  const parts = built('TP_DOOR', () => {
    const c = spriteColours(s.img, ctx.palette);
    const R = s.img.w - 4;
    return {
      base: new Mesh().lathe([0, 0, 0], [[R, 0], [R, 10], [R - 4, 12], [0, 12]], 16, shade(c.dark, 1.5)).done(),
      inside: new Mesh().torus([0, 0, 12], R - 10, 2, 16, 4, [0.85, 0.1, 0.08]).cylinder([0, 0, 12], R - 14, 0.5, 16, shade(c.dark, 1.2)).done(),
      dome: new Mesh().lathe([0, 0, 0], [[R, 0], [R - 2, 22], [R * 0.75, 44], [R * 0.4, 58], [0, 62]], 16, c.body).done(),
    };
  });
  const x = 2 * (s.x + s.img.w / 2), d = ctx.depthOf(s.e), floor = -2 * (s.y + s.img.h);
  const n = s.e.frames?.().length || 5, open = Math.min(1, (s.e.frame || 0) / Math.max(1, n - 1));
  return [
    { mesh: parts.base, basis: I3, offset: [x, d, floor] },
    { mesh: parts.inside, basis: I3, offset: [x, d, floor], bright: 1 + open },
    { mesh: parts.dome, basis: I3, offset: [x, d, floor + 12 + open * 70] },
  ];
}

// ---- spanning the hall ----

// LAVA: a glowing strip, crusted, bubbling. A lava pool across the hall: a molten surface with dark
// crust plates and bubbles rising and bursting.
function lava(s, ctx) {
  const lane = ctx.lane;
  const parts = built(`lava:${s.img.w}`, () => {
    const c = spriteColours(s.img, ctx.palette);
    const hw = s.img.w;
    const surf = new Mesh().box([0, 0, -6], [hw, lane, 6], c.red).done();
    const crust = new Mesh();
    for (let i = 0; i < 9; i++) {
      const u = ((i * 37) % 17) / 17 - 0.5, v = ((i * 53) % 23) / 23 - 0.5;
      crust.box([u * hw * 1.6, v * lane * 1.8, 0.4], [6 + (i % 3) * 3, 10 + (i % 4) * 4, 0.6], shade(c.dark, 1.2));
    }
    return { surf, crust: crust.done(), bubble: new Mesh().ellipsoid([0, 0, 0], [4, 4, 3], 4, 8, c.vivid).done() };
  });
  const x = 2 * (s.x + s.img.w / 2), top = -2 * (s.y + s.img.h / 2);
  const t = ctx.time / 1000, id = s.e.id || 0;
  const out = [
    { mesh: parts.surf, basis: I3, offset: [x, 0, top], bright: 1.5 + 0.25 * Math.sin(t * 3 + id) },
    { mesh: parts.crust, basis: I3, offset: [x, 0, top], bright: 0.9 },
  ];
  for (let k = 0; k < 3; k++) {
    const phase = (t * 0.6 + k / 3 + id * 0.37) % 1;
    const bx = x + (((id * 7 + k * 13) % 11) / 11 - 0.5) * s.img.w * 1.4, by = (((id * 5 + k * 29) % 19) / 19 - 0.5) * lane * 1.6;
    out.push({ mesh: parts.bubble, basis: I3, offset: [bx, by, top - 2 + phase * 6], bright: 1.8 });
  }
  return out;
}

// HIDDEN_WALL* (hwall_ai, big_wall_ai): a section of wall that cracks as it is shot. Walls of stone
// blocks in the art's colours, across the hall, with mortar between; as it is damaged (its frames)
// the blocks shift, tilt out of line and the worst ones fall away.
function blockWall(s, ctx) {
  const { e, img } = s;
  const lane = ctx.lane;
  const frames = e.frames?.().length || 1, f = Math.min(frames - 1, Math.floor(e.frame || 0));
  const parts = built(`wall:${e.type}:${f}`, () => {
    const m = new Mesh();
    const bw = 10, bh = 5, cols = Math.max(1, Math.round(img.w / bw)), rows = Math.max(1, Math.round(img.h / bh)), slabs = 5;
    const dmg = frames > 1 ? f / (frames - 1) : 0;
    const colourAt = (cx, cy) => {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = cy * bh; y < (cy + 1) * bh && y < img.h; y++) for (let x = cx * bw; x < (cx + 1) * bw && x < img.w; x++) {
        const i = img.pix[y * img.w + x];
        if (!i) continue;
        r += ctx.palette[i * 3]; g += ctx.palette[i * 3 + 1]; b += ctx.palette[i * 3 + 2]; n++;
      }
      if (!n) return null;
      const col = [r / n / 255, g / n / 255, b / n / 255], l = 0.3 * col[0] + 0.59 * col[1] + 0.11 * col[2];
      return l < 0.3 ? shade(col, 0.3 / Math.max(l, 0.03)) : col; // the art is near black: lift it so the stones read
    };
    const unit = (2 * lane) / slabs;
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
      const col = colourAt(cx, cy);
      if (!col) continue;
      for (let k = 0; k < slabs; k++) {
        const h = ((cx * 73 + cy * 151 + k * 37 + 11) * 2654435761 >>> 0) / 4294967296; // a fixed hash per block
        if (dmg > 0.6 && h < dmg * 0.35) continue; // fallen out
        const jig = dmg * 4 * (h - 0.5);
        const x = 2 * (cx * bw + bw / 2) + jig, z = -2 * (cy * bh + bh / 2) - Math.abs(jig) * 0.5, y = -lane + unit * (k + 0.5) + jig * 2;
        m.box([x, y, z], [bw - 0.8, unit / 2 - 0.8, bh - 0.8], shade(col, 0.85 + 0.3 * h));
      }
    }
    return { m: m.done() };
  });
  return [{ mesh: parts.m, basis: I3, offset: [2 * s.x, 0, -2 * s.y] }];
}

// RESTART_POSITION (people.lsp restart_ai): a save terminal: a monitor of green text, a hand
// scanner and a keypad with a red lamp; saving turns the screen blue. On the back wall: a console
// with its screen, scanner plate, keypad buttons and lamp; walk up and press use.
function saveTerminal(s, ctx) {
  const parts = built('RESTART_POSITION', () => {
    const c = spriteColours(s.img, ctx.palette);
    const shell = shade(c.body, 1.1), dark = shade(c.dark, 1.4);
    const m = new Mesh()
      .box([0, -5, 14], [38, 5, 16], shell) // the monitor housing
      .box([-14, -6, -17], [10, 6, 11], shell).box([18, -6, -17], [14, 6, 11], shell) // scanner and keypad housings
      .box([0, -1.5, -2], [40, 1.5, 34], dark); // the backplate
    for (let r = 0; r < 4; r++) for (let q = 0; q < 3; q++) m.box([10 + q * 5, -12.6, -11 - r * 4.5], [1.8, 0.6, 1.6], shade(c.light, 0.8));
    const scanner = new Mesh().box([-14, -12.4, -17], [7, 0.5, 8], shade(c.main, 0.9)).box([-14, -12.6, -17], [4, 0.4, 5], shade(c.dark, 1.2)).done();
    const screen = (rgb) => {
      const sm = new Mesh().box([0, -10.3, 14], [33, 0.4, 12], shade(rgb, 0.35));
      for (let i = 0; i < 4; i++) sm.box([-8 + (i % 2) * 6, -10.8, 20 - i * 4.5], [20 - (i % 3) * 5, 0.3, 1], rgb);
      return sm.done();
    };
    return { m: m.done(), scanner, green: screen([0.45, 0.85, 0.4]), blue: screen([0.55, 0.75, 1]), lamp: new Mesh().box([27, -12.6, -9], [2.5, 0.6, 2], [0.95, 0.15, 0.1]).done() };
  });
  const used = s.e.aistate >= 1;
  const at = [2 * (s.x + s.img.w / 2), ctx.lane - 2, -2 * (s.y + s.img.h / 2)];
  return [
    { mesh: parts.m, basis: I3, offset: at },
    { mesh: parts.scanner, basis: I3, offset: at, bright: 1.1 },
    { mesh: used ? parts.blue : parts.green, basis: I3, offset: at, bright: 1.6 + 0.2 * Math.sin(ctx.time / 300) },
    { mesh: parts.lamp, basis: I3, offset: at, bright: (ctx.time / 500) % 2 < 1 ? 2 : 0.7 },
  ];
}

const BY_AI = {
  flyer_ai: drone, sdoor_ai: door, strap_door_ai: hatch, platform_ai: lift, switcher_ai: wallSwitch, switch_once_ai: wallSwitch,
  tp2_ai: teleporter, hp_up: heart, fast_ai: powerModule, fly_power_ai: powerModule, sneaky_power_ai: powerModule, health_power_ai: powerModule,
  weapon_icon_ai: crate, spring_ai: springPad, next_level_ai: exitPad, tele_beam_ai: teleBeam, tpd_ai: pod, lava_ai: lava,
  hwall_ai: blockWall, big_wall_ai: blockWall, restart_ai: saveTerminal,
};
const BY_TYPE = {
  WHO: drone, POINTER: pointer, SWITCH_BALL: switchBall,
  MBULLET_ICON5: shells, MBULLET_ICON20: shells, GRENADE_ICON2: grenades, GRENADE_ICON10: grenades, ROCKET_ICON2: rocketItem, ROCKET_ICON5: rocketItem,
};

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
