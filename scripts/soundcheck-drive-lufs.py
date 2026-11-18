#!/usr/bin/env python3
"""SOUNDCHECK: EBU R128 loudness of the phases of the scripted two-minute drive (ffmpeg ebur128, not the harness's own estimate):
   integrated LUFS over the phase, loudest short-term (3 s) value inside it, and true peak. Windows are those of scripts/sfx2-render.mjs drive.
   python3 scripts/soundcheck-drive-lufs.py <dir> <tag> <type> [<type> ...]"""
import subprocess, sys, re, json
d, tag, types = sys.argv[1], sys.argv[2], sys.argv[3:]
W = {'idle': (6, 9), 'full throttle': (12, 16), 'cruise': (20, 26)}
def meas(path, a, b):
    r = subprocess.run(['ffmpeg', '-nostats', '-i', path, '-af', f'atrim={a}:{b},ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    S = [float(x) for x in re.findall(r'S:\s*(-?[\d.]+)', r) if float(x) > -120]
    summ = r.split('Summary:')[-1]
    I = re.search(r'I:\s+(-?[\d.]+) LUFS', summ); P = re.search(r'Peak:\s+(-?[\d.]+) dBFS', summ)
    return (float(I.group(1)) if I else None, max(S) if S else None, float(P.group(1)) if P else None)
out = {}
for t in types:
    path = f'{d}/drive_{t}_{tag}.wav'
    out[t] = {k: dict(zip(('I', 'Smax', 'peak'), meas(path, a, b))) for k, (a, b) in W.items()}
    out[t]['whole'] = dict(zip(('I', 'Smax', 'peak'), meas(path, 4, 112)))
    print(t.ljust(9), '  '.join(f"{k}: I {v['I']} S {v['Smax']} pk {v['peak']}" for k, v in out[t].items()))
json.dump(out, open(f'{d}/drive_lufs_{tag}.json', 'w'), indent=1)
