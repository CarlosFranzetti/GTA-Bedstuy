import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// scripts/webcheck.mjs is plain ESM JavaScript shared by prep.mjs and verify-package.mjs.
async function load(): Promise<{ checkWeb(dir: string): string[] }> {
  return (await import(/* @vite-ignore */ '../scripts/webcheck.mjs')) as { checkWeb(dir: string): string[] };
}
function good(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gtaweb-'));
  const put = (f: string, data = 'x') => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), data); };
  for (const f of ['index.html', 'fonts/Anton-Regular.woff2', 'fonts/Barlow-Medium.woff2', 'fonts/BarlowCondensed-Bold.woff2', 'voice/manifest.json', 'voice/banks/dj-a.mp3', 'anim/street.bin', 'anim/core.bin', 'data/brooklyn-overview.json', 'data/realmap-furniture.json', 'assets/index-abc.js', 'assets/three-abc.js', 'assets/realWorld-abc.js']) put(f);
  return d;
}

describe('checkWeb', () => {
  it('accepts a complete hosted build', async () => {
    expect((await load()).checkWeb(good())).toEqual([]);
  });
  it('names every missing piece', async () => {
    const d = good();
    fs.rmSync(path.join(d, 'anim'), { recursive: true });
    fs.rmSync(path.join(d, 'assets/realWorld-abc.js'));
    const bad = (await load()).checkWeb(d).join('\n');
    expect(bad).toContain('missing anim/street.bin');
    expect(bad).toContain('realWorld');
  });
  it('rejects the single-file artifact', async () => {
    const d = good();
    fs.rmSync(path.join(d, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(d, 'index.html'), 'x'.repeat(2_500_000));
    const bad = (await load()).checkWeb(d).join('\n');
    expect(bad).toContain('single-file');
  });
  it('refuses a bundled phonemizer', async () => {
    const d = good();
    fs.writeFileSync(path.join(d, 'assets/espeak-ng.wasm'), 'x');
    fs.writeFileSync(path.join(d, 'assets/index-abc.js'), 'var u="phonemizer.js";');
    const bad = (await load()).checkWeb(d).join('\n');
    expect(bad).toContain('forbidden file');
    expect(bad).toContain('forbidden phonemizer code');
  });
});
