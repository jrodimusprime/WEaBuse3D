// The weapon in the cop's hands, drawn in front of the eye like Quake's view
// model (Jared: "cant see player hands or the weapon theyre holding"). One
// designed model per Abuse weapon (weapons.js WEAPON_ORDER), held in two gloved
// hands with the sleeves of the cop's armour (colours from DARNEL's sprite).
//
// Model space: X forward along the barrel, Y to the left, Z up; the origin is
// the grip. The renderer draws it after clearing depth, so it never sinks into
// a wall. It bobs while the cop runs and kicks back with a muzzle flash when he
// fires. Presentation only: it reads the simulation and never changes it.
import { Mesh, spriteColours, shade } from '../engine/mesh.js';

const cache = new Map();
const built = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };

function copColours(g, palette) {
  return built('cop', () => {
    const def = g.assets.defs.get('DARNEL');
    const img = def && g.assets.sprite(def.file, def.states.get('stopped')[0]);
    const c = img ? spriteColours(img, palette) : { body: [0.4, 0.38, 0.35], dark: [0.12, 0.1, 0.1], light: [0.8, 0.75, 0.7] };
    return { sleeve: shade(c.body, 1.05), glove: shade(c.dark, 1.6), cuff: shade(c.light, 0.6) };
  });
}

// two hands: one on the grip, one on the fore-grip at `fore` units ahead; sleeves run back out of view
function hands(m, k, fore, foreZ = -1) {
  m.ellipsoid([0, 0, -2], [4, 3.2, 3.5], 4, 8, k.glove) // the hand on the grip
    .box([-9, 1, -6], [9, 3.5, 3.5], k.sleeve).box([-1, 1, -4.5], [1.5, 3.8, 3.8], k.cuff); // its sleeve and cuff
  m.ellipsoid([fore, 4, foreZ], [4, 3.2, 3.2], 4, 8, k.glove) // the hand under the barrel
    .hexa([[fore - 26, 14, foreZ - 5], [fore - 2, 6, foreZ - 4], [fore - 2, 9, foreZ - 4], [fore - 26, 19, foreZ - 5],
      [fore - 26, 14, foreZ + 2], [fore - 2, 6, foreZ + 2], [fore - 2, 9, foreZ + 2], [fore - 26, 19, foreZ + 2]], k.sleeve);
  return m;
}

// The guns, from Abuse's own weapon art (the cop's arms holding each gun, weapons.js WEAPONS[w].top, and
// the status bar's bweap icons): the machine gun is silver, slim, with a long thin barrel and a skeleton
// stock; the plasma gun olive green and chunky; the grenade launcher green with a red tip; the rocket
// launcher a dark grey tube; the firebomb thrower gold; the death frisbee dark red and bulky; the light
// saber a red blade. Each is built with the detail of a Quake-era view model.
const C = {
  silver: [0.68, 0.7, 0.74], steel: [0.42, 0.44, 0.48], gun: [0.16, 0.16, 0.18], black: [0.07, 0.07, 0.08],
  olive: [0.36, 0.44, 0.2], oliveDark: [0.22, 0.27, 0.12], green: [0.3, 0.5, 0.22], red: [0.8, 0.12, 0.08],
  gold: [0.85, 0.62, 0.15], goldDark: [0.5, 0.35, 0.08], maroon: [0.45, 0.08, 0.08], cyan: [0.45, 0.9, 1],
  hazard: [0.92, 0.72, 0.12], led: [1, 0.15, 0.1], white: [0.95, 0.95, 0.95],
};

// rings along a barrel (cooling fins, a shroud's ribs): n tori from x0 to x1
function ribs(m, x0, x1, n, r, z, rgb, y = 0) {
  for (let i = 0; i < n; i++) {
    const x = x0 + ((x1 - x0) * i) / Math.max(1, n - 1);
    m.cylinderX([x - 0.5, y, z], r, 1, 10, rgb);
  }
  return m;
}

