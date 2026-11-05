// Atmospheric light (CLAUDE.md rule 8: Quake's atmosphere, and Abuse was lit the same way).
// Presentation only: it reads the scene and the simulation and changes neither.
//
// Each frame:
//   halos     a soft glow and a small caged lamp at every one of the level's lights near the eye, on the
//             back wall where the lamps hang; some flicker like Quake's lightstyles
//   dynamic   coloured point lights from what burns or shines: the muzzle flash, explosions, shots,
//             rockets, lava, teleporters and beams, save screens, exit rings; the nearest 16
import { Mesh } from '../engine/mesh.js';

const MAX_DYN = 16;
// Quake's lightstyles (world.qc): 'a' is dark, 'm' normal, 'z' double. Two of them for flickering lamps.
const STYLES = ['mmnmmommommnonmmonqnmmo', 'mmmaaaabcdefgmmmmaaaammmaamm'];
const styleAt = (k, t) => { const s = STYLES[k]; return (s.charCodeAt(Math.floor(t / 100) % s.length) - 97) / 12; };
const hash = (a, b) => (((a * 73856093) ^ (b * 19349663)) >>> 0) % 1000 / 1000;

let lampMesh = null;
const lamp = () => (lampMesh ??= new Mesh()
  .box([0, 0, 0], [5, 3, 4], [0.22, 0.22, 0.24]).box([0, -3.5, 0], [3.5, 1, 2.6], [1, 0.9, 0.65])
  .box([0, -4.6, 0], [4, 0.4, 0.4], [0.3, 0.3, 0.32]).box([0, -4.6, 0], [0.4, 0.4, 3], [0.3, 0.3, 0.32]).done());

export function atmosphere(g, depth, scene, { lane, time, eye, muzzle }) {
  const glows = [], dyn = [], draws = [];
  const near = (p, r) => Math.abs(p[0] - eye[0]) < r && Math.abs(p[2] - eye[2]) < r;
  if (g.lightsOn) {
    for (const l of g.level.lights) {
      if (l.type === 9) continue; // a constant-level rectangle, not a lamp
      const pos = [2 * l.x, lane - 10, -2 * l.y];
      if (!near(pos, 1400)) continue;
      const h = hash(l.x, l.y);
      const flick = h < 0.2 ? styleAt(h < 0.1 ? 0 : 1, time + h * 5000) : 1;
      const size = Math.min(70, 14 + l.outer * 0.35);
      glows.push({ pos, size, rgb: [1, 0.84, 0.6], intensity: 0.32 * flick });
      draws.push({ mesh: lamp(), basis: null, offset: [pos[0], lane - 3, pos[2]], bright: 0.6 + 1.4 * flick });
      if (near(pos, 700)) dyn.push({ pos: [pos[0], lane - 40, pos[2]], radius: 160 + l.outer, rgb: [1, 0.85, 0.65], intensity: 0.35 * flick });
    }
  }
  if (muzzle) dyn.push({ pos: muzzle, radius: 300, rgb: [1, 0.78, 0.45], intensity: 1.5 });
  for (const s of scene.sprites) {
    const e = s.e;
    if (!e || !s.offset) continue;
    const t = e.type || '';
    if (/^EXPLODE[1468]$/.test(t)) {
      const n = e.def.states.get(e.state)?.length || 1, p = n > 1 ? (Math.floor(e.frame) % n) / (n - 1) : 0.5;
      if (!dyn.some((d) => d.src === e)) dyn.push({ src: e, pos: s.offset, radius: 420, rgb: [1, 0.55 - 0.3 * p, 0.2 - 0.15 * p], intensity: 2.6 * (1 - p) });
    } else if (/^EXPLODE[2357]$/.test(t)) {
      if (!dyn.some((d) => d.src === e)) dyn.push({ src: e, pos: s.offset, radius: 180, rgb: t === 'EXPLODE3' ? [1, 0.35, 0.15] : [0.7, 0.85, 1], intensity: 1.2 });
    } else if (e.ai === 'lava_ai') {
      if (!dyn.some((d) => d.src === 'lava' && Math.abs(d.pos[0] - s.offset[0]) < 200)) dyn.push({ src: 'lava', pos: [s.offset[0], 0, s.offset[2] + 20], radius: 240, rgb: [1, 0.35, 0.08], intensity: 1 + 0.2 * Math.sin(time / 300 + s.offset[0]) });
    } else if ((e.ai === 'tp2_ai' && e.state === 'running') || e.ai === 'tele_beam_ai') {
      if (!dyn.some((d) => d.src === e)) dyn.push({ src: e, pos: [s.offset[0], s.offset[1], s.offset[2] + 40], radius: 200, rgb: [0.5, 0.8, 1], intensity: 1.2 });
    } else if (e.ai === 'restart_ai') {
      if (!dyn.some((d) => d.src === e)) dyn.push({ src: e, pos: [s.offset[0], lane - 40, s.offset[2]], radius: 150, rgb: e.aistate >= 1 ? [0.5, 0.7, 1] : [0.45, 0.9, 0.45], intensity: 0.8 });
    } else if (e.ai === 'next_level_ai') {
      if (!dyn.some((d) => d.src === e)) dyn.push({ src: e, pos: [s.offset[0], s.offset[1], s.offset[2] + 20], radius: 180, rgb: [1, 0.2, 0.15], intensity: 0.9 });
    }
  }
  for (const b of g.projs) {
    const d = b.d0 === undefined ? depth.pd : depth.shotDepth(b);
    const pos = [2 * b.x, d, -2 * b.y];
    if (b.kind === 'bullet') dyn.push({ pos, radius: 110, rgb: b.mine ? [1, 0.2, 0.15] : [1, 0.85, 0.3], intensity: 1 });
    else if (b.kind === 'rocket') dyn.push({ pos, radius: 200, rgb: [1, 0.6, 0.25], intensity: 1.4 });
    else if (b.kind === 'plasma') dyn.push({ pos, radius: 140, rgb: [0.4, 0.85, 1], intensity: 1.3 });
    else if (b.kind === 'acid') dyn.push({ pos, radius: 120, rgb: [0.4, 1, 0.3], intensity: 1.1 });
  }
  // the nearest first, then the brightest
  const dist = (p) => (p[0] - eye[0]) ** 2 + (p[1] - eye[1]) ** 2 + (p[2] - eye[2]) ** 2;
  dyn.sort((a, b) => dist(a.pos) / (a.intensity + 0.1) - dist(b.pos) / (b.intensity + 0.1));
  return { glows, dyn: dyn.slice(0, MAX_DYN), draws };
}
