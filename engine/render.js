// Draws the world, the objects and the effects with WebGL2.
//
// World: the BSP's faces, as GLQuake builds them (gl_rsurf.c AllocBlock and
// BuildSurfaceDisplayList: texture and lightmap coordinates, +8 to sample luxel
// centres; gl_rmain.c R_SetupGL axes and MYgluPerspective). Textures are the
// palette-index miptex expanded through Abuse's palette.
//
// Light, two ways:
//   'lightmap' - the baked lightmaps (the M0 walk).
//   'abuse'    - Abuse's own formula per pixel, live: the level's lights (which
//                dimmer switches change), the current ambient, and the L key.
//                Same as sim/web/src/lighting.js LightMap.update and the
//                renderer's subtractive darkening (c - (63 - level)).
// Objects: voxel models (engine/voxel.js), lit the same way. Effects: boxes.
//
// Not yet ported (M4): R_RecursiveWorldNode / R_MarkLeaves visibility. Every
// face is drawn every frame, which is cheap at this size.
import { lightRange } from '../sim/web/src/lighting.js';
import { cachedModel } from './voxel.js';
import { metalSkin, organicSkin, muscleSkin, DETAIL_SIZE } from './detail.js';

const BLOCK = 1024; // lightmap atlas size, in luxels
const MAX_LIGHTS = 256;
const MAX_DYN = 16;
const BACKDROP_FAR = 4; // the city outside the windows is at least this many lane half-depths behind the middle of the hall

// Abuse's light at level pixel p (lighting.js LightMap.update), 0-63.
const ABUSE_LIGHT = `
uniform highp sampler2D lights; // row 0: x y xs ys, row 1: inner outer type mul, row 2: range x0 y0 x1 y1
uniform int nLights;
uniform float ambient;
float abuseLight(vec2 p) {
  float lev = ambient;
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= nLights) break;
    vec4 r = texelFetch(lights, ivec2(i, 2), 0);
    if (p.x < r.x || p.x > r.z || p.y < r.y || p.y > r.w) continue;
    vec4 a = texelFetch(lights, ivec2(i, 0), 0);
    vec4 b = texelFetch(lights, ivec2(i, 1), 0);
    if (b.z == 9.0) { lev = b.x; break; }
    float dx = abs(a.x - floor(p.x)) * exp2(a.z);
    float dy = abs(a.y - floor(p.y)) * exp2(a.w);
    float r2 = dx < dy ? dx + dy - floor(dx / 2.0) : dx + dy - floor(dy / 2.0);
    if (r2 < b.y) lev += floor((b.y - r2) * b.w / 65536.0);
  }
  return clamp(lev, 0.0, 63.0);
}
// game renderer: each colour channel loses (63 - level) of 255
vec3 abuseLit(vec3 c, vec2 p) { return max(c * 255.0 - (63.0 - abuseLight(p)), 0.0) / 255.0; }

// Atmosphere (CLAUDE.md rule 8): coloured dynamic lights (muzzle flashes, explosions, shots, lava,
// screens, pads), each a point with a radius, added on top of Abuse's light; and a haze with distance.
uniform vec4 dynPos[${MAX_DYN}]; // xyz, radius
uniform vec4 dynCol[${MAX_DYN}]; // rgb, intensity
uniform int nDyn;
uniform vec3 eyePos;
uniform vec4 haze; // rgb, density
vec3 dynLight(vec3 albedo, vec3 w) {
  vec3 add = vec3(0.0);
  for (int i = 0; i < ${MAX_DYN}; i++) {
    if (i >= nDyn) break;
    float d = length(w - dynPos[i].xyz) / dynPos[i].w;
    if (d < 1.0) { float f = (1.0 - d) * (1.0 - d); add += dynCol[i].rgb * dynCol[i].a * f; }
  }
  return albedo * add;
}
vec3 hazed(vec3 c, vec3 w) { float f = 1.0 - exp(-length(w - eyePos) * haze.a); return mix(c, haze.rgb, f); }
`;

const WORLD_VS = `#version 300 es
layout(location=0) in vec3 pos;
layout(location=1) in vec2 uv;
layout(location=2) in vec2 luv;
layout(location=3) in float shade;
uniform mat4 mvp;
out vec2 vUv; out vec2 vLuv; out vec3 vPos; out float vShade;
void main() { vUv = uv; vLuv = luv; vPos = pos; vShade = shade; gl_Position = mvp * vec4(pos, 1.0); }`;

