#!/usr/bin/env python3
"""THEME: numbers for a render from theme-render.mjs. python3 scripts/dev/theme-measure.py <wav> <json> [bars-per-line=4]
Loudness and true peak by ffmpeg ebur128 (not by the harness); band shares and the loop seam by numpy."""
import sys, json, struct, subprocess, re
import numpy as np
wav, meta = sys.argv[1], json.load(open(sys.argv[2]))
raw = open(wav, 'rb').read()[44:]
x = np.frombuffer(raw, dtype='<f4').reshape(-1, 2).astype(np.float64)
sr = 44100; L = meta['loopSec']; t0 = meta['t0']
m = x.mean(axis=1)
print(f'length {len(x)/sr:.2f} s, loop {L:.3f} s ({L/ (60/94*4):.0f} bars at 94 BPM)')
print(f'sample peak {20*np.log10(np.abs(x).max()+1e-12):.2f} dBFS, NaN/Inf {int((~np.isfinite(x)).sum())}')
def ebur(a, b):
    r = subprocess.run(['ffmpeg', '-nostats', '-i', wav, '-af', f'atrim={a}:{b},ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    s = r.split('Summary')[-1]
    I = re.search(r'I:\s+(-?[\d.]+) LUFS', s); LRA = re.search(r'LRA:\s+([\d.]+) LU', s); P = re.search(r'Peak:\s+(-?[\d.]+) dBFS', s)
    return (I.group(1) if I else '?'), (LRA.group(1) if LRA else '?'), (P.group(1) if P else '?')
I, LRA, P = ebur(t0 + L, t0 + 2 * L)   # the second loop: the first has no reverb tail from before
print(f'second loop: integrated {I} LUFS, loudness range {LRA} LU, true peak {P} dBTP')
# short-term (3 s) loudness over the second loop: min / max
r = subprocess.run(['ffmpeg', '-nostats', '-i', wav, '-af', f'atrim={t0+L}:{t0+2*L},ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
st = [float(v) for v in re.findall(r'S:\s+(-?[\d.]+)', r) if float(v) > -70]
print(f'short-term (3 s) over the loop: min {min(st):.1f}, max {max(st):.1f} LUFS')
# per-section loudness (4 bars each)
bar = 60 / 94 * 4
for s in range(10):
    a = t0 + L + s * 4 * bar; I2, _, P2 = ebur(a, a + 4 * bar)
    print(f'  bars {s*4:2d}-{s*4+3:2d}: {I2:>7} LUFS  peak {P2} dBFS')
# band shares (energy) over the second loop
seg = m[int((t0 + L) * sr):int((t0 + 2 * L) * sr)]
n = 1 << 15; win = np.hanning(n); acc = None
for i in range(0, len(seg) - n, n):
    sp = np.abs(np.fft.rfft(seg[i:i + n] * win)) ** 2; acc = sp if acc is None else acc + sp
f = np.fft.rfftfreq(n, 1 / sr); tot = acc.sum()
band = lambda lo, hi: 100 * acc[(f >= lo) & (f < hi)].sum() / tot
print(f'energy: sub <60 Hz {band(0,60):.1f}%  <500 Hz {band(0,500):.1f}%  presence 2-5 kHz {band(2000,5000):.1f}%  highs >4 kHz {band(4000,22050):.1f}%')
# seam: the engine is continuous across it, so compare the jump there with the jumps everywhere else
b = int(round((t0 + L) * sr)); d = np.abs(np.diff(x, axis=0)).max(axis=1)
region = d[b - 4:b + 4].max(); body = d[int((t0 + 1) * sr):int((t0 + L - 1) * sr)]
print(f'seam (engine continuous): max sample step within +-4 samples of the loop point {region:.5f}; body max {body.max():.5f}, 99.9th pct {np.percentile(body,99.9):.5f}, median {np.median(body):.6f}')
rb = lambda a, c: 20 * np.log10(np.sqrt(np.mean(m[int(a * sr):int(c * sr)] ** 2)) + 1e-12)
print(f'RMS 100 ms before seam {rb(t0+L-0.1,t0+L):.1f} dB, 100 ms after {rb(t0+L,t0+L+0.1):.1f} dB')
# looped as a bare file (cut at exactly one loop): the step from the last sample of loop 1 to the first of loop 1
a0 = int(round(t0 * sr)); a1 = int(round((t0 + L) * sr))
step_file = np.abs(x[a1 - 1] - x[a0]).max()
print(f'seam (file cut at one loop and repeated): step from last to first sample {step_file:.5f}; end level RMS last 50 ms {rb(t0+L-0.05,t0+L):.1f} dB, start RMS first 50 ms {rb(t0,t0+0.05):.1f} dB')
# loop 1 vs loop 2 similarity (bar 0..3 of each)
s1 = m[a0:a0 + int(4 * bar * sr)]; s2 = m[a1:a1 + int(4 * bar * sr)]
print(f'bars 0-3, loop 1 vs 2: correlation {np.corrcoef(s1, s2)[0,1]:.3f} (loop 2 also carries the reverb tail of bar 39)')
