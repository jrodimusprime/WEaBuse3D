// The weapon in the cop's hands, drawn in front of the eye like Quake's view
// model (Jared: "cant see player hands or the weapon theyre holding"). One
// designed model per Abuse weapon (weapons.js WEAPON_ORDER), held in two gloved
// hands with the sleeves of the cop's armour (colours from DARNEL's sprite).
//
// Model space: X forward along the barrel, Y to the left, Z up; the origin is
// the grip. The renderer draws it after clearing depth, so it never sinks into
// a wall. It bobs while the cop runs and kicks back with a muzzle flash when he
// fires. Presentation only: it reads the simulation and never changes it.
import { Mesh, spriteColours, shade, rotation } from '../engine/mesh.js';

const cache = new Map();
const built = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };

function copColours(g, palette) {
  return built('cop', () => {
    const def = g.assets.defs.get('DARNEL');
    const img = def && g.assets.sprite(def.file, def.states.get('stopped')[0]);
    const c = img ? spriteColours(img, palette) : { body: [0.4, 0.38, 0.35], dark: [0.12, 0.1, 0.1], light: [0.8, 0.75, 0.7] };
    // the gloves: brown leather (the sprite's darkest colour is near black, and vanished in a dark room)
    return { sleeve: shade(c.body, 1.05), glove: [0.34, 0.25, 0.17], cuff: shade(c.light, 0.6) };
  });
}