const WORLD_FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vLuv; in vec3 vPos; in float vShade;
uniform sampler2D tex; uniform sampler2D lightmap; uniform float brightness; uniform int mode; uniform float red;
// windows onto the level's background (Abuse's parallax layer): win is +1 on the back wall, -1 on the front wall,
// 0 elsewhere; bgFace: this face shows the background everywhere (no foreground there), else only where its
// foreground tile is see-through
uniform int win; uniform int bgFace; uniform int bgOn;
uniform sampler2D bgCanvas; uniform highp sampler2D bgCells; // client/backdrop.js: the whole picture, and the windows
uniform vec2 bgSize; // the picture's size
uniform vec4 bgRate; // how far the backdrop is, across and up (times the lane's half depth), the lane's half depth
uniform vec4 bgCell; // foreground tile width, height; the map's width, height (cells)
uniform vec2 bgView; // the 2D view's size
${ABUSE_LIGHT}
// What the background shows through point P of a lane wall (client/backdrop.js). The level's background, made
// whole (Abuse's art, its holes filled by carrying the art on, like a Quake sky with nothing missing), on a
// plane behind the wall (bgRate.xy lane depths from the middle of the hall), seen along the ray from the eye.
// Each window's view is centred on the picture Abuse shows behind it: from the middle, in front of a window, it
// is Abuse's picture; walking past, it slides by slowly, as a city far off does.
vec3 backdrop(vec3 P) {
  vec2 p = vec2(P.x, -P.z) * 0.5;
  ivec2 c = clamp(ivec2(floor(p / bgCell.xy)), ivec2(0), ivec2(bgCell.zw) - 1);
  vec4 anchor = texelFetch(bgCells, ivec2(c.x * 3, c.y), 0), ext = texelFetch(bgCells, ivec2(c.x * 3 + 2, c.y), 0);
  // the eye, as far as the window goes (further along the hall the view stops sliding), and not closer to the
  // wall than half the lane (close to, a window would show half the city)
  vec2 e = clamp(vec2(eyePos.x, -eyePos.z) * 0.5, ext.xy - 0.5 * bgView, ext.zw + 0.5 * bgView);
  float lane = bgRate.z, d = max(float(win) * (float(win) * lane - eyePos.y), 0.5 * lane);
  vec2 t = (d + (bgRate.xy - 1.0) * lane) / d;
  vec2 q = e + (p - e) * t;
  vec2 px = anchor.zw + (q - anchor.xy) / bgRate.xy;
  return texelFetch(bgCanvas, ivec2(mod(floor(px), bgSize)), 0).rgb; // it repeats, as Abuse's map does
}
out vec4 color;
void main() {
  vec4 texel = texture(tex, vUv);
  vec3 albedo = texel.rgb;
  if (win != 0 && bgOn == 1 && (bgFace == 1 || texel.a < 0.5)) {
    // far outside: lit as Abuse lights its background (its own lamps), not by the hall's flashes, and hazed
    vec3 c = backdrop(vPos);
    if (mode == 1) c = abuseLit(c, vec2(vPos.x / 2.0, -vPos.z / 2.0)); else c *= 0.85;
    c = mix(c * brightness, haze.rgb, 0.22);
    c.r = min(1.0, c.r + red);
    color = vec4(c, 1.0);
    return;
  }
  vec3 c = albedo;
  if (mode == 0) c *= texture(lightmap, vLuv).r;
  else if (mode == 1) c = abuseLit(c, vec2(vPos.x / 2.0, -vPos.z / 2.0));
  c = c * vShade * brightness + dynLight(albedo, vPos);
  c = hazed(c, vPos);
  c.r = min(1.0, c.r + red);
  color = vec4(c, 1.0);
}`;

const MODEL_VS = `#version 300 es
layout(location=0) in vec3 pos;
layout(location=1) in vec3 normal;
layout(location=2) in vec3 rgb;
uniform mat4 mvp; uniform mat3 basis; uniform vec3 offset;
out vec3 vPos; out vec3 vRgb; out float vShade; out vec3 vLocal; out vec3 vLocalN;
void main() {
  vec3 w = basis * pos + offset;
  vec3 n = normalize(basis * normal);
  vPos = w; vRgb = rgb; vLocal = pos; vLocalN = normal;
  // light from above and from the front of the hall, plus some from the sides
  vShade = 0.66 + 0.22 * max(n.z, 0.0) + 0.12 * abs(n.y) + 0.08 * abs(n.x) - 0.18 * max(-n.z, 0.0);
  gl_Position = mvp * vec4(w, 1.0);
}`;

const MODEL_FS = `#version 300 es
precision highp float;
in vec3 vPos; in vec3 vRgb; in float vShade; in vec3 vLocal; in vec3 vLocalN;
uniform float brightness; uniform int mode; uniform float bright; uniform float red; uniform int glow; uniform float glowAmt;
uniform sampler2D skin; uniform sampler2D skin2; uniform sampler2D skin3; uniform int skinKind; uniform float skinAmt; uniform float skinScale;
// the metal skin (engine/detail.js), projected along the model's own axes
float skinAt() {
  vec3 w = pow(abs(vLocalN), vec3(4.0));
  w /= (w.x + w.y + w.z + 1e-5);
  vec3 p = vLocal * skinScale;
  float t = skinKind == 2
    ? texture(skin3, p.yz).r * w.x + texture(skin3, p.xz).r * w.y + texture(skin3, p.xy).r * w.z
    : skinKind == 1
    ? texture(skin2, p.yz).r * w.x + texture(skin2, p.xz).r * w.y + texture(skin2, p.xy).r * w.z
    : texture(skin, p.yz).r * w.x + texture(skin, p.xz).r * w.y + texture(skin, p.xy).r * w.z;
  return mix(1.0, t * 1.28, skinAmt);
}
${ABUSE_LIGHT}
out vec4 color;
void main() {
  vec3 albedo = min(vRgb * bright, 1.0) * (skinAmt > 0.0 ? skinAt() : 1.0), c = albedo;
  if (mode == 1) c = abuseLit(c, vec2(vPos.x / 2.0, -vPos.z / 2.0));
  c = c * vShade * brightness + dynLight(vRgb, vPos);
  if (glow == 1) c = vRgb * bright * glowAmt; // additive glow parts: their own light, fading with glowAmt
  c = hazed(c, vPos);
  c.r = min(1.0, c.r + red);
  color = vec4(c, 1.0);
}`;

const GLOW_VS = `#version 300 es
layout(location=0) in vec3 pos;
layout(location=1) in vec2 uv;
layout(location=2) in vec4 col;
uniform mat4 mvp;
out vec2 vUv; out vec4 vCol; out vec3 vPos;
void main() { vUv = uv; vCol = col; vPos = pos; gl_Position = mvp * vec4(pos, 1.0); }`;

const GLOW_FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec4 vCol; in vec3 vPos;
uniform vec3 eyePos; uniform vec4 haze;
out vec4 color;
void main() {
  float r = dot(vUv, vUv);
  if (r > 1.0) discard;
  float f = (1.0 - r) * (1.0 - r);
  float fog = exp(-length(vPos - eyePos) * haze.a);
  color = vec4(vCol.rgb * vCol.a * f * fog, 1.0);
}`;

