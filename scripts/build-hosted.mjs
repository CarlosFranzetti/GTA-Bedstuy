// Builds BOTH distributions from the one codebase and prints their sizes (docs/swarm/PRD.md section 2.3).
//
//   node scripts/build-hosted.mjs                 artifact (dist/ + dist/artifact.html) and hosted (dist-hosted/)
//   node scripts/build-hosted.mjs --only hosted   just the hosted build      (--only artifact: just the single file)
//   node scripts/build-hosted.mjs --smoke         after building, serve dist-hosted and load it headless (Playwright)
//   options: --artifact-dir dist  --hosted-dir dist-hosted  --config <vite config>  --port 4307  --json  --no-build
//
// Hosted build = `VITE_HOSTED=1 vite build`: no single-file plugin, hashed assets, three.js in its own chunk, textures as files.
// Exit code is non-zero when a budget or an invariant fails: artifact over 12 MB, textures inlined into the hosted JS,
// no separate three chunk, or (with --smoke) console errors / failed requests.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { ARTIFACT_MAX_BYTES, ARTIFACT_WARN_BYTES, makeArtifact } from './make-artifact.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt; };
const flag = (name) => args.includes(`--${name}`);
const only = opt('only', 'both');
const artifactDir = resolve(root, opt('artifact-dir', 'dist'));
const hostedDir = resolve(root, opt('hosted-dir', 'dist-hosted'));
const config = opt('config', '');
const port = Number(opt('port', '4307'));
const json = flag('json');
const HOSTED_FIRST_LOAD_BUDGET = 60 * 1024 * 1024; // PRD 2.3: ~60 MB first load, lazy beyond

const mb = (b) => (b / 1048576).toFixed(2) + ' MB';
const kb = (b) => (b / 1024).toFixed(1).padStart(8) + ' kB';
const log = (...a) => { if (!json) console.log(...a); };
const problems = [];
const warnings = [];

function vite(subcommand, extra, env = {}) {
  const cmd = ['node_modules/vite/bin/vite.js', subcommand, ...(config ? ['--config', resolve(root, config)] : []), ...extra];
  return spawnSync('node', cmd, { cwd: root, env: { ...process.env, ...env }, stdio: json ? 'ignore' : ['ignore', 'ignore', 'inherit'] });
}

function listFiles(dir, base = dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, base)); else out.push({ path: p, rel: relative(base, p), size: statSync(p).size });
  }
  return out;
}

const summary = { artifact: null, hosted: null, smoke: null };

// ---------------------------------------------------------------------------------------------------------- artifact
if (only === 'both' || only === 'artifact') {
  if (!flag('no-build')) {
    log('[build] single-file artifact ->', relative(root, artifactDir));
    const r = vite('build', ['--outDir', artifactDir, '--emptyOutDir'], { VITE_HOSTED: '' });
    if (r.status !== 0) { console.error('artifact build failed'); process.exit(1); }
  }
  const { file, bytes } = makeArtifact(artifactDir);
  const indexBytes = statSync(join(artifactDir, 'index.html')).size;
  summary.artifact = { file: relative(root, file), bytes, indexBytes, budgetBytes: ARTIFACT_MAX_BYTES };
  log(`  ${relative(root, join(artifactDir, 'index.html'))}  ${mb(indexBytes)}`);
  log(`  ${relative(root, file)}  ${mb(bytes)}  (budget ${mb(ARTIFACT_MAX_BYTES)}, hard limit 16 MB)`);
  if (bytes > ARTIFACT_MAX_BYTES) problems.push(`artifact ${mb(bytes)} is over the 12 MB budget`);
  else if (bytes > ARTIFACT_WARN_BYTES) warnings.push(`artifact ${mb(bytes)} is over the 10 MB warning line`);
}