// The cop's two gloved hands, built like a Quake view model's: the right on the pistol grip (palm against its
// right side, four three-jointed fingers wrapped round its front, the trigger finger on the trigger, the thumb
// over its back, an armour plate over the knuckles), the left under the barrel at `fore` units ahead (a barrel
// of radius `foreR` at height `foreZ`), cupping it from below with the fingers round its left side and the
// thumb on its right. Each wrist has a cuff, and an armoured forearm runs back and down out of view.
// (X forward, Y left, Z up; the grip is the origin: a block x -2..2, y -1.8..1.8, z -6.5..0.5.)
function hands(k, fore, foreZ = -1, foreR = 3) {
  const m = new Mesh(), G = k.glove, Gd = shade(k.glove, 0.7), A = k.sleeve, Ad = shade(k.sleeve, 0.72), P = shade(k.sleeve, 1.25);
  const N = 7;
  // ---- the right hand, on the grip ----
  m.hexa([[-3.2, -3.2, -6.4], [1.4, -3.2, -6.4], [1.4, -1.9, -6.4], [-3.2, -1.9, -6.4],
    [-3.6, -3.4, 0.6], [1.2, -3.4, 0.6], [1.2, -1.9, 0.6], [-3.6, -1.9, 0.6]], G); // the palm and back of the hand
  m.hexa([[-2.8, -3.9, -5.6], [0.9, -3.9, -5.6], [0.9, -3.2, -5.6], [-2.8, -3.2, -5.6],
    [-3.1, -4.0, 0.1], [0.7, -4.0, 0.1], [0.7, -3.2, 0.1], [-3.1, -3.2, 0.1]], P); // knuckle armour
  for (const z of [-4.6, -2.4]) m.box([-1.1, -4.05, z], [1.6, 0.18, 0.18], Ad); // its seams
  for (const [z, r] of [[-5.4, 0.62], [-4.1, 0.7], [-2.8, 0.72]]) { // three fingers round the grip's front
    m.chain([[0.9, -2.8, z, r + 0.08], [2.9, -2.0, z - 0.1, r], [3.0, 0.2, z - 0.15, r - 0.05], [1.9, 1.9, z - 0.15, r - 0.12]], N, G);
  }
  m.chain([[0.9, -2.8, -1.3, 0.72], [3.1, -2.3, -1.9, 0.68], [4.3, -1.0, -2.8, 0.6], [4.1, 0.2, -3.6, 0.5]], N, G); // the trigger finger
  m.chain([[-2.4, -2.9, -0.6, 0.9], [-0.6, -2.4, 0.9, 0.78], [1.0, -1.0, 1.3, 0.68], [1.6, 0.4, 1.1, 0.58]], N, G); // the thumb, over the back
  m.chain([[-3.8, -2.6, -3.2, 2.6], [-5.2, -2.9, -3.6, 2.9]], 10, Gd, false); // the wrist
  m.segment([-5.4, -2.9, -3.6], [-6.6, -3.1, -3.9], 3.3, 3.3, 12, A); // the cuff
  m.segment([-6.6, -3.1, -3.9], [-30, -9.5, -13], 3.4, 4.2, 12, A); // the armoured forearm
  for (const t of [0.25, 0.55]) { // its plates
    const x = -6.6 + (-30 + 6.6) * t, y = -3.1 + (-9.5 + 3.1) * t, z = -3.9 + (-13 + 3.9) * t;
    m.segment([x, y, z], [x - 2.4, y - 0.65, z - 0.95], 3.75 + t * 0.8, 3.75 + t * 0.8, 12, Ad);
  }
  // ---- the left hand, under the barrel ----
  const bz = foreZ - foreR; // the barrel's underside
  m.hexa([[fore - 3.2, -1.6, bz - 2.4], [fore + 3.2, -1.6, bz - 2.4], [fore + 3.2, 2.6, bz - 2.0], [fore - 3.2, 2.6, bz - 2.0],
    [fore - 3.0, -1.2, bz - 0.4], [fore + 3.0, -1.2, bz - 0.4], [fore + 3.0, 2.4, bz - 0.2], [fore - 3.0, 2.4, bz - 0.2]], G); // the palm, cupping it
  for (const [dx, r] of [[-2.4, 0.62], [-0.8, 0.7], [0.8, 0.7], [2.4, 0.64]]) { // fingers up round its left side
    m.chain([[fore + dx, 2.4, bz - 0.8, r + 0.06], [fore + dx, foreR + 1.0, foreZ - foreR * 0.4, r], [fore + dx * 0.95, foreR + 0.6, foreZ + foreR * 0.55, r - 0.06], [fore + dx * 0.9, foreR * 0.3, foreZ + foreR + 0.5, r - 0.12]], N, G);
  }
  m.chain([[fore - 2.6, -1.4, bz - 1.0, 0.9], [fore - 0.6, -foreR - 0.6, foreZ - foreR * 0.3, 0.76], [fore + 1.4, -foreR - 0.4, foreZ + foreR * 0.4, 0.62]], N, G); // the thumb
  m.segment([fore - 3.6, 1.0, bz - 1.6], [fore - 6.2, 2.4, bz - 2.8], 2.5, 2.8, 10, Gd); // the wrist
  m.segment([fore - 6.2, 2.4, bz - 2.8], [fore - 7.6, 3.1, bz - 3.4], 3.2, 3.2, 12, A); // the cuff
  m.segment([fore - 7.6, 3.1, bz - 3.4], [fore - 32, 15, bz - 13], 3.3, 4.1, 12, A); // the forearm
  for (const t of [0.22, 0.5]) {
    const x = fore - 7.6 + (-32 + 7.6) * t, y = 3.1 + (15 - 3.1) * t, z = bz - 3.4 + (-13 + 3.4) * t;
    m.segment([x, y, z], [x - 2.4, y + 1.2, z - 0.95], 3.65 + t * 0.8, 3.65 + t * 0.8, 12, Ad);
  }
  return m.done();
}

// The guns, from Abuse's own weapon art (the cop's arms holding each gun, weapons.js WEAPONS[w].top, and
// the status bar's bweap icons): the machine gun is silver, slim, with a long thin barrel and a skeleton
// stock; the plasma gun olive green and chunky; the grenade launcher green with a red tip; the rocket
// launcher a dark grey tube; the firebomb thrower gold; the death frisbee dark red and bulky; the light
// saber a red blade. Each is built with the detail of a Quake-era view model.
const C = {
  silver: [0.6, 0.62, 0.66], steel: [0.34, 0.36, 0.4], gun: [0.12, 0.12, 0.14], black: [0.05, 0.05, 0.06],
  olive: [0.33, 0.4, 0.19], oliveDark: [0.19, 0.23, 0.11], green: [0.27, 0.42, 0.2], red: [0.72, 0.1, 0.07],
  gold: [0.78, 0.56, 0.14], goldDark: [0.42, 0.29, 0.07], maroon: [0.4, 0.07, 0.07], cyan: [0.45, 0.9, 1],
  hazard: [0.85, 0.66, 0.12], led: [1, 0.15, 0.1], white: [0.9, 0.9, 0.9], brass: [0.7, 0.55, 0.25],
};