// The Quake look (Jared: "stick to a strict colour palette like quake did ... to add grittyness"):
// the scene is drawn small, at about Quake's resolution, then every pixel is snapped to the nearest
// colour of Quake's 256-colour palette and scaled up with hard edges.
const POST_VS = `#version 300 es
layout(location=0) in vec2 pos;
out vec2 vUv;
void main() { vUv = pos * 0.5 + 0.5; gl_Position = vec4(pos, 0.0, 1.0); }`;
const POST_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D scene; uniform sampler2D lut; uniform int on;
out vec4 color;
void main() {
  vec3 c = clamp(texture(scene, vUv).rgb, 0.0, 1.0);
  if (on == 0) { color = vec4(c, 1.0); return; }
  vec3 q = floor(c * 31.0 + 0.5);
  color = vec4(texture(lut, vec2((q.r + 32.0 * q.b + 0.5) / 1024.0, (q.g + 0.5) / 32.0)).rgb, 1.0);
}`;

// For every colour on a 32-step grid, the nearest colour of a 768-byte palette (weighted for the eye).
export function paletteLut(pal) {
  const out = new Uint8Array(1024 * 32 * 4);
  for (let g = 0; g < 32; g++) for (let b = 0; b < 32; b++) for (let r = 0; r < 32; r++) {
    const R = (r * 255) / 31, G = (g * 255) / 31, B = (b * 255) / 31;
    let best = 0, bd = Infinity;
    for (let i = 0; i < 256; i++) {
      const dr = R - pal[i * 3], dg = G - pal[i * 3 + 1], db = B - pal[i * 3 + 2];
      const d = 3 * dr * dr + 4 * dg * dg + 2 * db * db;
      if (d < bd) { bd = d; best = i; }
    }
    const o = (g * 1024 + b * 32 + r) * 4;
    out[o] = pal[best * 3]; out[o + 1] = pal[best * 3 + 1]; out[o + 2] = pal[best * 3 + 2]; out[o + 3] = 255;
  }
  return out;
}

export class Renderer {
  constructor(gl) {
    this.gl = gl;
    this.world = program(gl, WORLD_VS, WORLD_FS, ['mvp', 'tex', 'lightmap', 'brightness', 'mode', 'red', 'lights', 'nLights', 'ambient', 'win', 'bgFace', 'bgOn', 'bgCanvas', 'bgSize', 'bgRate', 'bgCells', 'bgCell', 'bgView']);
    const atmo = ['dynPos', 'dynCol', 'nDyn', 'eyePos', 'haze'];
    this.world.u = { ...this.world.u, ...uniforms(gl, this.world.prog, atmo) };
    this.model = program(gl, MODEL_VS, MODEL_FS, ['mvp', 'basis', 'offset', 'brightness', 'mode', 'bright', 'red', 'lights', 'nLights', 'ambient', 'glow', 'glowAmt', 'skin', 'skin2', 'skin3', 'skinKind', 'skinAmt', 'skinScale', ...atmo]);
    this.skinTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.skinTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, DETAIL_SIZE, DETAIL_SIZE, 0, gl.RED, gl.UNSIGNED_BYTE, metalSkin());
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.skinTex2 = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.skinTex2);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, DETAIL_SIZE, DETAIL_SIZE, 0, gl.RED, gl.UNSIGNED_BYTE, organicSkin());
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.skinTex3 = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.skinTex3);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, DETAIL_SIZE, DETAIL_SIZE, 0, gl.RED, gl.UNSIGNED_BYTE, muscleSkin());
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.glowProg = program(gl, GLOW_VS, GLOW_FS, ['mvp', 'eyePos', 'haze']);
    this.glowBuf = gl.createBuffer();
    this.glowVao = vao(gl, this.glowBuf, [[0, 3, 0], [1, 2, 12], [2, 4, 20]], 36);
    this.haze = [0.03, 0.03, 0.045, 0.00045];
    this.post = program(gl, POST_VS, POST_FS, ['scene', 'lut', 'on']);
    this.postBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.postBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    this.postVao = vao(gl, this.postBuf, [[0, 2, 0]], 8);
    this.quake = false; // palette and low resolution, once setQuakePalette has been called
    this.lines = 400; // about how many lines tall the scene is drawn (Quake: 200 to 480)
    this.dyn = [];
    this.brightness = 1;
    this.lightTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.lightTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, MAX_LIGHTS, 3, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.lightData = new Float32Array(MAX_LIGHTS * 3 * 4);
    this.nLights = 0;
    this.ambient = 32;
    this.models = new WeakMap(); // voxel model -> GPU buffers
    this.boxBuf = gl.createBuffer();
    this.boxVao = vao(gl, this.boxBuf, [[0, 3, 0], [1, 3, 12], [2, 3, 24]], 36);
  }

  // palette: 768 bytes (Quake palette.lmp layout)
  load(model, palette) {
    const gl = this.gl;
    this.palette = palette;
    this.textureInfo = model.textures.map((t) => ({ name: t.name, w: t.width, h: t.height }));
    this.frameGroups = [];
    this.textures = model.textures.map((t) => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      const rgba = new Uint8Array(t.width * t.height * 4);
      const seeThrough = t.name.startsWith('fg'); // a foreground tile's colour 0 is see-through (the background shows)
      for (let i = 0; i < t.width * t.height; i++) {
        const c = t.pixels[i] * 3;
        rgba[i * 4] = palette[c]; rgba[i * 4 + 1] = palette[c + 1]; rgba[i * 4 + 2] = palette[c + 2]; rgba[i * 4 + 3] = seeThrough && !t.pixels[i] ? 0 : 255;
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, t.width, t.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      return tex;
    });

    // lightmaps: pack every surface's luxels into one atlas (AllocBlock)
    const allocated = new Int32Array(BLOCK);
    const atlas = new Uint8Array(BLOCK * BLOCK);
    for (const s of model.surfaces) {
      const smax = (s.extents[0] >> 4) + 1, tmax = (s.extents[1] >> 4) + 1;
      const [x, y] = allocBlock(allocated, smax, tmax);
      s.light_s = x; s.light_t = y;
      for (let t = 0; t < tmax; t++) {
        if (s.samples >= 0 && model.lightdata) atlas.set(model.lightdata.subarray(s.samples + t * smax, s.samples + (t + 1) * smax), (y + t) * BLOCK + x);
        else atlas.fill(255, (y + t) * BLOCK + x, (y + t) * BLOCK + x + smax);
      }
    }
    this.lightmap = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.lightmap);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, BLOCK, BLOCK, 0, gl.RED, gl.UNSIGNED_BYTE, atlas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Which faces are which: the near wall of the lane (seen only from inside)
    // and the caps (brush model *1, seen only from outside).
    const lane = Number(model.entities[0]?._abuse_lane || 64);
    this.lane = lane;
    const capModel = model.models[1];
    const kindOf = (s, i) => {
      if (capModel && i >= capModel.firstface && i < capModel.firstface + capModel.numfaces) return 'caps';
      if (s.plane.normal[1] === 1 && s.plane.dist === -lane && !s.planeback) return 'front';
      return 'world';
    };
    // vertices, grouped by kind and texture (BuildSurfaceDisplayList, fans as triangles)
    const groups = new Map();
    // on a lane wall (the back wall +1, the front wall -1): windows onto the background
    const winOf = (s) => (Math.abs(s.plane.normal[1]) === 1 && Math.abs(s.plane.dist) === lane ? Math.sign(s.plane.normal[1] * s.plane.dist) : 0);
    model.surfaces.forEach((s, i) => {
      const key = `${kindOf(s, i)}|${s.texinfo.miptex}|${winOf(s)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    });
    const data = [];
    this.groups = [];
    for (const [key, list] of [...groups].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const [kind, k, w] = key.split('|');
      const first = data.length / 8;
      const t = model.textures[k];
      for (const s of list) {
        const vecs = s.texinfo.vecs;
        const n = s.planeback ? s.plane.normal.map((v) => -v) : s.plane.normal;
        const shade = n[2] > 0.7 ? 1 : n[2] < -0.7 ? 0.72 : Math.abs(n[1]) > 0.7 ? 0.95 : 0.84;
        const vert = (v) => {
          const ss = v[0] * vecs[0][0] + v[1] * vecs[0][1] + v[2] * vecs[0][2] + vecs[0][3];
          const tt = v[0] * vecs[1][0] + v[1] * vecs[1][1] + v[2] * vecs[1][2] + vecs[1][3];
          data.push(v[0], v[1], v[2], ss / t.width, tt / t.height,
            (ss - s.texturemins[0] + s.light_s * 16 + 8) / (BLOCK * 16),
            (tt - s.texturemins[1] + s.light_t * 16 + 8) / (BLOCK * 16), shade);
        };
        for (let i = 1; i + 1 < s.verts.length; i++) { vert(s.verts[0]); vert(s.verts[i]); vert(s.verts[i + 1]); }
      }
      this.groups.push({ kind, tex: this.textures[k], first, count: data.length / 8 - first, win: Number(w), bgFace: t.name.startsWith('bg') ? 1 : 0 });
    }
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    this.worldVao = vao(gl, buf, [[0, 3, 0], [1, 2, 12], [2, 2, 20], [3, 1, 28]], 32);
    this.triangles = data.length / 24;
  }

  // Frame walls (doorways, lift shafts): boxes [{min, max, tex}] in units, textured like the
  // world (world-anchored, a texel per 2 units) and lit the same way. Replaces any earlier set.
  setFrames(boxes) {
    const gl = this.gl;
    const byTex = new Map();
    for (const b of boxes) { if (!byTex.has(b.tex)) byTex.set(b.tex, []); byTex.get(b.tex).push(b); }
    const data = [];
    this.frameGroups = [];
    for (const [k, list] of byTex) {
      const t = this.textureInfo[k], first = data.length / 8;
      for (const { min: a, max: b } of list) {
        const v = (x, y, z, s, tt, sh) => data.push(x, y, z, s / t.w, tt / t.h, 0, 0, sh);
        const q = (p, uv, sh) => { for (const i of [0, 1, 2, 0, 2, 3]) v(...p[i], ...uv(p[i]), sh); };
        const xs = [a[0], b[0]], ys = [a[1], b[1]], zs = [a[2], b[2]];
        for (const x of xs) q([[x, ys[0], zs[0]], [x, ys[1], zs[0]], [x, ys[1], zs[1]], [x, ys[0], zs[1]]], (p) => [p[1] / 2, -p[2] / 2], 0.84);
        for (const y of ys) q([[xs[0], y, zs[0]], [xs[1], y, zs[0]], [xs[1], y, zs[1]], [xs[0], y, zs[1]]], (p) => [p[0] / 2, -p[2] / 2], 0.95);
        q([[xs[0], ys[0], zs[1]], [xs[1], ys[0], zs[1]], [xs[1], ys[1], zs[1]], [xs[0], ys[1], zs[1]]], (p) => [p[0] / 2, p[1] / 2], 1);
        q([[xs[0], ys[0], zs[0]], [xs[1], ys[0], zs[0]], [xs[1], ys[1], zs[0]], [xs[0], ys[1], zs[0]]], (p) => [p[0] / 2, p[1] / 2], 0.72);
      }
      this.frameGroups.push({ tex: this.textures[k], first, count: data.length / 8 - first });
    }
    this.frameBuf ??= gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.frameBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    this.frameVao ??= vao(gl, this.frameBuf, [[0, 3, 0], [1, 2, 12], [2, 2, 20], [3, 1, 28]], 32);
  }

  // Turns on the Quake look with this palette (768 bytes).
  setQuakePalette(pal) {
    const gl = this.gl;
    this.lutTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1024, 32, 0, gl.RGBA, gl.UNSIGNED_BYTE, paletteLut(pal));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.quake = true;
  }

  // the offscreen target the scene is drawn into, at w x h
  target(w, h) {
    const gl = this.gl;
    if (this.fbo && this.fbo.w === w && this.fbo.h === h) return this.fbo;
    if (this.fbo) { gl.deleteFramebuffer(this.fbo.fb); gl.deleteTexture(this.fbo.tex); gl.deleteRenderbuffer(this.fbo.depth); }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return (this.fbo = { fb, tex, depth, w, h });
  }

  // The level's background (Abuse's parallax layer), seen through the windows of the lane walls:
  // { canvas: client/backdrop.js backdropCanvas ({w, h, pix} palette indices: the whole picture),
  //   cells: windowCells (where each window looks out), rate: {xmul, xdiv, ymul, ydiv}, view: [w, h] }
  setBackdrop(bg) {
    if (this.backdrop) { this.gl.deleteTexture(this.backdrop.canvas); this.gl.deleteTexture(this.backdrop.cells); }
    this.backdrop = bg && bg.canvas ? this.makeBackdrop(bg) : null;
  }
  makeBackdrop(bg) {
    const gl = this.gl, { w, h, pix } = bg.canvas, rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) { const v = pix[i] * 3; rgba[i * 4] = this.palette[v]; rgba[i * 4 + 1] = this.palette[v + 1]; rgba[i * 4 + 2] = this.palette[v + 2]; rgba[i * 4 + 3] = 255; }
    const make = (fn) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); fn(); for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); return t; };
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const canvas = make(() => gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba));
    const cl = bg.cells || { w: 3, h: 1, data: new Float32Array(12), tile: [1, 1] };
    const cells = make(() => gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, cl.w, cl.h, 0, gl.RGBA, gl.FLOAT, cl.data));
    // how far behind the hall the city is, in lane depths: Abuse's own depth (1 / rate), and never nearer than
    // BACKDROP_FAR (at Abuse's 5/8, and 1:1 up and down, it sat just behind the glass)
    const rx = bg.rate.xmul / (bg.rate.xdiv || 1), ry = bg.rate.ymul / (bg.rate.ydiv || 1), far = (r) => Math.max(BACKDROP_FAR, 1 / Math.max(0.01, r));
    return { canvas, cells, size: [w, h], rate: [far(rx), far(ry), this.lane, 0], cell: [cl.tile[0], cl.tile[1], cl.w / 3, cl.h], view: bg.view };
  }


  // the texture index of a miptex by name (e.g. "fg123"), or null
  textureNamed(name) { const i = this.textureInfo.findIndex((t) => t.name === name); return i < 0 ? null : i; }

  // Abuse's lights for mode 'abuse': the level's light list, the ambient level, and whether lights are on.
  setAbuseLights(list, ambient, on = true) {
    const d = this.lightData;
    let n = 0;
    if (on) {
      for (const l of list) {
        if (n >= MAX_LIGHTS) break;
        const r = lightRange(l);
        const mul = l.outer > l.inner ? Math.floor(65536 / (l.outer - l.inner)) * 64 : 0;
        d.set([l.x, l.y, l.xs, l.ys], n * 4);
        d.set([l.inner, l.outer, l.type, mul], (MAX_LIGHTS + n) * 4);
        d.set(r, (2 * MAX_LIGHTS + n) * 4);
        n++;
      }
    }
    this.nLights = n;
    this.ambient = on ? ambient : 63;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.lightTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MAX_LIGHTS, 3, gl.RGBA, gl.FLOAT, d);
  }

  // Draws a frame. view: {eye, angles: [pitch, yaw, roll] degrees} (Quake's
  // view) or {eye, target} (look at). opts: mode ('lightmap' | 'abuse'), which
  // of 'front'/'caps' to show, fovY, sprites and boxes (client/scene.js), red flash.
  frame(view, width, height, opts = {}) {
    if (!this.quake) return this.draw(view, width, height, opts);
    const gl = this.gl;
    const k = Math.max(1, Math.round(height / this.lines));
    const t = this.target(Math.max(1, Math.floor(width / k)), Math.max(1, Math.floor(height / k)));
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    this.draw(view, t.w, t.h, opts);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.post.prog);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
    gl.uniform1i(this.post.u.scene, 0); gl.uniform1i(this.post.u.lut, 1); gl.uniform1i(this.post.u.on, this.paletteOn === false ? 0 : 1);
    gl.bindVertexArray(this.postVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.DEPTH_TEST);
  }

  draw(view, width, height, opts = {}) {
    const gl = this.gl;
    const { mode = 'lightmap', front = true, caps = false, fovY = 73.74, sprites = [], boxes = [], red = 0, world = true, viewmodel = [], glows = [], dyn = [], eye = view.eye } = opts;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    const proj = perspective(fovY, width / height, 4, 16384);
    let viewM;
    if (view.target) viewM = lookAt(view.eye, view.target, [0, 0, 1]);
    else {
      // R_SetupGL: put Z going up, then the view's roll, pitch and yaw, then the origin
      viewM = rotate(identity(), -90, 1, 0, 0);
      viewM = rotate(viewM, 90, 0, 0, 1);
      viewM = rotate(viewM, -view.angles[2], 1, 0, 0);
      viewM = rotate(viewM, -view.angles[0], 0, 1, 0);
      viewM = rotate(viewM, -view.angles[1], 0, 0, 1);
      viewM = translate(viewM, -view.eye[0], -view.eye[1], -view.eye[2]);
    }
    const mvp = mul(proj, viewM);
    this.mvp = mvp;
    const modeId = mode === 'lightmap' ? 0 : 1;
    const dynPos = new Float32Array(MAX_DYN * 4), dynCol = new Float32Array(MAX_DYN * 4);
    const nDyn = Math.min(MAX_DYN, dyn.length);
    for (let i = 0; i < nDyn; i++) { dynPos.set([...dyn[i].pos, dyn[i].radius], i * 4); dynCol.set([...dyn[i].rgb, dyn[i].intensity ?? 1], i * 4); }
    const shared = (p) => {
      gl.useProgram(p.prog);
      if (p.u.nDyn) {
        gl.uniform4fv(p.u.dynPos, dynPos); gl.uniform4fv(p.u.dynCol, dynCol); gl.uniform1i(p.u.nDyn, mode === 'abuse' ? nDyn : 0);
        gl.uniform3fv(p.u.eyePos, eye); gl.uniform4fv(p.u.haze, mode === 'abuse' ? this.haze : [0, 0, 0, 0]);
      }
      if (p.u.glow) {
        gl.uniform1i(p.u.glow, 0); gl.uniform1f(p.u.glowAmt, 1);
        gl.uniform1i(p.u.skin, 3); gl.uniform1i(p.u.skin2, 4); gl.uniform1i(p.u.skin3, 5); gl.uniform1f(p.u.skinAmt, 0); gl.uniform1i(p.u.skinKind, 0);
        gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.skinTex);
        gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.skinTex2);
        gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, this.skinTex3); gl.activeTexture(gl.TEXTURE0);
      }
      gl.uniformMatrix4fv(p.u.mvp, false, mvp);
      gl.uniform1f(p.u.brightness, this.brightness);
      gl.uniform1i(p.u.mode, modeId);
      gl.uniform1f(p.u.red, red / 255);
      gl.uniform1i(p.u.nLights, this.nLights);
      gl.uniform1f(p.u.ambient, this.ambient);
      gl.uniform1i(p.u.lights, 2);
    };
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.lightTex);

    // world
    shared(this.world);
    gl.uniform1i(this.world.u.tex, 0);
    gl.uniform1i(this.world.u.lightmap, 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lightmap);
    gl.activeTexture(gl.TEXTURE0);
    // (the background's samplers always have units of their own and a texture of their type, or the draw fails)
    this.backdropStandIn ??= this.makeBackdrop({ canvas: { w: 1, h: 1, pix: [0] }, rate: { xmul: 1, xdiv: 1, ymul: 1, ydiv: 1 }, view: [0, 0] });
    const bd = this.backdrop || this.backdropStandIn;
    gl.uniform1i(this.world.u.bgOn, this.backdrop ? 1 : 0);
    gl.uniform1i(this.world.u.bgCanvas, 6); gl.uniform1i(this.world.u.bgCells, 8);
    gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, bd.canvas);
    gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D, bd.cells);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform2fv(this.world.u.bgSize, bd.size); gl.uniform4fv(this.world.u.bgRate, bd.rate); gl.uniform4fv(this.world.u.bgCell, bd.cell); gl.uniform2fv(this.world.u.bgView, bd.view);
    gl.bindVertexArray(this.worldVao);
    for (const g of world ? this.groups : []) {
      if ((g.kind === 'front' && !front) || (g.kind === 'caps' && !caps)) continue;
      gl.uniform1i(this.world.u.win, g.win); gl.uniform1i(this.world.u.bgFace, g.bgFace);
      gl.bindTexture(gl.TEXTURE_2D, g.tex);
      gl.drawArrays(gl.TRIANGLES, g.first, g.count);
    }
    gl.uniform1i(this.world.u.win, 0);
    if (world && this.frameGroups.length) {
      gl.bindVertexArray(this.frameVao);
      for (const g of this.frameGroups) { gl.bindTexture(gl.TEXTURE_2D, g.tex); gl.drawArrays(gl.TRIANGLES, g.first, g.count); }
    }

    // objects, then the view model on top (depth cleared, so it never sinks into a wall)
    const passes = [sprites];
    if (viewmodel.length) passes.push(viewmodel);
    for (let pass = 0; pass < passes.length; pass++) {
      const list = passes[pass];
      if (pass === 1) { this.drawGlows(sprites, glows, mvp, viewM, eye, mode); gl.clear(gl.DEPTH_BUFFER_BIT); }
      if (!list.length && (pass === 1 || !boxes.length)) continue;
      shared(this.model);
      for (const s of list) {
        if (s.additive) continue; // drawn in the glow pass
        const m = s.mesh || cachedModel(s.img, this.palette, s.flip, !!s.flat);
        if (!m.count) continue;
        let gpu = this.models.get(m);
        if (!gpu) {
          const buf = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buf);
          gl.bufferData(gl.ARRAY_BUFFER, m.data, gl.STATIC_DRAW);
          gpu = vao(gl, buf, [[0, 3, 0], [1, 3, 12], [2, 3, 24]], 36);
          this.models.set(m, gpu);
        }
        gl.uniformMatrix3fv(this.model.u.basis, false, s.basis || IDENTITY3);
        gl.uniform1f(this.model.u.skinAmt, s.skin || 0); // a skinned model: its skin at this strength
        gl.uniform1i(this.model.u.skinKind, s.skinKind || 0); // 0 metal, 1 organic, 2 muscle
        gl.uniform1f(this.model.u.skinScale, s.skinScale || 1 / 24);
        if (s.offset) gl.uniform3fv(this.model.u.offset, s.offset);
        else gl.uniform3f(this.model.u.offset, 2 * s.x, 0, -2 * s.y);
        gl.uniform1f(this.model.u.bright, s.bright || 1);
        gl.bindVertexArray(gpu);
        gl.drawArrays(gl.TRIANGLES, 0, m.count);
      }
      if (pass === 0 && boxes.length) {
        const data = new Float32Array(boxes.length * 36 * 9);
        let o = 0;
        for (const b of boxes) o = boxVerts(data, o, b, this.palette);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.boxBuf);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
        gl.uniformMatrix3fv(this.model.u.basis, false, IDENTITY3);
        gl.uniform1f(this.model.u.skinAmt, 0);
        gl.uniform3f(this.model.u.offset, 0, 0, 0);
        gl.uniform1f(this.model.u.bright, 1.4);
        gl.bindVertexArray(this.boxVao);
        gl.drawArrays(gl.TRIANGLES, 0, o / 9);
      }
    }
    if (passes.length === 1) this.drawGlows(sprites, glows, mvp, viewM, eye, mode);
    gl.bindVertexArray(null);
  }

  // Glowing things, added to what is behind them: additive parts of models (fireballs, beams, tracers)
  // and halos (billboards, soft round light) at light sources. Depth tested, not written.
  drawGlows(sprites, glows, mvp, view, eye, mode) {
    const gl = this.gl;
    const add = sprites.filter((s) => s.additive);
    if (!add.length && !glows.length) return;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    if (add.length) {
      gl.useProgram(this.model.prog);
      gl.uniform1i(this.model.u.glow, 1);
      gl.uniform1f(this.model.u.skinAmt, 0);
      for (const s of add) {
        const m = s.mesh;
        let gpu = this.models.get(m);
        if (!gpu) {
          const buf = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buf);
          gl.bufferData(gl.ARRAY_BUFFER, m.data, gl.STATIC_DRAW);
          gpu = vao(gl, buf, [[0, 3, 0], [1, 3, 12], [2, 3, 24]], 36);
          this.models.set(m, gpu);
        }
        gl.uniformMatrix3fv(this.model.u.basis, false, s.basis || IDENTITY3);
        gl.uniform3fv(this.model.u.offset, s.offset);
        gl.uniform1f(this.model.u.bright, s.bright || 1);
        gl.uniform1f(this.model.u.glowAmt, s.glowAmt ?? 1);
        gl.bindVertexArray(gpu);
        gl.drawArrays(gl.TRIANGLES, 0, m.count);
      }
      gl.uniform1i(this.model.u.glow, 0);
    }
    if (glows.length) {
      // camera-facing quads: the view's right and up are the first two rows of the view matrix
      const R = [view[0], view[4], view[8]], U = [view[1], view[5], view[9]];
      const d = new Float32Array(glows.length * 6 * 9);
      let o = 0;
      for (const q of glows) {
        const corner = (a, b) => { d.set([q.pos[0] + (R[0] * a + U[0] * b) * q.size, q.pos[1] + (R[1] * a + U[1] * b) * q.size, q.pos[2] + (R[2] * a + U[2] * b) * q.size, a, b, ...q.rgb, q.intensity ?? 1], o); o += 9; };
        corner(-1, -1); corner(1, -1); corner(1, 1); corner(-1, -1); corner(1, 1); corner(-1, 1);
      }
      gl.useProgram(this.glowProg.prog);
      gl.uniformMatrix4fv(this.glowProg.u.mvp, false, mvp);
      gl.uniform3fv(this.glowProg.u.eyePos, eye);
      gl.uniform4fv(this.glowProg.u.haze, mode === 'abuse' ? this.haze : [0, 0, 0, 0]);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glowBuf);
      gl.bufferData(gl.ARRAY_BUFFER, d, gl.STREAM_DRAW);
      gl.bindVertexArray(this.glowVao);
      gl.drawArrays(gl.TRIANGLES, 0, glows.length * 6);
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  // Where a screen point (pixels from the top left) looks onto the lane's
  // centre plane (Y = 0), in level pixels; null when it looks away from it.
  pick(sx, sy, width, height) {
    const inv = invert(this.mvp);
    if (!inv) return null;
    const nx = (2 * sx) / width - 1, ny = 1 - (2 * sy) / height;
    const un = (x, y, z) => {
      const v = [0, 1, 2, 3].map((r) => inv[r] * x + inv[4 + r] * y + inv[8 + r] * z + inv[12 + r]);
      return [v[0] / v[3], v[1] / v[3], v[2] / v[3]];
    };
    const a = un(nx, ny, -1), b = un(nx, ny, 1);
    const dy = b[1] - a[1];
    if (Math.abs(dy) < 1e-9) return null;
    const t = -a[1] / dy;
    if (t < 0) return null;
    return { x: (a[0] + t * (b[0] - a[0])) / 2, y: -(a[2] + t * (b[2] - a[2])) / 2 };
  }
}

