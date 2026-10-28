// Turns the single-file Vite build (dist/index.html) into an artifact page body:
// the publish step wraps it in its own <!doctype html><html><head>… skeleton, so we strip ours.
// Usage: node scripts/make-artifact.mjs [--dir dist]   (build first with `npm run build`, i.e. WITHOUT VITE_HOSTED)
// Budget (docs/swarm/PRD.md section 2.3): warn at 10 MB, fail above 12 MB; the platform hard limit is 16 MB.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const ARTIFACT_WARN_BYTES = 10 * 1024 * 1024;
export const ARTIFACT_MAX_BYTES = 12 * 1024 * 1024;

/** Pure transform: single-file index.html text -> artifact body text. */
export function toArtifact(src) {
  const pick = (re) => (src.match(re) || []).map((m) => m).join('\n');
  const title = (src.match(/<title>[\s\S]*?<\/title>/) || [''])[0];
  const desc = (src.match(/<meta name="description"[^>]*>/) || [''])[0];
  const styles = pick(/<style[\s\S]*?<\/style>/g);
  const scripts = pick(/<script[\s\S]*?<\/script>/g);
  const body = (src.match(/<body>([\s\S]*?)<\/body>/) || ['', ''])[1].replace(/<script[\s\S]*?<\/script>/g, '').trim();
  return `${title}\n${desc}\n<style>html,body{margin:0;height:100%;overflow:hidden;background:#0b0b10;color:#f2efe9;color-scheme:dark}</style>\n${styles}\n${body}\n${scripts}\n`;
}

/** True when the page is a real single-file build (everything inlined); a hosted build references ./assets/ files instead. */
export function isSingleFile(src) {
  const shell = src.replace(/(<script[^>]*>)[\s\S]*?<\/script>/g, '$1</script>').replace(/(<style[^>]*>)[\s\S]*?<\/style>/g, '$1</style>'); // ignore code that merely mentions tags
  return !/<script[^>]*\ssrc=/.test(shell) && !/<link[^>]*rel="stylesheet"/.test(shell);
}

export function makeArtifact(dir = 'dist') {
  const src = readFileSync(join(dir, 'index.html'), 'utf8');
  if (!isSingleFile(src)) throw new Error(`${dir}/index.html references separate files: it is a hosted build. Run the artifact build without VITE_HOSTED.`);
  const out = toArtifact(src);
  const file = join(dir, 'artifact.html');
  writeFileSync(file, out);
  const bytes = Buffer.byteLength(out);
  return { file, bytes };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMain) {
  const i = process.argv.indexOf('--dir');
  const dir = i > 0 ? process.argv[i + 1] : 'dist';
  const { file, bytes } = makeArtifact(dir);
  console.log(file, (bytes / 1024).toFixed(0), 'kB');
  if (bytes > ARTIFACT_MAX_BYTES) { console.error(`artifact is ${(bytes / 1048576).toFixed(2)} MB: over the 12 MB budget (hard limit 16 MB)`); process.exitCode = 1; }
  else if (bytes > ARTIFACT_WARN_BYTES) console.warn(`warning: artifact is ${(bytes / 1048576).toFixed(2)} MB (warn at 10 MB, budget 12 MB, hard limit 16 MB)`);
}
