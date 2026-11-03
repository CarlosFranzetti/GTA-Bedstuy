import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error plain .mjs harness module
import { actionWindows, cutVideo, mergeWindows, selectFilter, totalSeconds } from '../../../scripts/playtest/cut.mjs';

const rows = [
  { step: 0, thought: '(start)', tVideo: 10, tVideoEnd: 10 }, // no action window: ignored
  { step: 1, tVideoThought: 12, tVideoActions: 20, tVideoEnd: 25 },
  { step: 2, tVideoThought: 40, tVideoActions: 60, tVideoEnd: 70 },
  { step: 3, tVideoThought: 70.1, tVideoActions: 70.4, tVideoEnd: 80 }, // overlaps step 2 after margins: merged
  { end: true, reason: 'tester ended the session', tVideoEnd: 90 },
];

describe('playtest dead-time cut', () => {
  it('keeps tVideoActions -> tVideoEnd with a 0.3 s margin and drops the thinking time', () => {
    const w = actionWindows(rows);
    expect(w).toEqual([[19.7, 25.3], [59.7, 80.3]]);
    expect(totalSeconds(w)).toBeCloseTo(5.6 + 20.6, 6);
    // the thinking spans (12..20, 40..60) are not inside any window
    for (const t of [12, 15, 19.5, 45, 55]) expect(w.some(([a, b]: number[]) => t >= a && t <= b)).toBe(false);
  });

  it('merges touching windows, clamps to the video and drops empty ones', () => {
    expect(mergeWindows([[0, 5], [5, 8], [20, 20], [-3, 1], [30, 99]], 40)).toEqual([[0, 8], [30, 40]]);
  });

  it('builds a single-pass select filter with re-based timestamps', () => {
    const f = selectFilter([[1, 2.5], [10, 12]], 25);
    expect(f).toBe("select='between(t,1.000,2.500)+between(t,10.000,12.000)',setpts=N/(25*TB)");
  });

  it('writes playtest.mp4 only on success: a failed ffmpeg leaves no stub and no copy of the full video', () => {
    const D = mkdtempSync(join(tmpdir(), 'cut-'));
    writeFileSync(join(D, 'playtest.webm'), 'x');
    // 1) ffmpeg fails
    let res = cutVideo(D, rows, { run: () => ({ status: 1 }) });
    expect(res.ok).toBe(false);
    expect(existsSync(join(D, 'playtest.mp4'))).toBe(false);
    expect(existsSync(join(D, 'playtest-full.mp4'))).toBe(false);
    // 2) ffmpeg "succeeds" but writes a 48-byte stub: still a failure
    res = cutVideo(D, rows, { run: (_c: string, a: string[]) => { writeFileSync(a[a.length - 1], 'x'.repeat(48)); return { status: 0 }; } });
    expect(res.ok).toBe(false);
    expect(existsSync(join(D, 'playtest.mp4'))).toBe(false);
    // 3) success: the filter script passed to ffmpeg lists the merged windows, output is renamed into place
    let script = '';
    res = cutVideo(D, rows, {
      run: (_c: string, a: string[]) => {
        script = readFileSync(a[a.indexOf('-filter_script:v') + 1], 'utf8');
        writeFileSync(a[a.length - 1], 'x'.repeat(5000));
        return { status: 0 };
      },
    });
    expect(res.ok).toBe(true);
    expect(existsSync(join(D, 'playtest.mp4'))).toBe(true);
    expect(script).toContain('between(t,19.700,25.300)+between(t,59.700,80.300)');
  });

  it('a log with no action rows makes no video at all', () => {
    const D = mkdtempSync(join(tmpdir(), 'cut-'));
    const res = cutVideo(D, [{ step: 0, tVideo: 1, tVideoEnd: 1 }], { run: () => { throw new Error('should not run'); } });
    expect(res.ok).toBe(false);
  });
});
