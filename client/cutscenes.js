// The original's screens between the levels and at the end of the game (Jared: "after the final level play the
// cutscene with the game ending. inbetween levels show the [level based] splash screens of the original game"),
// drawn as Abuse 0.8 draws them, on its 320 x 200 screen, in its palette (they are its pictures, not the world):
//
// - Between levels (ant.cpp show_stats, which next_level_ai calls before request_level_load): the screen fades
//   out (8 steps), art/frame.spe end_level_screen (the cop in his ring of fire under ABUSE, 160 x 198) is put at
//   the left and fades in (16 steps); in the middle of what is left, a grey box (frame.spe window_colors: a
//   bright edge, a medium face) and "Level Completed! : N" in the game font (small_font, at 320 x 200), dark one
//   pixel down and right, then bright. It holds 500 ms and the next level loads. Here it holds at least HOLD_MS
//   and until the next level has loaded (a key or a click passes it then), and fades to the level.
// - The end (endgame.cpp show_end, from request_end_game at the last level's exit): the screen fades out (16),
//   art/fore/endgame.spe end.pcx fades in (32), then plot_end scrolls up over it a pixel each 0.18 s for 320
//   steps (director.cpp text_draw: words wrapped between x 10 and 309, lines 9 apart, a blank line at each \n,
//   a line greyer the nearer it is to the top or the bottom edge, through a ramp of 32 greys, with a shadow in
//   colour 0); a key ends the scroll; then a key or a click, and the screen fades out (16).
//
// Each fade step is 25 ms, as game.cpp Fade's are: the palette scaled step by step.
import { loadSpec, readPalette, readCharacter, T } from '../sim/web/src/spec.js';
import { DATA } from '../sim/web/src/assets.js';

const W = 320, H = 200;
const FADE_MS = 25;
const HOLD_MS = 1600;
const LEV_COMPLETE = 'Level Completed!'; // english.lsp lev_complete
// english.lsp plot_end (its "\\n" is a backslash and an n in the string, which text_draw reads as a new paragraph)
const PLOT_END = "You've survived impossible odds and made it to the Control Room.  By pulling the switch, you have diverted the water supply and stopped the spread of Abuse!\\n CONGRATULATIONS!  YOU'RE HOWLING!!!";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let art = null;
function loadArt() {
  art ??= (async () => {
    const [back, frame, fonts, end] = await Promise.all(['art/back/backgrnd.spe', 'art/frame.spe', 'art/fonts.spe', 'art/fore/endgame.spe'].map((f) => loadSpec(DATA + f)));
    const img = (s, n) => readCharacter(s, s.find(n));
    const font = img(fonts, 'small_font');
    return {
      pal: readPalette(back, back.ofType(T.PALETTE)[0]), level: img(frame, 'end_level_screen'), end: img(end, 'end.pcx'),
      colors: img(frame, 'window_colors').pix, // bright, medium, dark
      font, cw: Math.floor((font.w + 1) / 32), ch: Math.floor((font.h + 1) / 8), // JCFont: 32 x 8 cells
    };
  })();
  return art;
}

