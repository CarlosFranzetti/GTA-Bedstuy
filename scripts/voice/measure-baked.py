#!/usr/bin/env python3
"""SOUNDCHECK: speaking rate and silences inside the baked clips (public/voice), per speaker. Reads the MP3s, writes JSON.
   python3 scripts/voice/measure-baked.py out.json"""
import json, re, subprocess, sys, statistics as st, collections
m = json.load(open('public/voice/manifest.json'))['entries']
per = collections.defaultdict(lambda: {'clips': 0, 'words': 0, 'speech': 0.0, 'dur': 0.0, 'pauses': [], 'ends': []})
for k, e in m.items():
    data = open('public/voice/' + e['file'], 'rb').read()[e['off']:e['off'] + e['len']]
    r = subprocess.run(['ffmpeg', '-nostats', '-i', 'pipe:0', '-af', 'silencedetect=noise=-38dB:d=0.08', '-f', 'null', '-'], input=data, capture_output=True)
    log = r.stderr.decode('utf8', 'ignore')
    dur = e['dur']
    sil = [(float(a), float(b)) for a, b in re.findall(r'silence_start: ([\d.]+)', log) and zip(re.findall(r'silence_start: ([\d.]+)', log), re.findall(r'silence_end: ([\d.]+)', log))]
    inner = [b - a for a, b in sil if a > 0.12 and b < dur - 0.12]          # silences inside the clip, not the 30 ms edges
    words = len(re.findall(r"[\w']+", e['text']))
    p = per[e['who']]; p['clips'] += 1; p['words'] += words; p['dur'] += dur; p['speech'] += dur - sum(inner); p['pauses'] += inner
out = {}
for who, p in sorted(per.items()):
    if p['clips'] < 3: continue
    out[who] = {'clips': p['clips'], 'wordsPerSecArticulation': round(p['words'] / max(p['speech'], .1), 2), 'innerPausesPerClip': round(len(p['pauses']) / p['clips'], 2), 'innerPauseMeanSec': round(st.mean(p['pauses']), 3) if p['pauses'] else 0}
json.dump(out, open(sys.argv[1], 'w'), indent=1)
rates = [v['wordsPerSecArticulation'] for v in out.values()]
print(len(out), 'speakers; articulation rate words/s min %.2f median %.2f max %.2f sd %.2f' % (min(rates), st.median(rates), max(rates), st.pstdev(rates)))