const IDENTITY3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

// A box over a pixel rectangle, 2 px deep around its depth (b.depth, or the lane centre).
function boxVerts(d, o, b, pal) {
  const dep = b.depth || 0;
  const x0 = 2 * b.x, x1 = 2 * (b.x + b.w), z0 = -2 * b.y, z1 = -2 * (b.y + b.h), y0 = dep - (b.half || 2), y1 = dep + (b.half || 2);
  const c = [pal[b.idx * 3] / 255, pal[b.idx * 3 + 1] / 255, pal[b.idx * 3 + 2] / 255];
  const q = (p, n) => { for (const v of [p[0], p[1], p[2], p[0], p[2], p[3]]) { d.set([v[0], v[1], v[2], n[0], n[1], n[2], c[0], c[1], c[2]], o); o += 9; } };
  q([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]);
  q([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0]);
  q([[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], [-1, 0, 0]);
  q([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0]);
  q([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, 1]);
  q([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, -1]);
  return o;
}

function vao(gl, buf, attribs, stride) {
  const v = gl.createVertexArray();
  gl.bindVertexArray(v);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  for (const [loc, size, off] of attribs) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off); }
  gl.bindVertexArray(null);
  return v;
}

// gl_rsurf.c AllocBlock, one page
function allocBlock(allocated, w, h) {
  let best = BLOCK, x = 0, y = 0;
  for (let i = 0; i < BLOCK - w; i++) {
    let best2 = 0, j;
    for (j = 0; j < w; j++) {
      if (allocated[i + j] >= best) break;
      if (allocated[i + j] > best2) best2 = allocated[i + j];
    }
    if (j === w) { x = i; y = best = best2; } // this is a valid spot
  }
  if (best + h > BLOCK) throw new Error('AllocBlock: full');
  for (let i = 0; i < w; i++) allocated[x + i] = best + h;
  return [x, y];
}