// The 320 x 200 screen: palette indices, shown through the palette scaled by the fade
class Screen {
  constructor(a, ctx) { this.a = a; this.ctx = ctx; this.pix = new Uint8Array(W * H); this.clip = [0, 0, W - 1, H - 1]; this.data = ctx.createImageData(W, H); }
  clear() { this.pix.fill(0); }
  put(im, x0, y0) { // (image::put_image: every pixel, clipped to the screen)
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
      const X = x0 + x, Y = y0 + y;
      if (X >= 0 && X < W && Y >= 0 && Y < H) this.pix[Y * W + X] = im.pix[y * im.w + x];
    }
  }
  bar(x1, y1, x2, y2, c) { for (let y = Math.max(0, y1); y <= Math.min(H - 1, y2); y++) for (let x = Math.max(0, x1); x <= Math.min(W - 1, x2); x++) this.pix[y * W + x] = c; }
  char(x0, y0, code, c) { // JCFont::put_char: the set pixels of the letter's cell, in colour c, inside the clip
    const { font, cw, ch } = this.a, sx = (code % 32) * cw, sy = (code >> 5) * ch, [cx1, cy1, cx2, cy2] = this.clip;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const X = x0 + x, Y = y0 + y;
      if (X >= cx1 && X <= cx2 && Y >= cy1 && Y <= cy2 && font.pix[(sy + y) * font.w + sx + x]) this.pix[Y * W + X] = c;
    }
  }
  text(s, x, y, c) { for (let i = 0; i < s.length; i++) this.char(x + i * this.a.cw, y, s.charCodeAt(i), c); }
  show(k = 1) {
    const { pal } = this.a, d = this.data.data, v = Math.floor(k * 256);
    for (let i = 0; i < W * H; i++) {
      const p = this.pix[i] * 4;
      d[i * 4] = (pal[p] * v) >> 8; d[i * 4 + 1] = (pal[p + 1] * v) >> 8; d[i * 4 + 2] = (pal[p + 2] * v) >> 8; d[i * 4 + 3] = 255;
    }
    this.ctx.putImageData(this.data, 0, 0);
  }
}

// game.cpp Fade<1>: the palette from black up to itself in `steps` steps of 25 ms, drawn by `draw` each step
async function fadeIn(s, steps, draw = () => {}) {
  for (let i = 0; i < steps; i++) { draw(); s.show((i + 1) / steps); await wait(FADE_MS); }
}
async function fadeOut(s, steps) {
  for (let i = 0; i < steps; i++) { s.show((steps - i - 1) / steps); await wait(FADE_MS); }
}

// The screen over the view: black, the 320 x 200 picture in the middle, as large as fits, its pixels square and
// sharp. `shown` starts it black and opaque (a page that opens straight onto it).
function overlay(shown = false) {
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;inset:0;z-index:20;background:#000;display:flex;align-items:center;justify-content:center;cursor:none;opacity:${shown ? 1 : 0}`;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  c.style.cssText = 'width:100%;height:100%;object-fit:contain;image-rendering:pixelated';
  el.append(c);
  (document.getElementById('stage') || document.body).append(el);
  return { el, ctx: c.getContext('2d') };
}

// The view fades to black under a new overlay (as the palette fades out), `steps` of 25 ms
async function darken(o, steps) {
  for (let i = 1; i <= steps; i++) { o.el.style.opacity = String(i / steps); await wait(FADE_MS); }
}

// a key or a click, once (or `ms` ms, if given)
function anyInput(ms) {
  return new Promise((resolve) => {
    const done = () => { removeEventListener('keydown', done, true); removeEventListener('mousedown', done, true); clearTimeout(t); resolve(); };
    const t = ms === undefined ? null : setTimeout(done, ms);
    addEventListener('keydown', done, true); addEventListener('mousedown', done, true);
  });
}

// The view fades to black, ready for the level-complete screen on the next page (the 8 steps of show_stats' fade_out)
export async function leaveLevel() {
  loadArt(); // (its art, meanwhile)
  await darken(overlay(), 8);
}

// The level-complete screen for `n`, the level just finished, over a page that opens on it: it fades in, holds until
// `ready` (the next level, loading) and HOLD_MS have passed (a key or a click passes the hold once ready), then
// fades away to the level.
export async function levelComplete(n, ready) {
  const o = overlay(true), t0 = performance.now();
  const a = await loadArt(), s = new Screen(a, o.ctx);
  s.clear();
  s.put(a.level, 0, 0);
  // the box in the middle of the rest of the screen (show_stats: x1 = the picture's width + 1, x2 = xres, y 0 to 200)
  const msg = `${LEV_COMPLETE} : ${n}`, w = a.cw * msg.length, h = a.ch;
  const x1 = a.level.w + 1, x2 = W - 1, x = Math.trunc((x1 + x2) / 2) - Math.trunc(w / 2), y = Math.trunc(H / 2) - Math.trunc(h / 2);
  const [bright, medium, dark] = a.colors;
  s.bar(x - 10, y - 10, x + w + 10, y + h + 10, bright);
  s.bar(x - 9, y - 9, x + w + 9, y + h + 9, medium);
  s.text(msg, x + 1, y + 1, dark);
  s.text(msg, x, y, bright);
  await fadeIn(s, 16);
  await ready;
  const left = HOLD_MS - (performance.now() - t0);
  if (left > 0) await anyInput(left);
  // to the level: the screen fades out, then the view shows through
  await fadeOut(s, 8);
  o.el.remove();
}

