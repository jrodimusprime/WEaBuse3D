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

const DESIGNS = {
  // MGUN: the machine gun, Abuse's starting weapon. A compact rifle: receiver, barrel with a shroud, magazine, sight.
  MGUN: (k) => {
    const m = new Mesh()
      .box([5, 0, 2], [11, 2.5, 3], [0.22, 0.23, 0.25]) // receiver
      .cylinderX([16, 0, 3], 1.2, 16, 8, [0.15, 0.15, 0.17]) // barrel
      .cylinderX([14, 0, 3], 2.2, 8, 8, [0.3, 0.31, 0.33]) // shroud
      .box([7, 0, -4], [2, 1.6, 4], [0.18, 0.18, 0.2]) // magazine
      .box([0, 0, -2], [2, 1.8, 3], [0.2, 0.2, 0.22]) // grip
      .box([10, 0, 6], [1, 0.6, 1], [0.6, 0.6, 0.62]) // sight
      .box([-6, 0, 2], [3, 2, 2.5], [0.25, 0.25, 0.27]); // stock
    return { m: hands(m, k, 13).done(), muzzle: 32 };
  },
  // PGUN: the plasma gun. A sleek body with glowing coils round the barrel.
  PGUN: (k) => {
    const m = new Mesh().box([6, 0, 2], [12, 3, 3.5], [0.28, 0.3, 0.36]).cylinderX([16, 0, 3], 1.6, 14, 8, [0.2, 0.22, 0.26]).box([0, 0, -2], [2, 1.8, 3], [0.2, 0.2, 0.22]);
    const glow = new Mesh();
    for (const x of [19, 23, 27]) glow.torus([x, 0, 3], 2.6, 0.8, 10, 4, [0.4, 0.8, 1]);
    return { m: hands(m, k, 13).done(), glow: glow.done(), muzzle: 30 };
  },
  // GRENADE: the grenade launcher. A fat short tube over a revolving drum.
  GRENADE: (k) => {
    const m = new Mesh().cylinderX([2, 0, 4], 3.6, 22, 10, [0.25, 0.3, 0.22]).cylinderX([6, 0, -1], 4.5, 9, 8, [0.2, 0.24, 0.18]).box([0, 0, -3], [2, 1.8, 3], [0.2, 0.2, 0.22]).box([24, 0, 4], [0.8, 4, 4], [0.45, 0.55, 0.3]);
    return { m: hands(m, k, 15, -3).done(), muzzle: 25 };
  },
  // ROCKET: the rocket launcher. A long tube over the shoulder with a sight and a red band.
  ROCKET: (k) => {
    const m = new Mesh().cylinderX([-14, 0, 6], 3.4, 42, 10, [0.3, 0.32, 0.28]).cylinderX([22, 0, 6], 3.9, 4, 10, [0.75, 0.15, 0.1]).box([4, 3, 12], [3, 1, 2], [0.2, 0.2, 0.2]).box([0, 0, -1], [2, 1.8, 4], [0.2, 0.2, 0.22]);
    return { m: hands(m, k, 12, 1).done(), muzzle: 28 };
  },
  // FIREBOMB: the firebomb thrower. A fuel tank under a nozzle.
  FIREBOMB: (k) => {
    const m = new Mesh().cylinderX([0, 0, 3], 2, 24, 8, [0.3, 0.3, 0.3]).cylinderX([2, 0, -3], 4, 12, 10, [0.7, 0.2, 0.1]).box([0, 0, -2], [2, 1.8, 3], [0.2, 0.2, 0.22]);
    return { m: hands(m, k, 13).done(), muzzle: 26 };
  },
  // DFRIS: the death frisbee. A round housing with a blade disc.
  DFRIS: (k) => {
    const m = new Mesh().box([6, 0, 1], [9, 3, 3], [0.3, 0.28, 0.32]).cylinder([14, 0, 4], 7, 2, 12, [0.6, 0.6, 0.65]).box([0, 0, -2], [2, 1.8, 3], [0.2, 0.2, 0.22]);
    return { m: hands(m, k, 10).done(), muzzle: 22 };
  },
  // LSABER: the light saber. A hilt and a glowing blade.
  LSABER: (k) => {
    const m = new Mesh().cylinderX([-2, 0, 2], 1.8, 10, 8, [0.4, 0.4, 0.45]);
    const glow = new Mesh().cylinderX([8, 0, 2], 1.2, 34, 8, [0.6, 1, 0.7]);
    return { m: hands(m, k, 6).done(), glow: glow.done(), muzzle: 42 };
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
  if (fired) out.push({ mesh: flashMesh(), at: [at[0] + parts.muzzle, at[1], at[2] + 3], bright: 3 });
  return out;
}
