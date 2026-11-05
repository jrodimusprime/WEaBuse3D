// Every level compiles to the committed BSP, loads, starts clear, and is solid where the simulation is, but for
// the floor a ladder climbs through: the map leaves it open, and the depth layer's frame walls close it again all
// but a hole the ladder's size against the back wall (client/ladders.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildLevel } from '../content/build.mjs';
import { simTileSolid } from '../content/level-input.mjs';
import { loadBSP, CONTENTS_SOLID } from '../engine/bsp.js';
import { pointContents, boxInSolid } from '../engine/trace.js';

for (let n = 0; n < 22; n++) {
  test(`level ${n}: committed, sound, solid where the simulation is`, async () => {
    const { name, bytes, input } = await buildLevel(n);
    const disk = new Uint8Array(await readFile(new URL(`../web/maps/${name}.bsp`, import.meta.url)));
    assert.ok(Buffer.from(disk).equals(Buffer.from(bytes)), `${name}.bsp is out of date: npm run build:maps -- ${n}`);
    const m = loadBSP(bytes);
    const st = m.entities.find((e) => e.classname === 'info_player_start').origin.split(' ').map(Number);
    assert.ok(Number.isFinite(st[0]));
    let bad = 0, checked = 0, holed = 0;
    const away = [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, 2], [-2, 2], [2, -2]]; // (as bsp.test: clear of outline edges)
    for (let py = 1; py < input.height; py += 13) {
      for (let px = 1; px < input.width; px += 13) {
        if (input.holes.some((h) => h.cells.includes(Math.floor(py / input.th) * input.lv.fgW + Math.floor(px / input.tw)))) { holed++; continue; }
        const solid = simTileSolid(input, px, py);
        if (away.some(([dx, dy]) => simTileSolid(input, px + dx, py + dy) !== solid)) continue;
        checked++;
        if ((pointContents(m, [2 * px + 1, 0, -2 * py - 1]) === CONTENTS_SOLID) !== solid) bad++;
      }
    }
    assert.equal(bad, 0, `${bad} of ${checked} points disagree`);
    void boxInSolid;
    // a ladder's hole is open in the map
    for (const h of input.holes) {
      const px = (h.x0 + h.x1) / 2, py = (h.y0 + h.y1) / 2;
      assert.notEqual(pointContents(m, [2 * px + 1, 0, -2 * py - 1]), CONTENTS_SOLID, `the floor at ${px},${py} is open for the ladder`);
    }
    assert.ok(holed < checked / 50, 'only the ladder holes are left out');
  });
}
