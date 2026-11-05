// A small kit for building 3D models from primitives: boxes, hexahedra,
// cylinders, ellipsoids, tori and lathes. Low-poly and flat-shaded, like a
// Quake-era model. Each vertex is 9 floats: position (3), normal (3), colour
// (3, 0-1), the same layout the renderer draws voxel models with.
//
// Axes are Quake's: X along the hall, Y across it, Z up. Units are Quake units.

export class Mesh {
  constructor() { this.v = []; }

  // `ref`: a point inside the solid the triangle belongs to; the normal is turned to face away from it
  tri(a, b, c, rgb, ref = this.ref) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const l = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) || 1;
    n = [n[0] / l, n[1] / l, n[2] / l];
    const r = typeof ref === 'function' ? ref(a, b, c) : ref;
    if (r) {
      const m = [(a[0] + b[0] + c[0]) / 3 - r[0], (a[1] + b[1] + c[1]) / 3 - r[1], (a[2] + b[2] + c[2]) / 3 - r[2]];
      if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0) n = [-n[0], -n[1], -n[2]];
    }
    for (const p of [a, b, c]) this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], rgb[0], rgb[1], rgb[2]);
    return this;
  }

  quad(a, b, c, d, rgb, ref) { return this.tri(a, b, c, rgb, ref).tri(a, c, d, rgb, ref); }

  // builds with `ref` as the inside point (or a function of the triangle giving one)
  inside(ref, fn) { const old = this.ref; this.ref = ref; fn(); this.ref = old; return this; }

  // eight corners: bottom four (z low) then top four, each counter-clockwise seen from above
  hexa(c, rgb) {
    const mid = [0, 1, 2].map((k) => c.reduce((s, p) => s + p[k], 0) / 8);
    return this.inside(mid, () => this.hexa0(c, rgb));
  }

  hexa0(c, rgb) {
    const [a, b, cc, d, e, f, g, h] = c;
    this.quad(a, d, cc, b, rgb); // bottom
    this.quad(e, f, g, h, rgb); // top
    this.quad(a, b, f, e, rgb);
    this.quad(b, cc, g, f, rgb);
    this.quad(cc, d, h, g, rgb);
    this.quad(d, a, e, h, rgb);
    return this;
  }

  // an axis-aligned box: centre and half sizes
  box([x, y, z], [hx, hy, hz], rgb) {
    return this.hexa([
      [x - hx, y - hy, z - hz], [x + hx, y - hy, z - hz], [x + hx, y + hy, z - hz], [x - hx, y + hy, z - hz],
      [x - hx, y - hy, z + hz], [x + hx, y - hy, z + hz], [x + hx, y + hy, z + hz], [x - hx, y + hy, z + hz],
    ], rgb);
  }

  // a box whose top is smaller than its bottom (a bevelled deck, a plinth)
  taper([x, y, z0], [bx, by], [tx, ty], z1, rgb) {
    return this.hexa([
      [x - bx, y - by, z0], [x + bx, y - by, z0], [x + bx, y + by, z0], [x - bx, y + by, z0],
      [x - tx, y - ty, z1], [x + tx, y - ty, z1], [x + tx, y + ty, z1], [x - tx, y + ty, z1],
    ], rgb);
  }

  // a surface of revolution about the vertical axis through `c`: profile is [[radius, z], ...] bottom to top
  lathe(c, profile, n, rgb) {
    const zs = profile.map((q) => q[1]), zm = (Math.min(...zs) + Math.max(...zs)) / 2;
    return this.inside((a, b, cc) => [c[0], c[1], Math.min(Math.max((a[2] + b[2] + cc[2]) / 3, c[2] + Math.min(...zs) + 1e-3), c[2] + Math.max(...zs) - 1e-3) + 0 * zm], () => this.lathe0(c, profile, n, rgb));
  }

  lathe0(c, profile, n, rgb) {
    const ring = (r, z, i) => { const a = (i / n) * Math.PI * 2; return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), c[2] + z]; };
    for (let k = 0; k + 1 < profile.length; k++) {
      const [r0, z0] = profile[k], [r1, z1] = profile[k + 1];
      for (let i = 0; i < n; i++) {
        const a = ring(r0, z0, i), b = ring(r0, z0, i + 1), d = ring(r1, z1, i), e = ring(r1, z1, i + 1);
        if (r0 > 0) this.tri(a, b, e, rgb);
        if (r1 > 0) this.tri(a, e, d, rgb);
      }
    }
    // caps
    const bot = profile[0], top = profile[profile.length - 1];
    for (let i = 0; i < n; i++) {
      if (bot[0] > 0) this.tri([c[0], c[1], c[2] + bot[1]], ring(bot[0], bot[1], i + 1), ring(bot[0], bot[1], i), rgb);
      if (top[0] > 0) this.tri([c[0], c[1], c[2] + top[1]], ring(top[0], top[1], i), ring(top[0], top[1], i + 1), rgb);
    }
    return this;
  }

  // a cylinder standing on the vertical axis: centre of its base, radius, height
  cylinder(c, r, h, n, rgb) { return this.lathe(c, [[r, 0], [r, h]], n, rgb); }

  // a cylinder lying along +X: the centre of its back end, radius, length (a barrel)
  cylinderX(c, r, len, n, rgb) {
    const ring = (x, i) => { const a = (i / n) * Math.PI * 2; return [c[0] + x, c[1] + r * Math.cos(a), c[2] + r * Math.sin(a)]; };
    return this.inside((a, b, cc) => [Math.min(Math.max((a[0] + b[0] + cc[0]) / 3, c[0] + 1e-3), c[0] + len - 1e-3), c[1], c[2]], () => {
      for (let i = 0; i < n; i++) {
        this.quad(ring(0, i), ring(len, i), ring(len, i + 1), ring(0, i + 1), rgb);
        this.tri([c[0], c[1], c[2]], ring(0, i), ring(0, i + 1), rgb);
        this.tri([c[0] + len, c[1], c[2]], ring(len, i + 1), ring(len, i), rgb);
      }
    });
  }

  // an ellipsoid: centre, radii, rings and segments
  ellipsoid(c, [rx, ry, rz], rings, segs, rgb) {
    return this.inside(c, () => this.ellipsoid0(c, [rx, ry, rz], rings, segs, rgb));
  }

  ellipsoid0(c, [rx, ry, rz], rings, segs, rgb) {
    const p = (i, j) => {
      const th = (i / rings) * Math.PI, ph = (j / segs) * Math.PI * 2;
      return [c[0] + rx * Math.sin(th) * Math.cos(ph), c[1] + ry * Math.sin(th) * Math.sin(ph), c[2] + rz * Math.cos(th)];
    };
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < segs; j++) {
        const a = p(i, j), b = p(i + 1, j), d = p(i, j + 1), e = p(i + 1, j + 1);
        if (i > 0) this.tri(a, d, b, rgb);
        if (i < rings - 1) this.tri(b, d, e, rgb);
      }
    }
    return this;
  }

  // a torus lying flat (about the vertical axis): centre, ring radius R, tube radius r
  torus(c, R, r, n, m, rgb) {
    // inside a torus: the nearest point of the circle through the middle of its tube
    const tube = (a, b, cc) => {
      const x = (a[0] + b[0] + cc[0]) / 3 - c[0], y = (a[1] + b[1] + cc[1]) / 3 - c[1], l = Math.sqrt(x * x + y * y) || 1;
      return [c[0] + (R * x) / l, c[1] + (R * y) / l, c[2]];
    };
    return this.inside(tube, () => this.torus0(c, R, r, n, m, rgb));
  }

  torus0(c, R, r, n, m, rgb) {
    const p = (i, j) => {
      const a = (i / n) * Math.PI * 2, b = (j / m) * Math.PI * 2;
      const rr = R + r * Math.cos(b);
      return [c[0] + rr * Math.cos(a), c[1] + rr * Math.sin(a), c[2] + r * Math.sin(b)];
    };
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) this.quad(p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1), rgb);
    return this;
  }

  done() { return { data: new Float32Array(this.v), count: this.v.length / 9 }; }
}