// An octagonal bar along X from x0 to x1, centred at (y, z), half sizes hy and hz, corners cut by b: the body
// of a receiver or a handguard with bevelled edges rather than a plain box.
function bar(m, x0, x1, y, z, hy, hz, b, rgb, taper = 1) {
  const sec = (x, k) => [[x, y - hy * k + b, z - hz * k], [x, y + hy * k - b, z - hz * k], [x, y + hy * k, z - hz * k + b], [x, y + hy * k, z + hz * k - b],
    [x, y + hy * k - b, z + hz * k], [x, y - hy * k + b, z + hz * k], [x, y - hy * k, z + hz * k - b], [x, y - hy * k, z - hz * k + b]];
  const A = sec(x0, 1), B = sec(x1, taper);
  return m.inside([(x0 + x1) / 2, y, z], () => {
    for (let i = 0; i < 8; i++) { const k = (i + 1) % 8; m.quad(A[i], B[i], B[k], A[k], rgb); }
    for (let i = 1; i < 7; i++) { m.tri(A[0], A[i], A[i + 1], rgb); m.tri(B[0], B[i + 1], B[i], rgb); }
  });
}
// a pistol grip, raked back: from the receiver's underside at x down to z0, with finger grooves
function grip(m, x, z0, rgb, groove) {
  m.hexa([[x - 3.6, -1.6, z0], [x - 0.2, -1.6, z0], [x - 0.2, 1.6, z0], [x - 3.6, 1.6, z0], [x - 1.6, -1.7, 0.5], [x + 2, -1.7, 0.5], [x + 2, 1.7, 0.5], [x - 1.6, 1.7, 0.5]], rgb);
  for (let i = 0; i < 3; i++) { const t = (i + 1) / 4, gx = x + 2 - 2 * (1 - t) - 2.2 * t, gz = 0.5 + (z0 - 0.5) * t; m.box([gx + 0.1, 0, gz], [0.25, 1.72, 0.35], groove); }
  return m;
}
// a trigger guard (a loop of thin bars) and the trigger in it
function trigger(m, x, rgb) {
  m.segment([x - 0.6, 0, -0.2], [x + 3.2, 0, -0.4], 0.3, 0.3, 6, rgb).segment([x + 3.2, 0, -0.4], [x + 3.4, 0, -2.6], 0.3, 0.3, 6, rgb)
    .segment([x + 3.4, 0, -2.6], [x - 0.2, 0, -3.2], 0.3, 0.3, 6, rgb);
  return m.segment([x + 1.4, 0, -0.3], [x + 1.8, 0, -1.6], 0.28, 0.22, 6, C.steel).segment([x + 1.8, 0, -1.6], [x + 1.4, 0, -2.2], 0.22, 0.18, 6, C.steel);
}
// fine ridges along a top rail
function rail(m, x0, x1, z, rgb) {
  m.box([(x0 + x1) / 2, 0, z], [(x1 - x0) / 2, 0.75, 0.3], rgb);
  for (let x = x0 + 0.6; x < x1; x += 1.4) m.box([x, 0, z + 0.38], [0.32, 0.8, 0.12], rgb);
  return m;
}
// vents along both sides of a handguard
function vents(m, x0, x1, n, r, z, rgb) {
  for (let i = 0; i < n; i++) { const x = x0 + ((x1 - x0) * (i + 0.5)) / n; m.box([x, r + 0.02, z], [0.55, 0.06, 0.45], rgb).box([x, -r - 0.02, z], [0.55, 0.06, 0.45], rgb); }
  return m;
}
// rings along a barrel (cooling fins, a shroud's ribs): n of them from x0 to x1
function ribs(m, x0, x1, n, r, z, rgb, y = 0) {
  for (let i = 0; i < n; i++) {
    const x = x0 + ((x1 - x0) * i) / Math.max(1, n - 1);
    m.cylinderX([x - 0.35, y, z], r, 0.7, 16, rgb);
  }
  return m;
}

