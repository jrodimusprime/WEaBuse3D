// A 2D solid-leaf BSP over convex polygons, in Abuse pixel space (y down).
//
// An Abuse level is a flat picture pushed out along the depth axis, so its 3D
// BSP is a 2D BSP of the tile outlines with every leaf extruded. This builds
// that 2D tree. Splitting lines are always lines that some outline edge lies
// on, kept as exact integer triples, so the tree is the same on every run and
// every JavaScript engine.
//
// A line {a, b, c} is the set a*x + b*y = c. Its front side is a*x + b*y > c,
// like Quake's "d >= 0 goes to children[0]".

const EPS = 1e-7;

function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }

// The canonical form of a line: the Quake plane normal (a, 0, -b) points along
// its largest component's positive axis (qbsp FindPlane), and the integers are
// reduced. Returns the line and whether it had to be flipped.
export function canonLine(a, b, c) {
  let flip = false;
  if (Math.abs(a) >= Math.abs(b) ? a < 0 : b > 0) { a = -a; b = -b; c = -c; flip = true; }
  const g = gcd(gcd(a, b), c) || 1;
  return { line: { a: a / g, b: b / g, c: c / g, key: `${a / g},${b / g},${c / g}` }, flip };
}

export const side = (l, p) => l.a * p[0] + l.b * p[1] - l.c;

export function area2(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    s += p[0] * q[1] - q[0] * p[1];
  }
  return s;
}

// A shape: convex polygon `pts` (positive area) and, for each edge i -> i+1,
// the line it lies on. The polygon is inside every edge line's back side.
export function makeShape(pts) {
  const lines = pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    // outward normal of a positive-area polygon's edge (dx, dy) is (dy, -dx)
    const a = q[1] - p[1], b = p[0] - q[0];
    return canonLine(a, b, a * p[0] + b * p[1]).line;
  });
  return { pts, lines };
}