function uniforms(gl, prog, names) {
  const u = {};
  for (const n of names) u[n] = gl.getUniformLocation(prog, n);
  return u;
}

function program(gl, vs, fs, uniforms) {
  const prog = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(prog, s);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const u = {};
  for (const n of uniforms) u[n] = gl.getUniformLocation(prog, n);
  return { prog, u };
}

// column-major 4x4 matrices, as OpenGL's fixed pipeline built them
const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
function rotate(m, deg, x, y, z) { // glRotatef
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return mul(m, new Float32Array([
    t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0,
    t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0,
    t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0,
    0, 0, 0, 1]));
}
function translate(m, x, y, z) { return mul(m, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1])); }
function perspective(fovy, aspect, near, far) { // MYgluPerspective via glFrustum
  const ymax = near * Math.tan((fovy * Math.PI) / 360), xmax = ymax * aspect;
  return new Float32Array([
    near / xmax, 0, 0, 0,
    0, near / ymax, 0, 0,
    0, 0, -(far + near) / (far - near), -1,
    0, 0, (-2 * far * near) / (far - near), 0]);
}
function lookAt(eye, target, up) { // gluLookAt
  const f = norm([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
  const s = norm(cross(f, up)), u = cross(s, f);
  return translate(new Float32Array([s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, 0, 0, 0, 1]), -eye[0], -eye[1], -eye[2]);
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
function invert(m) {
  const inv = new Float64Array(16);
  inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
  inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
  inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
  inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
  inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
  inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
  inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
  inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
  inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
  inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
  inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
  inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
  inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
  inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
  inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
  inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
  const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  if (!det) return null;
  for (let i = 0; i < 16; i++) inv[i] /= det;
  return inv;
}
