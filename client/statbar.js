// Abuse's status bar, from its own artwork (art/statbar.spe): health, the
// weapons held (bright for the one in hand) and their ammunition. A port of
// WEaBuse's (sim/web/src/main.js "Bottom status bar"), laid out like the
// original status_bar::redraw. It is drawn at its native 320x32 pixels and
// scaled by whole steps, so the pixel art stays sharp.
import { readPalette, T } from '../sim/web/src/spec.js';
import { WEAPON_ORDER } from '../sim/web/src/weapons.js';

const BAR_W = 320, BAR_H = 32, WX = 40, WA = 34, NUM_Y = 21, SEL_OFF = 4;

export async function createStatbar(g, canvas) {
  await g.assets.preloadDef({ file: 'art/statbar.spe' });
  const spec = g.assets.specCache?.get('art/statbar.spe');
  const pal = spec?.ofType(T.PALETTE).length ? readPalette(spec, spec.ofType(T.PALETTE)[0]) : g.assets.palette;
  const image = (name) => {
    const img = g.assets.sprite('art/statbar.spe', name);
    if (!img?.pix) return null;
    const cv = document.createElement('canvas');
    cv.width = img.w; cv.height = img.h;
    const ctx = cv.getContext('2d');
    const data = ctx.createImageData(img.w, img.h);
    for (let i = 0; i < img.w * img.h; i++) {
      const idx = img.pix[i], p = idx * 4;
      data.data[i * 4] = pal[p]; data.data[i * 4 + 1] = pal[p + 1]; data.data[i * 4 + 2] = pal[p + 2];
      data.data[i * 4 + 3] = idx === 0 ? 0 : 255;
    }
    ctx.putImageData(data, 0, 0);
    return cv;
  };
  const art = {
    sbar: image('sbar'), select: image('sbar_select'), numpad: image('sbar_numpad'),
    bnum: Array.from({ length: 30 }, (_, i) => image(`bnum${String(i).padStart(2, '0')}`)),
    bright: WEAPON_ORDER.map((_, i) => image(`bweap000${i + 1}.pcx`)),
    dim: WEAPON_ORDER.map((_, i) => image(`dweap000${i + 1}.pcx`)),
  };
  canvas.width = BAR_W; canvas.height = BAR_H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  let hover = -1, lastSig = '';

  const num = (x, y, n, base) => {
    const b = art.bnum[base];
    if (!b) return;
    n = Math.max(0, Math.min(999, Math.floor(n)));
    const h = Math.floor(n / 100); n -= h * 100;
    const t = Math.floor(n / 10), o = n - t * 10;
    ctx.drawImage(art.bnum[base + h], x, y);
    ctx.drawImage(art.bnum[base + t], x + b.width, y);
    ctx.drawImage(art.bnum[base + o], x + 2 * b.width, y);
  };
  const draw = () => {
    const p = g.player;
    if (!p || !art.sbar) return;
    const sig = WEAPON_ORDER.map((w) => `${p.owned.has(w) ? 1 : 0}${w === p.weapon ? 1 : 0}${p.ammo[w] || 0}`).join('|') + `|${Math.ceil(p.hp)}|${g.god ? 1 : 0}|${hover}`;
    if (sig === lastSig) return;
    lastSig = sig;
    ctx.clearRect(0, 0, BAR_W, BAR_H);
    ctx.drawImage(art.sbar, 0, 0);
    num(17, 11, Math.ceil(p.hp), 0);
    WEAPON_ORDER.forEach((w, i) => {
      if (!p.owned.has(w)) return;
      const x = WX + i * WA, current = w === p.weapon;
      ctx.drawImage(current ? art.bright[i] : art.dim[i], x, 0);
      ctx.drawImage(art.numpad, x - 2, NUM_Y);
      num(52 + i * WA, 25, g.god ? 999 : (p.ammo[w] || 0), current ? 20 : 10);
      if (i === hover) ctx.drawImage(art.select, x + SEL_OFF, 0);
    });
  };
  const slotAt = (clientX) => {
    const r = canvas.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * BAR_W;
    const slot = Math.floor((x - WX) / WA);
    return slot >= 0 && slot < WEAPON_ORDER.length && g.player?.owned.has(WEAPON_ORDER[slot]) ? slot : -1;
  };
  canvas.addEventListener('mousemove', (e) => { hover = slotAt(e.clientX); });
  canvas.addEventListener('mouseleave', () => { hover = -1; });
  canvas.addEventListener('click', (e) => { const s = slotAt(e.clientX); if (s >= 0) g.selectWeapon(WEAPON_ORDER[s]); });
  // the largest whole number of device pixels per bar pixel that fits the space it is given
  const fit = (maxW, maxH) => {
    const dpr = globalThis.devicePixelRatio || 1;
    const k = Math.max(1, Math.min(Math.floor((maxW * dpr) / BAR_W), Math.floor((maxH * dpr) / BAR_H), 8));
    canvas.style.width = `${(BAR_W * k) / dpr}px`;
    canvas.style.height = `${(BAR_H * k) / dpr}px`;
  };
  return { draw, fit };
}