const DESIGNS = {
  MGUN: (k) => {
    const m = new Mesh()
      .taper([6, 0, -1], [11, 2.6], [10, 2.2], 6.5, C.silver) // receiver, bevelled
      .box([6, 0, 7], [9, 1.2, 0.6], C.steel); // top rail
    for (let i = 0; i < 6; i++) m.box([0 + i * 3, 0, 7.8], [0.6, 1.3, 0.4], C.gun); // rail notches
    m.cylinderX([16, 0, 3], 2.6, 10, 12, C.steel); // shroud
    ribs(m, 17, 25, 5, 2.9, 3, C.gun);
    m.cylinderX([26, 0, 3], 1, 14, 10, C.gun) // the long thin barrel
      .box([40.5, 0, 3], [1.5, 1.6, 1.6], C.gun).box([41, 0, 4.8], [1.2, 0.3, 0.3], C.black).box([41, 0, 1.2], [1.2, 0.3, 0.3], C.black) // muzzle brake and its slots
      .box([36, 0, 5], [0.4, 0.4, 1.4], C.silver) // front sight post
      .hexa([[6, -1.4, -1], [9, -1.4, -1], [9, 1.4, -1], [6, 1.4, -1], [7, -1.4, -9], [10, -1.4, -8], [10, 1.4, -8], [7, 1.4, -9]], C.gun) // curved magazine
      .box([0, 0, -3], [2, 1.8, 3.5], C.gun) // grip
      .box([3.5, 0, -3.5], [2, 0.4, 0.4], C.steel) // trigger guard
      .box([-7, 0, 4.5], [5, 0.4, 0.4], C.silver).box([-7, 0, 0], [5, 0.4, 0.4], C.silver).box([-11.5, 0, 2.2], [0.5, 0.5, 3], C.silver) // skeleton stock
      .box([8, -2.8, 3], [0.8, 0.3, 0.8], C.led); // status light
    return { m: hands(m, k, 14).done(), muzzle: 42 };
  },
  PGUN: (k) => {
    const m = new Mesh()
      .taper([6, 0, -2], [13, 3.4], [11, 2.8], 7, C.olive)
      .box([6, 0, 7.3], [10, 2, 0.5], C.oliveDark);
    for (let i = 0; i < 7; i++) m.box([0 + i * 2.6, 0, 8.2], [0.5, 2.2, 0.6], C.oliveDark); // heat ribs
    m.cylinderX([17, 0, 3], 3, 10, 10, C.steel) // the chamber housing
      .box([30, 1.8, 3], [3, 0.6, 0.6], C.steel).box([30, -1.8, 3], [3, 0.6, 0.6], C.steel) // emitter prongs
      .box([0, 0, -3], [2, 1.8, 3.5], C.gun).box([10, 0, -2.5], [3, 2.6, 1.2], C.oliveDark);
    const glow = new Mesh().cylinderX([17.5, 0, 3], 1.6, 10.5, 8, C.cyan);
    for (const x of [19, 22, 25]) glow.torus([x, 0, 3], 3.3, 0.6, 10, 4, C.cyan);
    glow.box([33, 0, 3], [0.8, 0.8, 0.8], C.cyan);
    return { m: hands(m, k, 14).done(), glow: glow.done(), muzzle: 34 };
  },
  GRENADE: (k) => {
    const m = new Mesh().cylinderX([2, 0, 4], 3.4, 24, 12, C.green)
      .cylinderX([26, 0, 4], 3.9, 2, 12, C.red) // red tip
      .cylinderX([4, 0, -1.5], 4.8, 8, 12, C.oliveDark); // the drum
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; m.cylinderX([3.6, Math.cos(a) * 3.2, -1.5 + Math.sin(a) * 3.2], 1.1, 8.8, 6, C.gun); }
    for (let i = 0; i < 5; i++) m.box([14 + i * 2, 0, 0.2], [0.6, 3, 0.8], C.gun); // pump ribs
    m.box([0, 0, -4], [2, 1.8, 3.5], C.gun).box([20, 0, 8.4], [0.4, 1.5, 1], C.steel); // grip, leaf sight
    return { m: hands(m, k, 16, -2).done(), muzzle: 28 };
  },
  ROCKET: (k) => {
    const m = new Mesh().cylinderX([-12, 0, 6], 3.8, 38, 12, C.steel)
      .cylinderX([-16, 0, 6], 5, 4, 12, C.gun) // flared exhaust
      .cylinderX([24, 0, 6], 4.6, 3, 12, C.gun) // front lip
      .box([6, 3.6, 12], [4, 1.4, 2], C.gun).box([10.2, 3.6, 12], [0.3, 0.9, 1], C.led) // scope and its red dot
      .box([0, 0, -1], [2, 1.8, 4], C.gun).box([-4, 0, 0], [1.5, 1.6, 2.5], C.gun);
    for (let i = 0; i < 4; i++) m.cylinderX([14 + i * 1.6, 0, 6], 3.95, 1.6, 12, i % 2 ? C.black : C.hazard); // hazard band
    const warhead = new Mesh().cylinderX([22, 0, 6], 2.4, 3, 8, C.white).cylinderX([25, 0, 6], 1.6, 1.5, 8, C.red).done();
    return { m: hands(m, k, 12, 1).done(), extra: warhead, muzzle: 28 };
  },
  FIREBOMB: (k) => {
    const m = new Mesh().taper([6, 0, -1], [11, 2.8], [9, 2.4], 6, C.gold)
      .cylinderX([16, 0, 3], 1.8, 12, 8, C.goldDark).box([28.5, 0, 3], [1.5, 2, 2], C.gun)
      .cylinderX([2, 3.2, -4], 2.6, 12, 10, C.red).cylinderX([2, -3.2, -4], 2.6, 12, 10, C.red) // twin fuel canisters
      .box([0, 0, -3], [2, 1.8, 3.5], C.gun);
    const glow = new Mesh().ellipsoid([31, 0, 3], [1.6, 1.2, 1.6], 3, 6, [1, 0.55, 0.15]).done(); // the pilot flame
    return { m: hands(m, k, 13).done(), glow, muzzle: 31 };
  },
  DFRIS: (k) => {
    const m = new Mesh().taper([7, 0, -2], [13, 4], [11, 3.4], 6, C.maroon)
      .box([7, 0, 4.5], [12, 4.2, 0.6], C.gun);
    for (let i = 0; i < 4; i++) m.box([2 + i * 4, -4.3, 1], [1, 0.3, 2.5], C.black); // vents
    m.box([0, 0, -4], [2, 1.8, 3.5], C.gun);
    const disc = new Mesh().cylinder([0, 0, 0], 8, 1.2, 12, C.silver);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; disc.box([Math.cos(a) * 8.5, Math.sin(a) * 8.5, 0.6], [1.6, 0.6, 0.5], C.steel); }
    return { m: hands(m, k, 12).done(), disc: disc.done(), discAt: [14, 0, 5.4], muzzle: 24 };
  },
  LSABER: (k) => {
    const m = new Mesh().cylinderX([-2, 0, 2], 1.9, 11, 10, C.silver);
    ribs(m, -1, 7, 5, 2.1, 2, C.gun);
    m.cylinderX([9, 0, 2], 2.6, 1.5, 10, C.steel);
    const glow = new Mesh().cylinderX([10.5, 0, 2], 1.1, 36, 8, [1, 0.25, 0.2]).cylinderX([10.5, 0, 2], 0.6, 36.5, 6, [1, 0.85, 0.8]).done();
    return { m: hands(m, k, 5).done(), glow, muzzle: 46 };
  },
};

