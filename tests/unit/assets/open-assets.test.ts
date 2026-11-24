// @ts-nocheck  (node typings are not part of this project's tsconfig; the file runs under vitest in node)
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OPEN_ASSETS } from '@/assets/open/manifest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const OPEN = join(ROOT, 'src/assets/open');
const credits = readFileSync(join(ROOT, 'docs/CREDITS.md'), 'utf8');
const CAPS = { car: { tris: 3800, bytes: 200_000 }, prop: { tris: 800, bytes: 60_000 }, surface: { tris: 0, bytes: 300_000 } } as const;

function glbTris(buf: Buffer): number {
  expect(buf.toString('latin1', 0, 4)).toBe('glTF');
  const jsonLen = buf.readUInt32LE(12); expect(buf.toString('latin1', 16, 20)).toBe('JSON');
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  let tris = 0;
  for (const m of json.meshes) for (const p of m.primitives) tris += (p.indices !== undefined ? json.accessors[p.indices].count : json.accessors[p.attributes.POSITION].count) / 3;
  return tris;
}
const pngSize = (b: Buffer) => [b.readUInt32BE(16), b.readUInt32BE(20)];

describe('open assets manifest', () => {
  it('has the first set: cars, props and surfaces', () => {
    expect(OPEN_ASSETS.filter((a) => a.kind === 'car').length).toBeGreaterThanOrEqual(15);
    expect(OPEN_ASSETS.filter((a) => a.kind === 'prop').length).toBeGreaterThanOrEqual(8);
    expect(OPEN_ASSETS.filter((a) => a.kind === 'surface').length).toBeGreaterThanOrEqual(10);
    expect(new Set(OPEN_ASSETS.map((a) => a.id)).size).toBe(OPEN_ASSETS.length);
  });
  for (const a of OPEN_ASSETS) {
    describe(a.id, () => {
      const file = join(OPEN, a.file);
      it('file exists, matches the recorded size and is under its caps', () => {
        expect(existsSync(file)).toBe(true);
        expect(statSync(file).size).toBe(a.bytes);
        expect(a.bytes).toBeLessThanOrEqual(CAPS[a.kind].bytes);
        expect(a.triangles).toBeLessThanOrEqual(CAPS[a.kind].tris);
        expect(['CC0', 'CC BY', 'CC BY-SA']).toContain(a.licence);
      });
      it('parses', () => {
        const buf = readFileSync(file);
        if (a.kind === 'surface') {
          expect(pngSize(buf)).toEqual([512, 512]);
          expect(pngSize(readFileSync(join(OPEN, a.file256!)))).toEqual([256, 256]);
        } else expect(glbTris(buf)).toBe(a.triangles);
      });
      it('has a SOURCE.md with page, licence and date, and a CREDITS row', () => {
        const dir = join(OPEN, a.file.split('/').slice(0, -1).join('/'));
        const src = readFileSync(join(dir, 'SOURCE.md'), 'utf8');
        expect(src).toMatch(/Page: https?:\/\//); expect(src).toMatch(/Licence: CC/); expect(src).toMatch(/Fetched: /);
        expect(credits).toContain('| `' + a.id + '` |');
      });
    });
  }
  it('no file over 600 kB and the first set stays under 6 MB', () => {
    let total = 0;
    const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else { const s = statSync(p).size; total += s; expect(s, p).toBeLessThanOrEqual(600_000); } } };
    walk(OPEN);
    expect(total).toBeLessThan(6_000_000);
  });
  it('Kenney cars keep their named wheels', () => {
    for (const a of OPEN_ASSETS.filter((x) => x.source === 'kenney' && x.kind === 'car')) expect(a.wheels, a.id).toBeGreaterThanOrEqual(4);
  });
});