// ---------------------------------------------------------------------------------------------------------- hosted
if (only === 'both' || only === 'hosted') {
  if (!flag('no-build')) {
    log('[build] hosted (VITE_HOSTED=1) ->', relative(root, hostedDir));
    const r = vite('build', ['--outDir', hostedDir, '--emptyOutDir'], { VITE_HOSTED: '1' });
    if (r.status !== 0) { console.error('hosted build failed'); process.exit(1); }
  }
  if (!existsSync(join(hostedDir, 'index.html'))) { console.error('no hosted build at', hostedDir); process.exit(1); }
  const files = listFiles(hostedDir);
  const ext = (f) => f.rel.split('.').pop();
  const js = files.filter((f) => ext(f) === 'js');
  const css = files.filter((f) => ext(f) === 'css');
  const images = files.filter((f) => /^(jpe?g|png|webp|ktx2|basis)$/.test(ext(f)));
  const total = files.reduce((a, f) => a + f.size, 0);
  const sum = (list) => list.reduce((a, f) => a + f.size, 0);
  const compressed = (list, fn) => list.reduce((a, f) => a + fn(readFileSync(f.path)).length, 0);
  const html = readFileSync(join(hostedDir, 'index.html'), 'utf8');
  const hasThreeChunk = js.some((f) => /(^|[\\/])three-[\w-]+\.js$/.test(f.rel));
  const hashed = files.filter((f) => /assets[\\/].+-[\w-]{8}\.\w+$/.test(f.rel)).length;
  const inlinedImages = js.reduce((a, f) => a + (readFileSync(f.path, 'utf8').match(/data:image\/(?:jpeg|png|webp);base64/g) || []).length, 0);
  summary.hosted = {
    dir: relative(root, hostedDir), files: files.length, totalBytes: total, jsBytes: sum(js), jsGzipBytes: compressed(js, gzipSync), jsBrotliBytes: compressed(js, (b) => brotliCompressSync(b)),
    cssBytes: sum(css), imageBytes: sum(images), imageFiles: images.length, htmlBytes: statSync(join(hostedDir, 'index.html')).size,
    threeChunk: hasThreeChunk, hashedAssets: hashed, inlinedImages, firstLoadBudgetBytes: HOSTED_FIRST_LOAD_BUDGET,
  };
  log(`  ${files.length} files, ${mb(total)} total`);
  log(`  index.html   ${kb(summary.hosted.htmlBytes)}`);
  for (const f of js.sort((a, b) => b.size - a.size)) log(`  ${f.rel.padEnd(40)} ${kb(f.size)}  gzip ${kb(gzipSync(readFileSync(f.path)).length)}`);
  for (const f of css) log(`  ${f.rel.padEnd(40)} ${kb(f.size)}`);
  log(`  textures     ${kb(summary.hosted.imageBytes)}  in ${images.length} files (served as files, long-cached)`);
  log(`  js total gzip ${mb(summary.hosted.jsGzipBytes)}, brotli ${mb(summary.hosted.jsBrotliBytes)}; first load budget ${mb(HOSTED_FIRST_LOAD_BUDGET)}`);
  if (!hasThreeChunk) problems.push('hosted build has no separate three chunk (assets/three-<hash>.js)');
  if (inlinedImages > 0) problems.push(`${inlinedImages} base64 images are inlined into the hosted JS (textures must be files)`);
  if (!/<script[^>]+src="\.\/assets\//.test(html)) problems.push('hosted index.html does not reference ./assets/ scripts');
  if (images.length === 0) problems.push('hosted build has no texture files');
  if (hashed < files.length - 1) warnings.push(`${files.length - 1 - hashed} files under dist have no content hash`);
  if (total > HOSTED_FIRST_LOAD_BUDGET) warnings.push(`hosted build ${mb(total)} exceeds the ${mb(HOSTED_FIRST_LOAD_BUDGET)} first-load budget; lazy-load the excess`);
}

// ---------------------------------------------------------------------------------------------------------- smoke
if (flag('smoke')) {
  const { chromium } = createRequire(import.meta.url)('playwright');
  mkdirSync(join(root, 'tests/e2e/__screenshots__'), { recursive: true });
  const base = `http://localhost:${port}`;
  const preview = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', ...(config ? ['--config', resolve(root, config)] : []), '--outDir', hostedDir, '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  preview.stderr.on('data', (d) => process.stderr.write(d));
  let browser;
  const runs = [];
  try {
    for (let i = 0; ; i++) {
      try { if ((await fetch(base + '/')).ok) break; } catch { /* not up yet */ }
      if (i > 60) throw new Error('preview server did not start');
      await new Promise((r) => setTimeout(r, 250));
    }
    browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    for (const q of ['low', 'ultra']) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const errors = [];
      const failed = [];
      const textureRequests = new Set();
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('requestfailed', (r) => failed.push(r.url()));
      page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); if (/\/assets\/.+\.(jpe?g|png|webp)$/.test(r.url())) textureRequests.add(r.url()); });
      await page.goto(`${base}/?q=${q}`, { waitUntil: 'load', timeout: 60_000 });
      await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 120_000 });
      await page.waitForTimeout(3000);
      const hostedTextures = await page.evaluate(async () => {
        const p = window.__gtaDebug?.hostedTextures;
        return p ? await Promise.race([p, new Promise((r) => setTimeout(() => r('timeout'), 20000))]) : null;
      });
      const gl = await page.evaluate(() => !!document.querySelector('canvas.game')?.getContext('webgl2'));
      const stats = await page.evaluate(() => window.__gtaStats ?? null);
      await page.screenshot({ path: join(root, `tests/e2e/__screenshots__/hosted-${q}.png`), timeout: 120_000 });
      runs.push({ q, webgl2: gl, errors, failed, textureFiles: textureRequests.size, hostedTextures, stats });
      await page.close();
      if (!gl) problems.push(`smoke ?q=${q}: no WebGL2 context`);
      if (errors.length) problems.push(`smoke ?q=${q}: ${errors.length} console error(s): ${errors[0]}`);
      if (failed.length) problems.push(`smoke ?q=${q}: failed requests: ${failed.slice(0, 3).join(', ')}`);
      if (textureRequests.size === 0) problems.push(`smoke ?q=${q}: no texture files were requested`);
    }
  } catch (e) {
    problems.push(`smoke failed: ${e.message}`);
  } finally {
    await browser?.close();
    preview.kill();
  }
  summary.smoke = runs;
  for (const r of runs) log(`[smoke] ?q=${r.q}: webgl2=${r.webgl2} errors=${r.errors.length} failed=${r.failed.length} textureFiles=${r.textureFiles} hostedTextures=${JSON.stringify(r.hostedTextures)}`);
}

if (json) console.log(JSON.stringify({ ...summary, problems, warnings }, null, 2));
else {
  for (const w of warnings) console.warn('warning:', w);
  for (const p of problems) console.error('FAIL:', p);
  console.log(problems.length ? `\n${problems.length} problem(s)` : '\nall build checks passed');
}
process.exit(problems.length ? 1 : 0);
