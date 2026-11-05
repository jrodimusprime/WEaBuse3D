// Ladders through floors (shared by the map compiler and the depth layer).
//
// In Abuse a ladder often runs up through a solid floor tile: the climber passes through it, and standing on
// it, it is floor. In 3D the floor is a slab across the whole hall, so the climber went up into solid floor
// (Jared: the ladder is "hidden at the top with a walk-through image", and you could end up in the walls).
// So, like a Quake ladder shaft: the compiler leaves the floor cells a ladder passes through open, and the depth
// layer closes them again with frame walls everywhere but a hole the ladder's size against the back wall,
// where the ladder is painted. The climber is drawn to the ladder, and in the hole is held to it.
//
// ladders: [{x0, y0, x1, y1}] (sim game.js: a LADDER object and its link: the top-left and bottom-right).
// solid(n): whether foreground tile n has any solid pixels.
// Returns [{x0, x1, y0, y1, cells: [cell index], tile}], one per run of floor cells a ladder passes through,
// x1 and y1 inclusive, in level pixels.
export function ladderHoles({ ladders, fgW, fgH, fgmap, tw, th, solid }) {
  const out = [];
  for (const l of ladders) {
    const cols = [];
    for (let tx = Math.floor(l.x0 / tw); tx <= Math.floor(l.x1 / tw); tx++) {
      const mid = tx * tw + tw / 2; // a column the ladder covers, not one it only grazes
      if (tx >= 0 && tx < fgW && mid >= l.x0 - 5 && mid <= l.x1 + 5) cols.push(tx);
    }
    if (!cols.length) continue;
    let run = null;
    for (let ty = Math.max(0, Math.floor(l.y0 / th)); ty < fgH && ty * th < l.y1 - 4; ty++) { // (not the floor it stands on)
      const cells = cols.map((tx) => ty * fgW + tx).filter((i) => solid(fgmap[i]));
      if (!cells.length || ty * th + th <= l.y0) { run = null; continue; }
      if (!run) { run = { x0: cols[0] * tw, x1: (cols[cols.length - 1] + 1) * tw - 1, y0: ty * th, y1: ty * th + th - 1, cells: [], tile: fgmap[cells[0]] }; out.push(run); }
      run.y1 = ty * th + th - 1;
      run.cells.push(...cells);
    }
  }
  return out;
}
