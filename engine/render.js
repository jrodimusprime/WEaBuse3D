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

const BLOCK = 1024; // lightmap atlas size, in luxels
const MAX_LIGHTS = 256;

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
${ABUSE_LIGHT}
out vec4 color;
void main() {
  vec3 c = texture(tex, vUv).rgb;
  if (mode == 0) c *= texture(lightmap, vLuv).r;
  else if (mode == 1) c = abuseLit(c, vec2(vPos.x / 2.0, -vPos.z / 2.0));
  c *= vShade * brightness;
  c.r = min(1.0, c.r + red);
  color = vec4(c, 1.0);
}`;

const MODEL_VS = `#version 300 es
layout(location=0) in vec3 pos;
layout(location=1) in vec3 normal;
layout(location=2) in vec3 rgb;
uniform mat4 mvp; uniform mat3 basis; uniform vec3 offset;
out vec3 vPos; out vec3 vRgb; out float vShade;
void main() {
  vec3 w = basis * pos + offset;
  vec3 n = normalize(basis * normal);
  vPos = w; vRgb = rgb;
  // light from above and from the front of the hall, plus some from the sides
  vShade = 0.66 + 0.22 * max(n.z, 0.0) + 0.12 * abs(n.y) + 0.08 * abs(n.x) - 0.18 * max(-n.z, 0.0);
  gl_Position = mvp * vec4(w, 1.0);
}`;

const MODEL_FS = `#version 300 es
precision highp float;
in vec3 vPos; in vec3 vRgb; in float vShade;
uniform float brightness; uniform int mode; uniform float bright; uniform float red;
${ABUSE_LIGHT}
out vec4 color;
void main() {
  vec3 c = min(vRgb * bright, 1.0);
  if (mode == 1) c = abuseLit(c, vec2(vPos.x / 2.0, -vPos.z / 2.0));
  c *= vShade * brightness;
  c.r = min(1.0, c.r + red);
  color = vec4(c, 1.0);
}`;

export class Renderer {
  constructor(gl) {
    this.gl = gl;
    this.world = program(gl, WORLD_VS, WORLD_FS, ['mvp', 'tex', 'lightmap', 'brightness', 'mode', 'red', 'lights', 'nLights', 'ambient']);
    this.model = program(gl, MODEL_VS, MODEL_FS, ['mvp', 'basis', 'offset', 'brightness', 'mode', 'bright', 'red', 'lights', 'nLights', 'ambient']);
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
      for (let i = 0; i < t.width * t.height; i++) {
        const c = t.pixels[i] * 3;
        rgba[i * 4] = palette[c]; rgba[i * 4 + 1] = palette[c + 1]; rgba[i * 4 + 2] = palette[c + 2]; rgba[i * 4 + 3] = 255;
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
    const capModel = model.models[1];
    const kindOf = (s, i) => {
      if (capModel && i >= capModel.firstface && i < capModel.firstface + capModel.numfaces) return 'caps';
      if (s.plane.normal[1] === 1 && s.plane.dist === -lane && !s.planeback) return 'front';
      return 'world';
    };
    // vertices, grouped by kind and texture (BuildSurfaceDisplayList, fans as triangles)
    const groups = new Map();
    model.surfaces.forEach((s, i) => {
      const key = `${kindOf(s, i)}|${s.texinfo.miptex}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    });
    const data = [];
    this.groups = [];
    for (const [key, list] of [...groups].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const [kind, k] = key.split('|');
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
      this.groups.push({ kind, tex: this.textures[k], first, count: data.length / 8 - first });
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
    const gl = this.gl;
    const { mode = 'lightmap', front = true, caps = false, fovY = 73.74, sprites = [], boxes = [], red = 0, world = true } = opts;
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
    const shared = (p) => {
      gl.useProgram(p.prog);
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
    gl.bindVertexArray(this.worldVao);
    for (const g of world ? this.groups : []) {
      if ((g.kind === 'front' && !front) || (g.kind === 'caps' && !caps)) continue;
      gl.bindTexture(gl.TEXTURE_2D, g.tex);
      gl.drawArrays(gl.TRIANGLES, g.first, g.count);
    }
    if (world && this.frameGroups.length) {
      gl.bindVertexArray(this.frameVao);
      for (const g of this.frameGroups) { gl.bindTexture(gl.TEXTURE_2D, g.tex); gl.drawArrays(gl.TRIANGLES, g.first, g.count); }
    }

    // objects
    if (sprites.length || boxes.length) {
      shared(this.model);
      for (const s of sprites) {
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
        if (s.offset) gl.uniform3fv(this.model.u.offset, s.offset);
        else gl.uniform3f(this.model.u.offset, 2 * s.x, 0, -2 * s.y);
        gl.uniform1f(this.model.u.bright, s.bright || 1);
        gl.bindVertexArray(gpu);
        gl.drawArrays(gl.TRIANGLES, 0, m.count);
      }
      if (boxes.length) {
        const data = new Float32Array(boxes.length * 36 * 9);
        let o = 0;
        for (const b of boxes) o = boxVerts(data, o, b, this.palette);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.boxBuf);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
        gl.uniformMatrix3fv(this.model.u.basis, false, IDENTITY3);
        gl.uniform3f(this.model.u.offset, 0, 0, 0);
        gl.uniform1f(this.model.u.bright, 1.4);
        gl.bindVertexArray(this.boxVao);
        gl.drawArrays(gl.TRIANGLES, 0, o / 9);
      }
    }
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