// Splits a shape (or a region, which is a shape too) by a line into its front
// and back parts; either can be null. New edges lie on `line`.
export function splitShape(s, line) {
  const d = s.pts.map((p) => side(line, p));
  if (d.every((v) => v >= -EPS)) return [s, null];
  if (d.every((v) => v <= EPS)) return [null, s];
  const front = { pts: [], lines: [] }, back = { pts: [], lines: [] };
  const n = s.pts.length;
  for (let i = 0; i < n; i++) {
    const p = s.pts[i], q = s.pts[(i + 1) % n];
    const dp = d[i], dq = d[(i + 1) % n];
    const edge = s.lines[i];
    if (dp >= -EPS) { front.pts.push(p); front.lines.push(edge); }
    if (dp <= EPS) { back.pts.push(p); back.lines.push(edge); }
    if ((dp > EPS && dq < -EPS) || (dp < -EPS && dq > EPS)) {
      const t = dp / (dp - dq);
      const m = [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
      front.pts.push(m); front.lines.push(edge);
      back.pts.push(m); back.lines.push(edge);
    }
  }
  // The edge leaving the new point that lies on `line` must carry `line`: fix
  // up by walking each part and giving `line` to edges whose ends are both on it.
  for (const part of [front, back]) {
    for (let i = 0; i < part.pts.length; i++) {
      const p = part.pts[i], q = part.pts[(i + 1) % part.pts.length];
      if (Math.abs(side(line, p)) <= EPS && Math.abs(side(line, q)) <= EPS) part.lines[i] = line;
    }
  }
  const ok = (part) => part.pts.length >= 3 && Math.abs(area2(part.pts)) > 1e-6;
  return [ok(front) ? clean(front) : null, ok(back) ? clean(back) : null];
}

// drop points that repeat the next one (a split exactly through a vertex)
function clean(s) {
  const pts = [], lines = [];
  for (let i = 0; i < s.pts.length; i++) {
    const p = s.pts[i], q = s.pts[(i + 1) % s.pts.length];
    if (Math.abs(p[0] - q[0]) <= EPS && Math.abs(p[1] - q[1]) <= EPS) continue;
    pts.push(p); lines.push(s.lines[i]);
  }
  return { pts, lines };
}

// whether `line` cuts `region` into two parts with area
function splits(region, line) {
  let f = false, b = false;
  for (const p of region.pts) {
    const d = side(line, p);
    if (d > EPS) f = true; else if (d < -EPS) b = true;
    if (f && b) return true;
  }
  return false;
}

// the region lies inside the shape when no edge line of the shape cuts it
function covers(shape, region) {
  for (const l of shape.lines) if (splits(region, l)) return false;
  // every edge line leaves the region on one side; it must be the inner (back) side
  for (let i = 0; i < shape.lines.length; i++) {
    const l = shape.lines[i];
    const inner = side(l, centroid(shape.pts)) <= 0 ? -1 : 1;
    for (const p of region.pts) if (side(l, p) * inner < -EPS) return false;
  }
  return true;
}

export function centroid(pts) {
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [x / pts.length, y / pts.length];
}

function classify(s, line) {
  let f = false, b = false;
  for (const p of s.pts) {
    const d = side(line, p);
    if (d > EPS) f = true; else if (d < -EPS) b = true;
  }
  return f && b ? 0 : f ? 1 : b ? -1 : 1;
}

// Picks the splitting line: one that cuts the region, splits few shapes and
// balances the two sides. Axial lines are preferred (cheaper faces and traces).
function chooseSplitter(shapes, region) {
  const seen = new Set();
  const cands = [];
  const step = shapes.length > 48 ? Math.ceil(shapes.length / 48) : 1;
  for (let i = 0; i < shapes.length; i += step) {
    for (const l of shapes[i].lines) {
      if (seen.has(l.key)) continue;
      seen.add(l.key);
      if (splits(region, l)) cands.push(l);
    }
  }
  let best = null, bestScore = Infinity;
  for (const l of cands) {
    let fr = 0, bk = 0, sp = 0;
    for (const s of shapes) {
      const c = classify(s, l);
      if (c === 0) sp++; else if (c > 0) fr++; else bk++;
    }
    const score = sp * 4 + Math.abs(fr - bk) + (l.a !== 0 && l.b !== 0 ? 3 : 0);
    if (score < bestScore) { bestScore = score; best = l; }
  }
  return best;
}

// Builds the tree. Nodes: {line, region, front, back}. Leaves: {solid: true}
// or {solid: false, region}. `region` is a shape (convex polygon + edge lines).
export function buildTree(shapes, region) {
  shapes = shapes.map((s) => clip(s, region)).filter(Boolean);
  return build(shapes, region);
}

function clip(s, region) {
  let cur = s;
  for (let i = 0; i < region.pts.length && cur; i++) {
    // region edges: inside is the back side of the region's own edge line
    const l = region.lines[i];
    const c = centroid(region.pts);
    const [f, b] = splitShape(cur, l);
    cur = side(l, c) <= 0 ? b : f;
  }
  return cur;
}

function build(shapes, region) {
  if (!shapes.length) return { solid: false, region };
  for (const s of shapes) if (covers(s, region)) return { solid: true, region };
  const line = chooseSplitter(shapes, region);
  if (!line) return { solid: true, region }; // nothing cuts the region: shapes fill it
  const [rf, rb] = splitShape(region, line);
  const sf = [], sb = [];
  for (const s of shapes) {
    const [f, b] = splitShape(s, line);
    if (f) sf.push(f);
    if (b) sb.push(b);
  }
  return { line, region, front: build(sf, rf), back: build(sb, rb) };
}

// A convex polygon expanded by a box (Minkowski sum): `l`, `r` pixels to the
// left and right, `u` up and `d` down. Used for Quake's clipping hulls.
export function expand(pts, l, r, u, d) {
  const all = [];
  for (const [x, y] of pts) for (const [dx, dy] of [[-l, -u], [r, -u], [r, d], [-l, d]]) all.push([x + dx, y + dy]);
  return convexHull(all);
}

// Monotone chain; returns a positive-area polygon without collinear points.
export function convexHull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop(); lower.push(q); }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop(); upper.push(q); }
  upper.pop(); lower.pop();
  const hull = lower.concat(upper);
  return area2(hull) < 0 ? hull.reverse() : hull;
}

// Walks a tree and counts nodes and leaves (for logs and tests).
export function treeStats(t) {
  if (!t.line) return { nodes: 0, solid: t.solid ? 1 : 0, empty: t.solid ? 0 : 1 };
  const f = treeStats(t.front), b = treeStats(t.back);
  return { nodes: 1 + f.nodes + b.nodes, solid: f.solid + b.solid, empty: f.empty + b.empty };
}

// The leaf a point falls in.
export function leafAt(t, p) {
  while (t.line) t = side(t.line, p) >= 0 ? t.front : t.back;
  return t;
}