// director.cpp text_draw: `buf` from y (relative to y1) between x1 and x2, clipped to y1..y2, each line in a grey
// of `cmap` by its distance from the nearer edge (to 31), with a shadow in colour 0
function textDraw(s, y, x1, y1, x2, y2, buf, cmap) {
  const h = s.a.ch + 2, w = s.a.cw, n = buf.length, space = (c) => c === ' ' || c === '\r' || c === '\n' || c === '\t';
  s.clip = [x1, y1, x2, y2];
  let x = x1, p = 0;
  y += y1;
  while (p < n) {
    let start, len, size;
    do {
      if (buf[p] === '\\' && buf[p + 1] === 'n') { x = x1; y += h * 2; p += 2; }
      if (p < n && space(buf[p])) { x += w; while (p < n && space(buf[p])) p++; }
      start = p; len = 0; size = 0;
      while (p < n && !space(buf[p]) && !(buf[p] === '\\' && buf[p + 1] === 'n')) { p++; size += w; len++; }
      if (size < x2 - x1 && size + x > x2) { y += h; x = x1; }
      if (y + h < y1) x += size;
    } while (p < n && y + h < y1);
    let dist = 31;
    if (y - y1 < dist) dist = y - y1 < 1 ? 0 : y - y1;
    if (y2 - y < dist) dist = y2 - y < 1 ? 0 : y2 - y;
    if (y > y2) break;
    for (let i = 0; i < len; i++, x += w) {
      s.char(x + 1, y + 1, buf.charCodeAt(start + i), 0);
      s.char(x, y, buf.charCodeAt(start + i), cmap[dist]);
    }
  }
  s.clip = [0, 0, W - 1, H - 1];
}

// The ending (show_end), over the view: resolves when it has been watched and dismissed
export async function ending() {
  const art = loadArt(), o = overlay();
  await darken(o, 16);
  const a = await art, s = new Screen(a, o.ctx);
  // the grey ramp, palette::find_closest(i * 8, i * 8, i * 8)
  const cmap = Array.from({ length: 32 }, (_, i) => {
    let best = 0, bd = Infinity;
    for (let k = 0; k < 256; k++) { const d = (a.pal[k * 4] - i * 8) ** 2 + (a.pal[k * 4 + 1] - i * 8) ** 2 + (a.pal[k * 4 + 2] - i * 8) ** 2; if (d < bd) { bd = d; best = k; } }
    return best;
  });
  const dx = Math.trunc(W / 2) - 160, dy = Math.trunc(H / 2) - 100;
  s.clear();
  s.put(a.end, Math.trunc(W / 2) - Math.trunc(a.end.w / 2), Math.trunc(H / 2) - Math.trunc(a.end.h / 2));
  await fadeIn(s, 32);
  // the scroll, until its end or a key
  let key = false;
  const onKey = () => { key = true; };
  addEventListener('keydown', onKey, true);
  const t0 = performance.now();
  for (let i = 0; i < 320 && !key;) {
    s.put(a.end, dx, dy);
    textDraw(s, 205 - i, dx + 10, dy, dx + 319 - 10, dy + 199, PLOT_END, cmap);
    s.show();
    await new Promise(requestAnimationFrame);
    i = Math.min(320, Math.floor((performance.now() - t0) / 180));
  }
  removeEventListener('keydown', onKey, true);
  if (!key) await anyInput();
  await fadeOut(s, 16);
}