// Rotation matrices (column-major mat3) about the vertical (yaw), across (pitch) and along (roll) axes, in radians.
export function rotation(yaw = 0, pitch = 0, roll = 0) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  // R = Rz(yaw) * Ry(pitch) * Rx(roll)
  const m = [
    [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
    [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
    [-sp, cp * sr, cp * cr],
  ];
  return new Float32Array([m[0][0], m[1][0], m[2][0], m[0][1], m[1][1], m[2][1], m[0][2], m[1][2], m[2][2]]);
}

// Colours of a sprite, for a model in the sprite's own palette: the most used
// colour, the darkest, the brightest, and the most vivid (by saturation x light).
export function spriteColours(img, palette) {
  const count = new Map();
  for (const i of img.pix) if (i) count.set(i, (count.get(i) || 0) + 1);
  const rgb = (i) => [palette[i * 3] / 255, palette[i * 3 + 1] / 255, palette[i * 3 + 2] / 255];
  const list = [...count].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([i]) => ({ i, c: rgb(i) }));
  if (!list.length) { const g = [0.4, 0.4, 0.42]; return { body: g, main: g, second: g, dark: [0.1, 0.1, 0.1], light: [0.7, 0.7, 0.7], vivid: g, red: [0.6, 0.1, 0.1] }; }
  const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  const sat = (c) => Math.max(...c) - Math.min(...c);
  const by = (f) => list.reduce((a, b) => (f(b.c) > f(a.c) ? b : a), list[0]).c;
  // the body colour: the average of the most used colours (an outline colour alone is often near black)
  const top = list.slice(0, 6), total = top.reduce((a, q) => a + count.get(q.i), 0) || 1;
  const body = [0, 1, 2].map((k) => top.reduce((a, q) => a + q.c[k] * count.get(q.i), 0) / total);
  return {
    body: lum(body) < 0.18 ? shade(body, 0.18 / Math.max(lum(body), 0.02)) : body,
    main: list[0]?.c || [0.5, 0.5, 0.5],
    second: (list[1] || list[0])?.c || [0.4, 0.4, 0.4],
    dark: by((c) => -lum(c)),
    light: by(lum),
    vivid: by((c) => sat(c) * (0.4 + lum(c))),
    red: by((c) => c[0] - (c[1] + c[2]) / 2),
  };
}

export const shade = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
