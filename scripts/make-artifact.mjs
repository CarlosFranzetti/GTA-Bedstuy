// Turns the single-file Vite build (dist/index.html) into an artifact page body:
// the publish step wraps it in its own <!doctype html><html><head>… skeleton, so we strip ours.
import { readFileSync, writeFileSync } from 'node:fs';
const src = readFileSync('dist/index.html', 'utf8');
const pick = (re) => (src.match(re) || []).map((m) => m).join('\n');
const title = (src.match(/<title>[\s\S]*?<\/title>/) || [''])[0];
const desc = (src.match(/<meta name="description"[^>]*>/) || [''])[0];
const styles = pick(/<style[\s\S]*?<\/style>/g);
const scripts = pick(/<script[\s\S]*?<\/script>/g);
const body = (src.match(/<body>([\s\S]*?)<\/body>/) || ['', ''])[1].replace(/<script[\s\S]*?<\/script>/g, '').trim();
const out = `${title}\n${desc}\n<style>html,body{margin:0;height:100%;overflow:hidden;background:#0b0b10;color:#f2efe9;color-scheme:dark}</style>\n${styles}\n${body}\n${scripts}\n`;
writeFileSync('dist/artifact.html', out);
console.log('dist/artifact.html', (out.length / 1024).toFixed(0), 'kB');
