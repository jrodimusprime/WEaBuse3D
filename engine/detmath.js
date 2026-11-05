// Deterministic trigonometry. ECMAScript only approximately specifies
// Math.sin/cos/atan2, and engines differ in the last bit, so the game never
// calls them. Angles are integers: 65536 units per turn (Quake's 16-bit
// network angle). The sine table is built with a Taylor series using only
// + - * /, which IEEE 754 defines exactly, so every engine builds the same
// table.

export const ANGLE_UNITS = 65536;
const QUARTER = ANGLE_UNITS / 4;
const PI = 3.141592653589793; // Math.PI, written out

function taylorSin(x) {
  // x in [0, pi/2]; 15 terms is far past double precision there
  let term = x, sum = x;
  const x2 = x * x;
  for (let n = 1; n < 15; n++) {
    term = (-term * x2) / ((2 * n) * (2 * n + 1));
    sum += term;
  }
  return sum;
}

const QUARTER_TABLE = new Float64Array(QUARTER + 1);
for (let i = 0; i <= QUARTER; i++) QUARTER_TABLE[i] = taylorSin((i * PI) / (2 * QUARTER));
QUARTER_TABLE[QUARTER] = 1;

export function isin(a) {
  a &= ANGLE_UNITS - 1;
  if (a < QUARTER) return QUARTER_TABLE[a];
  if (a < 2 * QUARTER) return QUARTER_TABLE[2 * QUARTER - a];
  if (a < 3 * QUARTER) return -QUARTER_TABLE[a - 2 * QUARTER];
  return -QUARTER_TABLE[ANGLE_UNITS - a];
}

export const icos = (a) => isin(a + QUARTER);

// degrees (any real number, e.g. from the mouse) to angle units, rounded
export const fromDegrees = (deg) => Math.round((deg * ANGLE_UNITS) / 360);
export const toDegrees = (a) => (a * 360) / ANGLE_UNITS;

// mathlib.c AngleVectors with integer angles [pitch, yaw, roll]
export function angleVectors([pitch, yaw, roll]) {
  const sy = isin(yaw), cy = icos(yaw);
  const sp = isin(pitch), cp = icos(pitch);
  const sr = isin(roll), cr = icos(roll);
  return {
    forward: [cp * cy, cp * sy, -sp],
    right: [-1 * sr * sp * cy + -1 * cr * -sy, -1 * sr * sp * sy + -1 * cr * cy, -1 * sr * cp],
    up: [cr * sp * cy + -sr * -sy, cr * sp * sy + -sr * cy, cr * cp],
  };
}
