/**
 * Backdrop of the pause menu, drawn in code (original, no assets): a dark graded wash with a warm glow low right and a cool one
 * high left, so the blurred game frame behind the panels reads as one calm picture. Pure SVG string, no outlines, no pattern fills.
 */
/** `p` prefixes the gradient ids so several copies can live in one document (the pause menu is display:none while closed). */
export function menuArtSvg(p = 'm'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<defs>
<radialGradient id="${p}w" cx="78%" cy="86%" r="60%"><stop offset="0" stop-color="#e8783c" stop-opacity=".22"/><stop offset="1" stop-color="#e8783c" stop-opacity="0"/></radialGradient>
<radialGradient id="${p}c" cx="12%" cy="8%" r="55%"><stop offset="0" stop-color="#3a5a8c" stop-opacity=".20"/><stop offset="1" stop-color="#3a5a8c" stop-opacity="0"/></radialGradient>
<linearGradient id="${p}v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05060a" stop-opacity=".55"/><stop offset=".3" stop-color="#05060a" stop-opacity="0"/><stop offset=".75" stop-color="#05060a" stop-opacity="0"/><stop offset="1" stop-color="#05060a" stop-opacity=".6"/></linearGradient>
</defs>
<rect width="1600" height="900" fill="url(#${p}w)"/>
<rect width="1600" height="900" fill="url(#${p}c)"/>
<rect width="1600" height="900" fill="url(#${p}v)"/>
</svg>`;
}