// The guns, from Abuse's own weapon art (the cop's arms holding each gun, weapons.js WEAPONS[w].top, and the
// status bar's bweap icons), each in its own colour over dark gunmetal, at the detail of a Quake-era view
// model: bevelled bodies, round barrels, sights, ports, vents, a real trigger and guard.
const DESIGNS = {
  MGUN: (k) => { // the machine gun: silver, slim, a long thin barrel and a skeleton stock
    const m = new Mesh();
    bar(m, -3, 15, 0, 2.2, 2.3, 2.6, 0.7, C.silver); // the receiver
    bar(m, -2, 13, 0, 5.4, 1.9, 0.7, 0.4, C.steel); // its upper half
    rail(m, -1.5, 12, 6.4, C.gun);
    m.box([7, -2.33, 3.2], [2.4, 0.08, 0.9], C.black).cylinderX([8.5, -2.6, 3.4], 0.35, 1.6, 6, C.steel); // ejection port, bolt handle
    bar(m, 15, 27, 0, 2.8, 2.1, 2.1, 0.7, C.gun); // the handguard
    vents(m, 16, 26, 5, 2.1, 2.8, C.black);
    m.cylinderX([27, 0, 3], 0.85, 13, 12, C.gun).box([30, 0, 3.6], [1, 1, 1.1], C.steel) // barrel, gas block
      .cylinderX([39, 0, 3], 1.25, 2.6, 12, C.steel); // muzzle brake
    for (const y of [-1.26, 1.26]) m.box([40.3, y, 3], [0.6, 0.05, 0.4], C.black);
    m.box([31, 0, 5.2], [0.25, 0.25, 1.3], C.silver).box([31, 0, 6.6], [0.6, 0.6, 0.15], C.steel); // front sight and its hood
    m.box([0.5, 0, 7.4], [0.6, 0.9, 0.6], C.steel).box([0.5, 0, 7.4], [0.62, 0.3, 0.3], C.black); // rear aperture
    m.hexa([[6.4, -1.3, -0.4], [10, -1.3, -0.4], [10, 1.3, -0.4], [6.4, 1.3, -0.4], [7.5, -1.2, -8.5], [10.6, -1.2, -7.8], [10.6, 1.2, -7.8], [7.5, 1.2, -8.5]], C.gun); // the curved magazine
    for (let i = 0; i < 4; i++) m.box([8.2 + i * 0.25, 0, -2 - i * 1.6], [1.9, 1.32, 0.12], C.black);
    grip(m, 0.6, -6.5, C.gun, C.black);
    trigger(m, 2.4, C.steel);
    m.segment([-3, 0, 4], [-14, 0, 3.2], 0.55, 0.55, 8, C.silver).segment([-3, 0, 0.4], [-14, 0, -0.8], 0.55, 0.55, 8, C.silver) // the skeleton stock
      .box([-14.5, 0, 1.2], [0.8, 1.6, 3], C.gun).box([8, -2.36, 5.2], [0.5, 0.06, 0.3], C.led); // butt plate, status light
    return { m: m.done(), hands: hands(k, 21, 2.8, 2.1), muzzle: 42 };
  },
  PGUN: (k) => { // the plasma gun: olive green and chunky, a glowing chamber
    const m = new Mesh();
    bar(m, -3, 16, 0, 2.4, 2.8, 3.4, 1, C.olive);
    bar(m, -1, 14, 0, 6.3, 2.2, 0.8, 0.5, C.oliveDark);
    for (let i = 0; i < 6; i++) m.box([0.5 + i * 2.3, 0, 7.3], [0.35, 2.3, 0.35], C.oliveDark); // heat fins
    m.cylinderX([16, 0, 3], 3.1, 12, 16, C.steel); // the chamber housing
    for (const a of [0, 1, 2, 3]) { const t = (a / 4) * Math.PI * 2 + 0.4; m.box([22, Math.cos(t) * 3.15, 3 + Math.sin(t) * 3.15], [5.5, 0.35, 0.35], C.gun); } // its struts
    m.cylinderX([28, 0, 3], 2.1, 2, 16, C.gun);
    m.segment([30, 1.6, 3], [34, 1.2, 3], 0.55, 0.4, 8, C.steel).segment([30, -1.6, 3], [34, -1.2, 3], 0.55, 0.4, 8, C.steel); // emitter prongs
    m.box([9, 0, -1.4], [3.5, 2.4, 1.2], C.oliveDark).box([9, -2.45, -1.4], [3, 0.08, 0.7], C.black); // the cell and its window frame
    grip(m, 0.6, -6.5, C.gun, C.black);
    trigger(m, 2.4, C.steel);
    const glow = new Mesh().cylinderX([16.5, 0, 3], 1.7, 11, 12, C.cyan);
    for (const x of [19, 22.5, 26]) glow.torus([x, 0, 3], 3.35, 0.45, 16, 5, C.cyan);
    glow.ellipsoid([34.3, 0, 3], [0.7, 0.7, 0.7], 3, 8, C.cyan).box([9, -2.5, -1.4], [2.6, 0.05, 0.5], C.cyan);
    return { m: m.done(), hands: hands(k, 22, 3, 3.1), glow: glow.done(), muzzle: 34 };
  },
  GRENADE: (k) => { // the grenade launcher: green, a revolving drum, a red tip
    const m = new Mesh();
    bar(m, -3, 6, 0, 2.4, 2.1, 2.5, 0.7, C.green);
    m.cylinderX([2, 0, 4.4], 3.1, 24, 16, C.green).cylinderX([26, 0, 4.4], 3.5, 2.2, 16, C.red) // the barrel and its red tip
      .cylinderX([25.6, 0, 4.4], 2.2, 3, 12, C.black);
    m.cylinderX([3, 0, -1.4], 4.4, 9, 16, C.oliveDark); // the drum
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.5; m.cylinderX([2.7, Math.cos(a) * 3.3, -1.4 + Math.sin(a) * 3.3], 1.05, 9.6, 8, C.gun); }
    m.cylinderX([2.4, 0, -1.4], 1.2, 10.2, 8, C.steel); // its axle
    for (let i = 0; i < 6; i++) m.box([13.5 + i * 1.5, 0, 1.0], [0.45, 2.7, 0.55], C.gun); // the pump's grip ribs
    m.box([16, 0, 1.6], [5, 2.5, 0.9], C.oliveDark);
    m.box([20, 0, 8.2], [0.3, 1.6, 0.9], C.steel).box([20, 0, 8.2], [0.32, 0.5, 0.5], C.black); // leaf sight
    grip(m, 0.6, -7, C.gun, C.black);
    trigger(m, 2.2, C.steel);
    return { m: m.done(), hands: hands(k, 16, 1.6, 2.9), muzzle: 28 };
  },
  ROCKET: (k) => { // the rocket launcher: a dark grey tube on the shoulder, a hazard band, a scope
    const m = new Mesh().cylinderX([-12, 0, 6], 3.8, 36, 16, C.steel);
    m.cylinderX([-16, 0, 6], 4.9, 4, 16, C.gun).cylinderX([-16.4, 0, 6], 3.2, 1, 16, C.black) // the flared exhaust
      .cylinderX([24, 0, 6], 4.5, 3, 16, C.gun).cylinderX([26.6, 0, 6], 3.4, 0.6, 16, C.black); // the front lip
    for (let i = 0; i < 4; i++) m.cylinderX([13 + i * 1.6, 0, 6], 3.88, 1.6, 16, i % 2 ? C.black : C.hazard); // hazard band
    for (const x of [-6, 4]) m.cylinderX([x, 0, 6], 4.0, 1.2, 16, C.gun); // clamps
    m.box([4, 3.4, 10.6], [5, 1.1, 1.1], C.gun).cylinderX([9, 3.4, 10.6], 1.1, 1.4, 10, C.black).box([10.6, 3.4, 10.6], [0.15, 0.6, 0.6], C.led); // scope
    m.box([4, 2.5, 9.2], [1, 0.4, 0.9], C.gun);
    grip(m, 0.6, -5.5, C.gun, C.black); m.box([0, 0, 1.2], [3, 1.8, 1.6], C.gun);
    trigger(m, 2.2, C.steel);
    m.box([12, 0, 0.8], [2.2, 1.6, 2.4], C.gun); // the fore grip
    const warhead = new Mesh().cylinderX([22.5, 0, 6], 2.5, 3.4, 12, C.white);
    warhead.segment([25.9, 0, 6], [28.4, 0, 6], 2.5, 0.3, 12, C.red);
    return { m: m.done(), hands: hands(k, 12, 1.6, 2.4), extra: warhead.done(), muzzle: 28 };
  },
  FIREBOMB: (k) => { // the fire bomb thrower: gold, twin red fuel tanks, a pilot flame
    const m = new Mesh();
    bar(m, -3, 14, 0, 2.6, 2.4, 2.8, 0.8, C.gold);
    bar(m, -1, 12, 0, 5.8, 1.8, 0.6, 0.4, C.goldDark);
    m.cylinderX([14, 0, 3], 1.9, 13, 16, C.goldDark); // the nozzle tube
    ribs(m, 15, 25, 6, 2.2, 3, C.gun);
    m.cylinderX([27, 0, 3], 2.4, 1.6, 16, C.gun).cylinderX([28.5, 0, 3], 1.4, 1.2, 12, C.black); // the nozzle
    for (const y of [3.4, -3.4]) m.cylinderX([1, y, -3.6], 2.5, 12, 16, C.red).cylinderX([13, y, -3.6], 1.4, 0.8, 10, C.steel); // the fuel tanks and their caps
    m.segment([13.6, 3.4, -3.6], [15, 1.4, 0.4], 0.45, 0.45, 6, C.brass).segment([13.6, -3.4, -3.6], [15, -1.4, 0.4], 0.45, 0.45, 6, C.brass); // fuel lines
    grip(m, 0.6, -6.5, C.gun, C.black);
    trigger(m, 2.4, C.steel);
    const glow = new Mesh().ellipsoid([30.4, 0, 3], [1.5, 1.1, 1.5], 4, 8, [1, 0.55, 0.15]).ellipsoid([31.4, 0, 3.3], [0.9, 0.6, 1.2], 3, 8, [1, 0.8, 0.35]).done(); // the pilot flame
    return { m: m.done(), hands: hands(k, 20, 3, 2.2), glow, muzzle: 31 };
  },
  DFRIS: (k) => { // the death frisbee launcher: dark red and bulky, a disc on its rail
    const m = new Mesh();
    bar(m, -3, 18, 0, 2, 3.2, 3.2, 1.1, C.maroon);
    bar(m, 0, 16, 0, 4.9, 3.4, 0.5, 0.4, C.gun); // the launch rail
    for (let i = 0; i < 4; i++) m.box([2 + i * 4, -3.25, 1.5], [1, 0.06, 1.5], C.black); // vents
    m.cylinderX([18, 0, 2], 2.4, 4, 16, C.gun).cylinderX([22, 0, 2], 1.6, 1.4, 12, C.black);
    grip(m, 0.6, -7, C.gun, C.black);
    trigger(m, 2.4, C.steel);
    const disc = new Mesh().lathe([0, 0, 0], [[0, -0.5], [4.4, -0.35], [5, 0], [4.4, 0.35], [0, 0.55]], 20, C.silver);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; disc.box([Math.cos(a) * 5.1, Math.sin(a) * 5.1, 0], [0.8, 0.35, 0.25], C.steel); }
    disc.cylinder([0, 0, 0.4], 1.4, 0.4, 12, C.gun);
    return { m: m.done(), hands: hands(k, 14, 2, 3.2), disc: disc.done(), discAt: [10, 0, 5.6], muzzle: 24 };
  },
  LSABER: (k) => { // the light saber: a ribbed silver hilt, a red blade
    const m = new Mesh().cylinderX([-3, 0, 2], 1.9, 12, 16, C.silver);
    ribs(m, -2, 6, 6, 2.1, 2, C.gun);
    m.cylinderX([9, 0, 2], 2.5, 1.8, 16, C.steel).cylinderX([10.6, 0, 2], 1.6, 0.6, 12, C.black)
      .box([3, -2.05, 3], [1.2, 0.15, 0.5], C.led).cylinderX([-4, 0, 2], 1.5, 1, 12, C.steel);
    const glow = new Mesh().cylinderX([11, 0, 2], 1.0, 36, 12, [1, 0.25, 0.2]).cylinderX([11, 0, 2], 0.55, 36.5, 10, [1, 0.85, 0.8]).done();
    return { m: m.done(), hands: hands(k, 6, 2, 1.9), glow, muzzle: 46 };
  },
};

