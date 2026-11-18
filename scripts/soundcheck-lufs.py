#!/usr/bin/env python3
"""SOUNDCHECK: EBU R128 numbers for windows of the street-scene stems, measured with ffmpeg (ebur128), not by the harness.
   python3 scripts/soundcheck-lufs.py <dir> <tag> [window=name:start:end ...]"""
import subprocess, sys, re, json
d, tag = sys.argv[1], sys.argv[2]
wins = {'idle': (6.5, 9), 'cruise': (20, 26), 'wot_burst': (34.5, 38), 'dj_line_only': (15.05, 18.4), 'bark_in_car': (25.05, 27.0), 'bark_on_foot': (52.05, 54.0), 'foot_before': (0.5, 5.5), 'foot_after': (55.5, 59.5), 'traffic_pass_a': (16.5, 19.5), 'traffic_pass_b': (26.5, 29.5), 'traffic_pass_c': (40.5, 43.5)}
for a in sys.argv[3:]:
    n, s, e = a.split(':'); wins[n] = (float(s), float(e))
stems = ['master', 'sfx', 'voices', 'ambience', 'radio', 'engine_player', 'engine_traffic']
def lufs(stem, s, e):
    r = subprocess.run(['ffmpeg', '-nostats', '-i', f'{d}/{tag}_{stem}.wav', '-af', f'atrim={s}:{e},ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    m = re.search(r'Integrated loudness:\s+I:\s+(-?[\d.]+|-inf) LUFS', r) or re.search(r'I:\s+(-?[\d.]+|-inf) LUFS', r.split('Summary')[-1])
    p = re.search(r'Peak:\s+(-?[\d.]+|-inf) dBFS', r.split('Summary')[-1])
    return (m.group(1) if m else '?'), (p.group(1) if p else '?')
out = {}
for w, (s, e) in wins.items():
    out[w] = {st: lufs(st, s, e)[0] for st in stems}
    print(w.ljust(15), f'{s}-{e}s', '  '.join(f'{st[:8]} {v}' for st, v in out[w].items()))
json.dump(out, open(f'{d}/{tag}_ebur128.json', 'w'), indent=1)
