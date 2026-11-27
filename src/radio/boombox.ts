/** BOOMBOX: the drawing. Static markup (SVG and CSS classes; no image files) for the boombox on the stoop. No data from the network goes through here. */
import { emblemSvg } from './emblems';
import { dialTicks, stripOrder, type DialMark } from './dial';

const KEY_ICONS: Record<string, string> = {
  prev: '<path d="M18 5v14l-9-7zM7 5v14" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  play: '<path d="M7 4v16l13-8z" fill="currentColor"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/>',
  next: '<path d="M6 5v14l9-7zM17 5v14" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  set: '<path d="M4 7h12l-3-3M20 17H8l3 3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  off: '<path d="M12 3v9M6.5 7a8 8 0 1 0 11 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
};
const key = (id: string, label: string, icon: string, extra = ''): string =>
  `<button type="button" class="key ${extra}" data-key="${id}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${KEY_ICONS[icon]}</svg><span>${label}</span></button>`;

function speaker(side: 'l' | 'r'): string {
  const s = side;
  return `<div class="spk spk-${s}"><svg class="spk-svg" viewBox="0 0 200 280" aria-hidden="true" focusable="false">
<defs>
<radialGradient id="cn${s}" cx="38%" cy="32%" r="80%"><stop offset="0" stop-color="#55565d"/><stop offset=".55" stop-color="#242428"/><stop offset="1" stop-color="#0d0d0f"/></radialGradient>
<radialGradient id="cp${s}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#8a8c94"/><stop offset="1" stop-color="#2a2a2e"/></radialGradient>
<linearGradient id="ch${s}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9dde3"/><stop offset=".5" stop-color="#7c8088"/><stop offset="1" stop-color="#3b3d42"/></linearGradient>
</defs>
<rect x="3" y="3" width="194" height="274" rx="16" fill="#1d1d20" stroke="#09090a" stroke-width="3"/>
<rect x="10" y="10" width="180" height="260" rx="11" fill="none" stroke="#3e3f45" stroke-width="2"/>
<g class="tw"><circle cx="100" cy="60" r="34" fill="#111113" stroke="url(#ch${s})" stroke-width="4"/><circle cx="100" cy="60" r="23" fill="url(#cn${s})"/><circle cx="100" cy="60" r="8" fill="url(#cp${s})"/><circle cx="100" cy="60" r="34" fill="none" stroke="#7d7f87" stroke-width="2.4" stroke-dasharray="1.2 5.2" opacity=".75"/></g>
<circle cx="100" cy="188" r="82" fill="#101012" stroke="url(#ch${s})" stroke-width="5"/>
<circle cx="100" cy="188" r="72" fill="#18181a" stroke="#050506" stroke-width="2"/>
<g class="cone"><circle cx="100" cy="188" r="60" fill="url(#cn${s})"/><circle cx="100" cy="188" r="49" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="2"/><circle cx="100" cy="188" r="38" fill="none" stroke="#77787f" stroke-opacity=".28" stroke-width="2"/><circle cx="100" cy="188" r="27" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="2"/><circle cx="100" cy="188" r="17" fill="url(#cp${s})" stroke="#111" stroke-width="2"/></g>
<circle cx="100" cy="188" r="82" fill="none" stroke="#8b8d95" stroke-width="2.6" stroke-dasharray="1.2 5.4" opacity=".6"/>
<circle cx="100" cy="188" r="66" fill="none" stroke="#8b8d95" stroke-width="2" stroke-dasharray="1 6" opacity=".35"/>
<path d="M30 160a82 82 0 0 1 50-62" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="5" stroke-linecap="round"/>
${[[18, 18], [182, 18], [18, 262], [182, 262]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.2" fill="url(#ch${s})" stroke="#050506"/><path d="M${x - 2.6} ${y + 2.6}l5.2-5.2" stroke="#222" stroke-width="1.2"/>`).join('')}
</svg>${side === 'l' ? STICKERS_L : STICKERS_R}</div>`;
}

const STICKERS_L = `
<div class="stk wax" aria-hidden="true"><b>WAX</b><b>DELI</b></div>
<div class="stk flyer" aria-hidden="true"><u>BLOCK PARTY</u><b>SAT 4PM</b><i>bring a chair<br>grill by the stoop</i></div>`;
const STICKERS_R = `
<div class="stk stkn" aria-hidden="true"><b>93.5</b><i>STOOP HIP HOP</i></div>
<div class="stk cat" aria-hidden="true"><svg viewBox="0 0 40 40" focusable="false"><path d="M6 6l8 6h12l8-6v16c0 9-7 14-14 14S6 31 6 22z" fill="#f2b632" stroke="#17130d" stroke-width="2.4" stroke-linejoin="round"/><circle cx="14" cy="22" r="2.2" fill="#17130d"/><circle cx="26" cy="22" r="2.2" fill="#17130d"/><path d="M17 27h6l-3 3z" fill="#c4472f"/></svg><i>Troop Deli</i></div>`;

export function boomboxHtml(marks: DialMark[], names: Record<string, string>): string {
  const ticks = dialTicks().map((t) => `<span class="tk${t.major ? ' mj' : ''}" style="left:${(t.pos * 100).toFixed(2)}%">${t.label ? `<em>${t.label}</em>` : ''}</span>`).join('');
  const order = stripOrder(marks);
  const mk = marks.map((m) => `<button type="button" class="mk r${order.indexOf(m.id) % 3}" tabindex="-1" aria-hidden="true" data-id="${m.id}" title="${names[m.id] ?? m.id}" style="left:${(m.pos * 100).toFixed(2)}%">${emblemSvg(m.id)}</button>`).join('');
  return `<div class="scene"><div class="lamp" aria-hidden="true"></div>
