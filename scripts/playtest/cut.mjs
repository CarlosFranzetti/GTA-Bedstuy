// Dead-time cut for playtest.mp4: keep only the windows where the world is actually running (the tester's actions),
// from log.jsonl rows `tVideoActions` -> `tVideoEnd` (seconds on the webm timeline), each padded by MARGIN seconds.
// Pure helpers are exported so tests/unit/harness/playtest-cut.test.ts can check them against a fake log.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const CUT_MARGIN = 0.3;
/** a result smaller than this is a failed encode (H3's first attempt left a 48-byte file) */
export const MIN_MP4_BYTES = 2048;

/** Overlapping / touching windows are merged; windows are clamped to [0, videoEnd] when given. */
export function mergeWindows(windows, videoEnd = Infinity) {
  const w = windows
    .map(([a, b]) => [Math.max(0, a), Math.min(videoEnd, b)])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of w) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Action windows from the parsed log rows: tVideoActions -> tVideoEnd with a margin on both sides. */
export function actionWindows(rows, margin = CUT_MARGIN, videoEnd = Infinity) {
  const raw = [];
  for (const r of rows) {
    if (typeof r.tVideoActions !== 'number' || typeof r.tVideoEnd !== 'number') continue;
    raw.push([r.tVideoActions - margin, r.tVideoEnd + margin]);
  }
  return mergeWindows(raw, videoEnd);
}

export function totalSeconds(windows) { return windows.reduce((s, [a, b]) => s + (b - a), 0); }

/** ffmpeg -filter_script:v content: one pass over the input, frames inside any window, timestamps re-based. */
export function selectFilter(windows, fps = 25) {
  const sel = windows.map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`).join('+');
  return `select='${sel}',setpts=N/(${fps}*TB)`;
}

/**
 * Writes `<D>/playtest.mp4` from `<D>/playtest.webm` keeping only the action windows. Encodes to a temp name and renames
 * on success, so a failed run never leaves a stub or a copy of the full video named playtest.mp4. Returns
 * { ok, windows, seconds, reason? }.
 */
export function cutVideo(D, rows, { margin = CUT_MARGIN, fps = 25, run = spawnSync } = {}) {
  const webm = join(D, 'playtest.webm');
  const out = join(D, 'playtest.mp4');
  const tmp = join(D, 'playtest.cut.tmp.mp4');
  const script = join(D, 'playtest.cut.filter.txt');
  const windows = actionWindows(rows, margin);
  if (!windows.length) return { ok: false, windows, seconds: 0, reason: 'no action windows in log.jsonl (no tVideoActions rows)' };
  writeFileSync(script, selectFilter(windows, fps));
  const enc = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-preset', 'veryfast', '-movflags', '+faststart', '-an', '-f', 'mp4'];
  const r = run('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-filter_script:v', script, ...enc, tmp], { stdio: 'inherit' });
  rmSync(script, { force: true });
  if (r.status !== 0 || !existsSync(tmp) || statSync(tmp).size < MIN_MP4_BYTES) {
    rmSync(tmp, { force: true });
    return { ok: false, windows, seconds: totalSeconds(windows), reason: `ffmpeg failed (status ${r.status})` };
  }
  renameSync(tmp, out);
  return { ok: true, windows, seconds: totalSeconds(windows) };
}

export function readLogRows(D) {
  const p = join(D, 'log.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// CLI: node scripts/playtest/cut.mjs <sessionDir>   (re-cut a finished session)
import { resolve as _resolve } from 'node:path';
import { fileURLToPath as _fu } from 'node:url';
if (process.argv[1] && _resolve(process.argv[1]) === _fu(import.meta.url)) {
  const D = _resolve(process.argv[2] ?? '.');
  const res = cutVideo(D, readLogRows(D));
  console.log(JSON.stringify({ ok: res.ok, windows: res.windows.length, seconds: +res.seconds.toFixed(1), reason: res.reason }));
  process.exitCode = res.ok ? 0 : 1;
}
