// Usage: SWARM_SMALL=1 scripts/swarm-render.sh node docs/launch/export.cjs  (needs NODE_PATH for playwright, sharp)
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const dir = __dirname; const out = [dir + '/export', process.env.SOCIAL_OUT].filter(Boolean);
const jobs = [['story-1-announce',1080,1920],['story-2-inside',1080,1920],['story-3-source',1080,1920],['post-square',1080,1350],['share',1200,630]];
(async () => {
  out.forEach(o => fs.mkdirSync(o, { recursive: true }));
  const b = await chromium.launch();
  for (const [n, w, h] of jobs) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await p.goto('file://' + path.join(dir, n + '.html'));
    await p.evaluate(() => document.fonts.ready);
    await p.waitForFunction(() => document.fonts.size >= 3 && [...document.fonts].every(f => f.status === 'loaded' || f.status === 'unloaded'));
    await p.waitForTimeout(600);
    for (const o of out) { for (let t = 0; t < 4; t++) { try { await p.screenshot({ path: path.join(o, n + '.png') }); break; } catch (e) { if (t === 3) throw e; await p.waitForTimeout(1500); } } }
    await p.close();
  }
  await b.close();
  const sharp = require('sharp');
  await sharp(dir + '/export/share.png').jpeg({ quality: 80, mozjpeg: true }).toFile(dir + '/../../public/links/share.jpg');
  console.log('done', fs.statSync(dir + '/../../public/links/share.jpg').size);
})();
