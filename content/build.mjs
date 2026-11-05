// Builds level BSPs:  node content/build.mjs [level numbers...]   (default: 0)
// Writes web/maps/levelNN.bsp and web/maps/palette.lmp (Abuse's palette, Quake's 768-byte format).
import { writeFile, mkdir } from 'node:fs/promises';
import { loadLevelInput, loadAssets } from './level-input.mjs';
import { compileLevel } from './compile.mjs';
import { writeBSP2 } from './bsp2-write.mjs';

const OUT = new URL('../web/maps/', import.meta.url);

export async function buildLevel(n) {
  const name = `level${String(n).padStart(2, '0')}`;
  const input = await loadLevelInput(`${name}.spe`);
  const bsp = compileLevel(input);
  return { name, bytes: writeBSP2(bsp), bsp, input };
}

export async function paletteLmp() {
  const a = await loadAssets();
  const out = new Uint8Array(768);
  for (let i = 0; i < 256; i++) for (let c = 0; c < 3; c++) out[i * 3 + c] = a.palette[i * 4 + c];
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const levels = process.argv.slice(2).map(Number);
  await mkdir(OUT, { recursive: true });
  await writeFile(new URL('palette.lmp', OUT), await paletteLmp());
  for (const n of levels.length ? levels : [0]) {
    const t = Date.now();
    const { name, bytes, bsp } = await buildLevel(n);
    await writeFile(new URL(`${name}.bsp`, OUT), bytes);
    console.log(`${name}.bsp  ${(bytes.length / 1024).toFixed(0)} KB  ${bsp.faces.length} faces  ${bsp.nodes.length} nodes  ${bsp.leafs.length} leaves  ${bsp.clipnodes.length} clipnodes  ${bsp.textures.length} textures  ${Date.now() - t} ms`);
  }
}