const flashMesh = () => built('flash', () => new Mesh().box([0, 0, 0], [3, 0.6, 0.6], [1, 0.9, 0.5]).box([0, 0, 0], [0.6, 3, 0.6], [1, 0.9, 0.5]).box([0, 0, 0], [0.6, 0.6, 3], [1, 0.9, 0.5]).ellipsoid([0, 0, 0], [2.4, 2.4, 2.4], 3, 6, [1, 0.95, 0.7]).done());

// The view model's parts in view space (X forward, Y left, Z up), posed for this frame:
// `fired` (the cop fired since the last frame), `run` (0-1, how fast he is going), `t` (ms).
export const VIEW_SCALE = 0.6;
// how the gun is held: its barrel turned a little in towards the middle of the view and up, and canted so its
// right side (and the right hand on the grip) turns towards the eye, as Quake-era view models are
export const VIEW_HOLD = rotation((5 * Math.PI) / 180, (-3 * Math.PI) / 180, (-24 * Math.PI) / 180);
// a point of the model (model units), held: where it is in view units, from the grip at `at`
const held = (at, p) => { const R = VIEW_HOLD, S = VIEW_SCALE; return [0, 1, 2].map((k) => at[k] + S * (R[k] * p[0] + R[3 + k] * p[1] + R[6 + k] * p[2])); };
export function viewModel(g, palette, { fired, run, t }) {
  const w = g.player.weapon in DESIGNS ? g.player.weapon : 'MGUN';
  const parts = built(`w:${w}`, () => DESIGNS[w](copColours(g, palette)));
  const kick = fired ? 1 : 0;
  const bob = Math.sin(t / 110) * 1.2 * run, sway = Math.cos(t / 220) * 0.8 * run;
  // forward, left (- is right), up from the eye, in view units; the model is drawn at VIEW_SCALE, so all of
  // the gun is in front of the eye (the renderer's near plane is 4 units out) and it sits low and right,
  // as Quake's do
  const at = [18 - kick * 2.5, -7.6 + sway * 0.6, -8.6 + bob * 0.6 + kick * 0.9];
  const out = [{ mesh: parts.m, at }, { mesh: parts.hands, at, skin: 0.6, skinKind: 1, skinScale: 1 / 4 }];
  if (parts.glow) out.push({ mesh: parts.glow, at, bright: 1.8 + 0.3 * Math.sin(t / 90) });
  if (parts.extra) out.push({ mesh: parts.extra, at });
  if (parts.disc) out.push({ mesh: parts.disc, at: held(at, parts.discAt), spin: t / 60 });
  if (fired) out.push({ mesh: flashMesh(), at: held(at, [parts.muzzle, 0, 3]), bright: 3 });
  return out;
}
