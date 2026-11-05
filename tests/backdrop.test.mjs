// Windows onto the background (client/backdrop.js): the level's background made whole (Abuse's art kept, its
// holes filled), each window anchored on the art Abuse shows behind it, and panes either side of a pillar
// sharing one view.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../sim/web/tools/headless.mjs';
import { createGame, levelFile } from '../client/sim-host.js';
import { windowCells, backdropCanvas } from '../client/backdrop.js';

const g = await createGame();
const cellsOf = async (L) => {
  await g.start(levelFile(L));
  const lv = g.level, back = { size: [g.bw, g.bh], tile: (n) => g.assets.backTile(n) };
  return { lv, c: windowCells({ ...lv, rate: lv.bgRate, tile: [g.tw, g.th], back, fore: (n) => g.assets.foreTile(n), palette: g.assets.palette }) };
};
const bright = (lv, x, y) => {
  const t = g.assets.backTile(lv.bgmap[(Math.floor(y / g.bh) % lv.bgH) * lv.bgW + (Math.floor(x / g.bw) % lv.bgW)]);
  const i = t.pix[(Math.floor(y) % g.bh) * t.w + (Math.floor(x) % g.bw)], p = g.assets.palette;
  return p[i * 4] + p[i * 4 + 1] + p[i * 4 + 2];
};

for (const L of [1, 2, 16]) test(`level ${L}: every window looks out on Abuse's art, inside its own box`, async () => {
  const { lv, c } = await cellsOf(L);
  const windows = new Map();
  for (let i = 0; i < lv.fgW * lv.fgH; i++) {
    const o = i * 12, d = c.data;
    const ext = [d[o + 8], d[o + 9], d[o + 10], d[o + 11]];
    if (ext[2] - ext[0] <= g.tw && ext[3] - ext[1] <= g.th) continue; // a cell on its own
    windows.set(ext.join(), { anchor: [d[o + 2], d[o + 3]], box: [d[o + 4], d[o + 5], d[o + 6], d[o + 7]] });
  }
  assert.ok(windows.size > 0);
  let art = 0;
  for (const { anchor: [x, y], box } of windows.values()) {
    assert.ok(x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3], `anchor ${x},${y} outside ${box}`);
    if (bright(lv, x, y) > 30) art++;
  }
  assert.ok(art / windows.size > 0.6, `${art} of ${windows.size} windows centred on art`);
});

test('level 2: the panes either side of a pillar are one window', async () => {
  const { lv, c } = await cellsOf(2);
  const at = (x, y) => { const o = (Math.floor(y / g.th) * lv.fgW + Math.floor(x / g.tw)) * 12; return [...c.data.slice(o + 8, o + 12)].join(); };
  assert.equal(at(240, 500), at(390, 500)); // the sky either side of the dark column by the lift
});

for (const L of [1, 2, 16]) test(`level ${L}: the whole picture keeps every pixel of Abuse's art and has no holes`, async () => {
  await g.start(levelFile(L));
  const lv = g.level, pal = g.assets.palette, back = { size: [g.bw, g.bh], tile: (n) => g.assets.backTile(n) };
  const c = backdropCanvas({ ...lv, back, palette: pal });
  assert.equal(c.w, lv.bgW * g.bw); assert.equal(c.h, lv.bgH * g.bh);
  const lum = (i) => pal[i * 4] + pal[i * 4 + 1] + pal[i * 4 + 2];
  let kept = 0, art = 0, dark = 0;
  for (let ty = 0; ty < lv.bgH; ty++) for (let tx = 0; tx < lv.bgW; tx++) {
    const t = g.assets.backTile(lv.bgmap[ty * lv.bgW + tx]);
    const isArt = t.pix.some((i) => lum(i) > 30);
    for (let y = 0; y < g.bh; y++) for (let x = 0; x < g.bw; x++) {
      const v = c.pix[(ty * g.bh + y) * c.w + tx * g.bw + x];
      if (isArt) { art++; if (v === t.pix[y * t.w + x]) kept++; }
      if (lum(v) <= 30) dark++;
    }
  }
  assert.equal(kept, art, 'every art pixel is where Abuse has it');
  assert.ok(dark / (c.w * c.h) < 0.1, `${Math.round((100 * dark) / (c.w * c.h))}% black`);
});