<div class="bb" role="group" aria-label="Boombox radio">
<svg class="handle" viewBox="0 0 600 70" aria-hidden="true" focusable="false"><path d="M30 68V40Q30 10 70 10H530Q570 10 570 40V68" fill="none" stroke="#0b0b0c" stroke-width="22" stroke-linecap="round"/><path d="M30 68V40Q30 10 70 10H530Q570 10 570 40V68" fill="none" stroke="#4c4e55" stroke-width="12" stroke-linecap="round"/><path d="M70 6H530" stroke="#bfc3ca" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/></svg>
<svg class="aerial" viewBox="0 0 170 170" aria-hidden="true" focusable="false"><path d="M16 168 70 100" stroke="#8d9199" stroke-width="9" stroke-linecap="round"/><path d="M70 100 112 50" stroke="#aab0b8" stroke-width="6.5" stroke-linecap="round"/><path d="M112 50 140 17" stroke="#c9cdd3" stroke-width="4.5" stroke-linecap="round"/><path d="M140 17 154 0" stroke="#dfe2e6" stroke-width="3" stroke-linecap="round"/><circle cx="155" cy="3" r="5" fill="#e2553d" stroke="#2a0f0a" stroke-width="1.5"/><circle cx="16" cy="165" r="9" fill="#2a2b2f" stroke="#08080a" stroke-width="2"/></svg>
<div class="body">
${speaker('l')}
<div class="console">
<div class="plate"><b>STOOPTONE</b><span>Model 17 &middot; Brownstone Stereo</span><i class="led-pw" aria-hidden="true"></i></div>
<div class="display">
<div class="emb-big" data-slot="emblem"></div>
<div class="readout">
<div class="row"><span class="freq num" data-slot="freq">--.-</span><span class="fm" data-slot="fm">FM</span><span class="badge" data-slot="badge"></span></div>
<div class="stn" data-slot="stn">Pick a station</div>
<div class="np" data-slot="np"> </div>
<div class="meta" data-slot="meta"> </div>
</div>
<div class="vis" data-slot="vis" aria-hidden="true">${'<i></i>'.repeat(16)}</div>
<span class="vlabel" data-slot="vlabel">NO SIGNAL</span>
</div>
<div class="strip" aria-hidden="true"><div class="scale">${ticks}<span class="liveEnd">LIVE / TALK</span>${mk}<div class="needle" data-slot="needle"></div></div></div>
<div class="knobs">
<div class="kn"><div class="knob" data-slot="vol" role="slider" tabindex="0" aria-label="Volume" aria-valuemin="0" aria-valuemax="100"><div class="cap"></div></div><label>VOLUME</label></div>
<div class="leds" data-slot="leds"><span data-led="sc"><i></i>SC</span><span data-led="live"><i></i>STREAM</span><span data-led="talk"><i></i>TALK</span><span data-led="air"><i></i>ON AIR</span></div>
<div class="kn"><div class="knob tune" data-slot="tune" role="slider" tabindex="0" aria-label="Tuning" aria-valuemin="0" aria-valuemax="100"><div class="cap"></div></div><label>TUNING</label></div>
</div>
<div class="keys">${key('prev', 'Previous', 'prev')}${key('play', 'Tune in', 'play', 'wide')}${key('next', 'Next', 'next')}${key('set', 'Next set', 'set')}${key('off', 'Off', 'off')}</div>
</div>
${speaker('r')}
<section class="caption" aria-label="Announcer caption" aria-live="polite"><p class="cap-idle">The announcer's and the hosts' lines show up here.</p><div class="cap-live"><div class="cap-head"><b class="cap-who"></b><span class="cap-kind"></span><span class="cap-tag" hidden>PARODY</span></div><p class="cap-text"></p></div></section>
</div>
<div class="feet" aria-hidden="true"><i></i><i></i></div>
</div>
<div class="step" aria-hidden="true"><div class="shadow"></div></div>
</div>`;
}
