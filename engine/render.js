// Draws the world model with WebGL2. The structure follows GLQuake:
//   gl_rsurf.c  AllocBlock (lightmap packing), BuildSurfaceDisplayList (texture
//               and lightmap coordinates, +8 to sample luxel centres)
//   gl_rmain.c  R_SetupGL (Quake's axes: Z up; view rotations), MYgluPerspective
// Textures are the BSP's palette-index miptex, expanded through Abuse's palette.
// Lighting is the baked lightmap (Abuse's light levels), times a brightness.
//
// Not yet ported (M3): R_RecursiveWorldNode / R_MarkLeaves visibility. Every
// face is drawn every frame, which is cheap at this size.

const BLOCK = 1024; // lightmap atlas size, in luxels

const VS = `#version 300 es
layout(location=0) in vec3 pos;
layout(location=1) in vec2 uv;
layout(location=2) in vec2 luv;
uniform mat4 mvp;
out vec2 vUv; out vec2 vLuv;
void main() { vUv = uv; vLuv = luv; gl_Position = mvp * vec4(pos, 1.0); }`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vLuv;
uniform sampler2D tex; uniform sampler2D lightmap; uniform float brightness;
out vec4 color;
void main() {
  vec3 c = texture(tex, vUv).rgb;
  float l = texture(lightmap, vLuv).r * brightness;
  color = vec4(c * l, 1.0);
}`;

export class WorldRenderer {
  constructor(gl) {
    this.gl = gl;
    this.prog = program(gl, VS, FS);
    this.loc = { mvp: gl.getUniformLocation(this.prog, 'mvp'), tex: gl.getUniformLocation(this.prog, 'tex'), lightmap: gl.getUniformLocation(this.prog, 'lightmap'), brightness: gl.getUniformLocation(this.prog, 'brightness') };
    this.brightness = 1;
  }

  // palette: 768 bytes (Quake palette.lmp layout)
  load(model, palette) {
    const gl = this.gl;
    // textures
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
      if (s.samples >= 0 && model.lightdata) {
        for (let t = 0; t < tmax; t++) atlas.set(model.lightdata.subarray(s.samples + t * smax, s.samples + (t + 1) * smax), (y + t) * BLOCK + x);
      } else {
        for (let t = 0; t < tmax; t++) atlas.fill(255, (y + t) * BLOCK + x, (y + t) * BLOCK + x + smax);
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

    // vertices, grouped by texture (BuildSurfaceDisplayList, fans as triangles)
    const byTex = new Map();
    for (const s of model.surfaces) {
      const k = s.texinfo.miptex;
      if (!byTex.has(k)) byTex.set(k, []);
      byTex.get(k).push(s);
    }
    const data = [];
    this.groups = [];
    for (const [k, list] of [...byTex].sort((a, b) => a[0] - b[0])) {
      const first = data.length / 7;
      const t = model.textures[k];
      for (const s of list) {
        const vecs = s.texinfo.vecs;
        const vert = (v) => {
          const ss = v[0] * vecs[0][0] + v[1] * vecs[0][1] + v[2] * vecs[0][2] + vecs[0][3];
          const tt = v[0] * vecs[1][0] + v[1] * vecs[1][1] + v[2] * vecs[1][2] + vecs[1][3];
          data.push(v[0], v[1], v[2], ss / t.width, tt / t.height,
            (ss - s.texturemins[0] + s.light_s * 16 + 8) / (BLOCK * 16),
            (tt - s.texturemins[1] + s.light_t * 16 + 8) / (BLOCK * 16));
        };
        for (let i = 1; i + 1 < s.verts.length; i++) { vert(s.verts[0]); vert(s.verts[i]); vert(s.verts[i + 1]); }
      }
      this.groups.push({ tex: this.textures[k], first, count: data.length / 7 - first });
    }
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 28, 20);
    gl.bindVertexArray(null);
    this.triangles = data.length / 21;
  }

  // origin: eye position; angles: [pitch, yaw, roll] in degrees (Quake's viewangles)
  draw(origin, angles, width, height, fovX = 90) {
    const gl = this.gl;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(this.prog);
    const aspect = width / height;
    const fovY = (2 * Math.atan(Math.tan((fovX * Math.PI) / 360) / aspect) * 180) / Math.PI; // CalcFov
    const proj = perspective(fovY, aspect, 4, 16384);
    // R_SetupGL: put Z going up, then the view's roll, pitch and yaw, then the origin
    let view = rotate(identity(), -90, 1, 0, 0);
    view = rotate(view, 90, 0, 0, 1);
    view = rotate(view, -angles[2], 1, 0, 0);
    view = rotate(view, -angles[0], 0, 1, 0);
    view = rotate(view, -angles[1], 0, 0, 1);
    view = translate(view, -origin[0], -origin[1], -origin[2]);
    gl.uniformMatrix4fv(this.loc.mvp, false, mul(proj, view));
    gl.uniform1f(this.loc.brightness, this.brightness);
    gl.uniform1i(this.loc.tex, 0);
    gl.uniform1i(this.loc.lightmap, 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lightmap);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(this.vao);
    for (const g of this.groups) {
      gl.bindTexture(gl.TEXTURE_2D, g.tex);
      gl.drawArrays(gl.TRIANGLES, g.first, g.count);
    }
    gl.bindVertexArray(null);
  }
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

function program(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
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
  const r = new Float32Array([
    t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0,
    t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0,
    t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0,
    0, 0, 0, 1]);
  return mul(m, r);
}
function translate(m, x, y, z) { return mul(m, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1])); }
function perspective(fovy, aspect, near, far) { // MYgluPerspective via glFrustum
  const ymax = near * Math.tan((fovy * Math.PI) / 360), xmax = ymax * aspect;
  const l = -xmax, r = xmax, b = -ymax, t = ymax;
  return new Float32Array([
    (2 * near) / (r - l), 0, 0, 0,
    0, (2 * near) / (t - b), 0, 0,
    (r + l) / (r - l), (t + b) / (t - b), -(far + near) / (far - near), -1,
    0, 0, (-2 * far * near) / (far - near), 0]);
}
