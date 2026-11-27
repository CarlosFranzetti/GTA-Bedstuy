#!/usr/bin/env python3
"""STUCK: draw where the soak's cars and walkers got stuck, before and after (HTML with inline SVG; screenshot it with Playwright).
usage: stuck-chart.py <before-dir> <after-dir> <out.html>   (reads soak-before-<map>.json and soak-after-<map>.json)"""
import json, sys
bdir, adir, out = sys.argv[1:4]
W, H = 560, 440
def load(d, tag, m):
    return json.load(open(f'{d}/soak-{tag}-{m}.json'))
def panel(d, tag, m, title):
    data = load(d, tag, m)
    rs = data['all']
    xs = [r['x'] for r in rs]; zs = [r['z'] for r in rs]
    x0, x1, z0, z1 = min(xs), max(xs), min(zs), max(zs)
    sx = (W - 30) / max(1, x1 - x0); sz = (H - 50) / max(1, z1 - z0); s = min(sx, sz)
    px = lambda x: 15 + (x - x0) * s
    pz = lambda z: 35 + (z - z0) * s
    g = [f'<text x="15" y="20" class="t">{title}</text>']
    for r in rs: g.append(f'<circle cx="{px(r["x"]):.1f}" cy="{pz(r["z"]):.1f}" r="1.6" class="g"/>')
    nh = no = 0
    for r in rs:
        if r['hard']:
            nh += 1
            g.append(f'<circle cx="{px(r["pinX"] or r["x"]):.1f}" cy="{pz(r["pinZ"] or r["z"]):.1f}" r="5" class="h"/>')
    for r in rs:
        if r['ovRun'] >= 0.75:
            no += 1
            g.append(f'<rect x="{px(r["x"])-4:.1f}" y="{pz(r["z"])-4:.1f}" width="8" height="8" class="o"/>')
    g.append(f'<text x="15" y="{H-8}" class="s">{len(rs)} trials, {nh} hard-stuck (red), {no} overlapped over 0.75 s (orange)</text>')
    return f'<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}">' + ''.join(g) + '</svg>'
css = '''body{margin:0;background:#16181c;color:#e8e6e0;font:13px system-ui,sans-serif}h1{font-size:16px;margin:12px 16px 4px}p{margin:0 16px 8px;color:#a8a49a}
.row{display:flex;flex-wrap:wrap;gap:8px;padding:0 8px 12px}svg{background:#1d2026;border-radius:6px}.g{fill:#4a505a}.h{fill:#e0483c;stroke:#fff;stroke-width:1}.o{fill:#f0a030}.t{fill:#e8e6e0;font-size:14px;font-weight:600}.s{fill:#a8a49a;font-size:11px}'''
html = f'<!doctype html><meta charset=utf-8><style>{css}</style><h1>STUCK soak: where it got stuck, before and after</h1><p>Grey: where each scripted car or walker started. Same trials before and after the World2D rescue and wedge relief.</p><div class=row>'
for actor in ('car',):
    for m in ('grid', 'real'):
        for tag, name in (('before', 'before'), ('after', 'after')):
            html += panel(bdir if tag == 'before' else adir, tag, m, f'{m} map, cars and walkers, {name}')
html += '</div>'
open(out, 'w').write(html)
