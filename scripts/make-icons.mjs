// Writes the web-app icons (original art: a stoop and a street lamp on a dusk gradient) as SVG into public/icons.
// Also rasterises 192 / 512 PNGs (any + maskable) when `sharp` is installed; the PNGs are committed, so this only reruns when the art changes.
// Usage: node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
const art = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b1b4a"/><stop offset="0.6" stop-color="#c4553a"/><stop offset="1" stop-color="#f5a742"/></linearGradient></defs>
<rect width="512" height="512" fill="url(#g)"/>
<g transform="translate(256 256) scale(${1 - pad}) translate(-256 -256)">
<rect x="96" y="250" width="150" height="190" fill="#1a1420"/><rect x="266" y="190" width="150" height="250" fill="#241a2c"/>
<g fill="#f5c542"><rect x="118" y="278" width="22" height="30"/><rect x="170" y="278" width="22" height="30"/><rect x="118" y="340" width="22" height="30"/><rect x="288" y="226" width="22" height="30"/><rect x="340" y="226" width="22" height="30"/><rect x="340" y="290" width="22" height="30"/></g>
<path d="M60 440h392v14H60z" fill="#0d0a12"/><path d="M60 418h64v22H60zM80 396h44v22H80z" fill="#3a2a40"/>
<rect x="244" y="150" width="8" height="290" fill="#0d0a12"/><path d="M248 150q0-34 34-34" stroke="#0d0a12" stroke-width="8" fill="none"/><circle cx="290" cy="124" r="14" fill="#fff2b0"/>
</g></svg>
`;
mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon.svg', art(0));
writeFileSync('public/icons/icon-maskable.svg', art(0.2)); // art inside the central 80 % safe zone
console.log('wrote public/icons/icon.svg, icon-maskable.svg');
try {
  const sharp = (await import('sharp')).default;
  for (const [src, tag] of [['icon.svg', ''], ['icon-maskable.svg', '-maskable']]) {
    for (const n of [192, 512]) await sharp(`public/icons/${src}`, { density: 144 }).resize(n, n).png().toFile(`public/icons/icon${tag}-${n}.png`);
  }
  await sharp('public/icons/icon.svg', { density: 144 }).resize(180, 180).png().toFile('public/icons/apple-touch-icon.png');
  console.log('wrote PNGs');
} catch (e) { console.warn('sharp not available, PNGs not rewritten:', e.message); }