const flashMesh = () => built('flash', () => new Mesh().box([0, 0, 0], [3, 0.6, 0.6], [1, 0.9, 0.5]).box([0, 0, 0], [0.6, 3, 0.6], [1, 0.9, 0.5]).box([0, 0, 0], [0.6, 0.6, 3], [1, 0.9, 0.5]).ellipsoid([0, 0, 0], [2.4, 2.4, 2.4], 3, 6, [1, 0.95, 0.7]).done());

// The view model's parts in view space (X forward, Y left, Z up), posed for this frame:
// `fired` (the cop fired since the last frame), `run` (0-1, how fast he is going), `t` (ms).
export function viewModel(g, palette, { fired, run, t }) {
  const w = g.player.weapon in DESIGNS ? g.player.weapon : 'MGUN';
  const parts = built(`w:${w}`, () => DESIGNS[w](copColours(g, palette)));
  const kick = fired ? 1 : 0;
  const bob = Math.sin(t / 110) * 1.2 * run, sway = Math.cos(t / 220) * 0.8 * run;
  const at = [17 - kick * 4, -10.5 + sway, -13.5 + bob + kick * 1.5]; // forward, left (- is right), up from the eye
  const out = [{ mesh: parts.m, at }];
  if (parts.glow) out.push({ mesh: parts.glow, at, bright: 1.8 + 0.3 * Math.sin(t / 90) });
  if (parts.extra) out.push({ mesh: parts.extra, at });
  if (parts.disc) out.push({ mesh: parts.disc, at: [at[0] + parts.discAt[0], at[1] + parts.discAt[1], at[2] + parts.discAt[2]], spin: t / 60 });
  if (fired) out.push({ mesh: flashMesh(), at: [at[0] + parts.muzzle, at[1], at[2] + 3], bright: 3 });
  return out;
}
