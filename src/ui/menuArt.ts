/**
 * Backdrop art of the pause menu, drawn in code (original, no third-party assets): off-white paper, teal ink splats,
 * halftone dots and a heavy-outlined poster character (the player in a red top with headphones). Pure SVG string.
 */
export function menuArtSvg(): string {
  const ink = '#101418';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<defs>
<pattern id="mh" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="7" cy="7" r="3.2" fill="${ink}" opacity=".35"/></pattern>
<pattern id="mp" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(-20)"><circle cx="11" cy="11" r="2.6" fill="#0d3b46" opacity=".5"/></pattern>
</defs>
<rect width="1600" height="900" fill="#e8e2d0"/>
<rect width="1600" height="900" fill="url(#mh)" opacity=".25"/>
<path d="M-40 520 C160 380 260 700 480 600 C640 520 700 760 520 860 L-40 940Z" fill="#2c8b99" stroke="${ink}" stroke-width="6"/>
<path d="M1000 -20 C1100 120 1280 40 1380 150 C1500 260 1620 160 1640 -20Z" fill="#2c8b99" stroke="${ink}" stroke-width="6"/>
<path d="M760 700 C840 640 940 740 1020 700 C1100 660 1160 760 1100 860 L740 880Z" fill="#6bb7c1" stroke="${ink}" stroke-width="5"/>
<g fill="#2c8b99" stroke="${ink}" stroke-width="4"><circle cx="640" cy="120" r="16"/><circle cx="700" cy="80" r="8"/><circle cx="560" cy="180" r="10"/><circle cx="1480" cy="520" r="14"/><circle cx="1540" cy="590" r="7"/><circle cx="180" cy="300" r="9"/></g>
<g transform="translate(1180 150) rotate(4)" stroke="${ink}" stroke-width="9" stroke-linejoin="round" stroke-linecap="round">
<path d="M-170 760 C-190 560 -160 420 -60 350 L120 350 C220 420 250 560 230 760Z" fill="#d83a2e"/>
<path d="M-170 760 C-190 560 -160 420 -60 350 L-10 350 C-60 480 -70 640 -60 760Z" fill="url(#mp)" stroke="none"/>
<path d="M-60 350 L-30 300 L90 300 L120 350 C60 400 0 400 -60 350Z" fill="#f0c9a0"/>
<rect x="-34" y="170" width="116" height="140" rx="40" fill="#f0c9a0"/>
<ellipse cx="24" cy="120" rx="108" ry="122" fill="#f0c9a0"/>
<path d="M-86 100 C-80 -20 130 -40 134 100 C100 40 -40 30 -86 100Z" fill="${ink}"/>
<path d="M-96 110 C-100 -50 148 -60 144 110" fill="none" stroke="#f5b21a" stroke-width="16"/>
<rect x="-128" y="90" width="46" height="84" rx="20" fill="#f5b21a"/>
<rect x="128" y="90" width="46" height="84" rx="20" fill="#f5b21a"/>
<path d="M-40 118 L-6 112 M60 112 L96 118" stroke-width="10" fill="none"/>
<path d="M-30 200 C10 226 50 226 80 200" fill="none" stroke-width="8"/>
<path d="M-120 520 L-60 640 L-120 760 M200 520 L140 640 L200 760" fill="none" stroke-width="6" opacity=".6"/>
</g>
<rect width="1600" height="900" fill="url(#mh)" opacity=".12"/>
</svg>`;
}
