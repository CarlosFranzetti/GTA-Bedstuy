/** RADIOPAGE: the head unit. Plain DOM, textContent only (set titles come from the network). */
import type { RadioPage, View, Mark } from './engine';
import type { StationInfo } from './stationInfo';

export function fmtTime(s: number): string {
  const t = Math.max(0, Math.floor(Number.isFinite(s) ? s : 0));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60;
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(x).padStart(2, '0')}`;
}

type Attrs = Record<string, string>;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '', attrs: Attrs = {}): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  return e;
}
function link(text: string, href: string): HTMLAnchorElement {
  const a = h('a', '', text, { href, target: '_blank', rel: 'noopener noreferrer' });
  return a;
}
const MARK_LABEL: Record<Mark['kind'], string> = { intro: 'Opening line', listening: 'You are listening', mid: 'Mid-set mention', thanks: 'Thank-you' };
const SOURCE_NOTE = (s: StationInfo): string => `${s.kindLabel}${s.host ? `; announcer ${s.host}` : ''}`;

export function mount(root: HTMLElement, page: RadioPage): () => void {
  root.textContent = '';
  const stations = page.stations;

  /* ---- head unit ---- */
  const unit = h('section', 'unit', '', { 'aria-label': 'Car radio head unit' });
  const glass = h('div', 'glass', '', { 'aria-live': 'polite' });
  const rowTop = h('div', 'row');
  const freq = h('span', 'freq num', '--.-');
  const fm = h('span', 'fm', 'FM');
  const stn = h('span', 'stn', 'Pick a station');
  const badge = h('span', 'badge', '');
  rowTop.append(freq, fm, stn, badge);
  const np = h('div', 'np', ' ');
  const meta = h('div', 'meta', ' ');
  const say = h('div', 'say off', 'Announcer idle');
  glass.append(rowTop, np, meta, say);

  const statusBox = h('div', 'status', '', { role: 'status' });
  const stText = h('b', '', 'Radio off');
  const stReason = h('span', 'reason', 'Pick a station to tune in. Sound starts only after a tap.');
  const stBtns = h('span', 'stbtns');
  const bStart = h('button', 'go', 'Start sound', { type: 'button' });
  const bRetry = h('button', '', 'Retry', { type: 'button' });
  stBtns.append(bStart, bRetry);
  statusBox.append(stText, stReason, stBtns);
  const toast = h('div', 'toast', '');

  const dial = h('div', 'dial', '', { role: 'group', 'aria-label': 'Stations' });
  const presets: HTMLButtonElement[] = stations.map((s) => {
    const b = h('button', 'preset', '', { type: 'button', 'data-id': s.id, 'aria-pressed': 'false' });
    const f = h('span', 'f num', s.freq || s.badge);
    const n = h('span', 'n', s.name);
    const k = h('span', 'k', s.freq ? s.badge : s.kind === 'live-stream' ? 'stream' : '');
    b.append(f, n, k);
    b.addEventListener('click', () => { page.tune(s.id); });
    dial.appendChild(b);
    return b;
  });

  const ctl = h('div', 'ctl');
  const bPrev = h('button', '', 'Previous', { type: 'button' });
  const bNext = h('button', '', 'Next', { type: 'button' });
  const bSet = h('button', '', 'Next set', { type: 'button' });
  const bOff = h('button', '', 'Radio off', { type: 'button' });
  const vol = h('input', '', '', { type: 'range', min: '0', max: '100', value: String(Math.round(page.volume * 100)), id: 'vol', 'aria-label': 'Volume' });
  const volLabel = h('label', '', 'Volume', { for: 'vol' });
  ctl.append(bPrev, bNext, bSet, bOff, volLabel, vol);
  bPrev.addEventListener('click', () => page.prev());
  bNext.addEventListener('click', () => page.next());
  bSet.addEventListener('click', () => page.nextSet());
  bOff.addEventListener('click', () => page.off());
  bStart.addEventListener('click', () => page.tapStart());
  bRetry.addEventListener('click', () => page.retry());
  vol.addEventListener('input', () => page.setVolume(Number(vol.value) / 100));

  const tl = h('div', 'tl', '', { 'aria-label': 'Set timeline with the DJ-name moments' });
  const tlFill = h('div', 'fill');
  const tlHead = h('div', 'head');
  tl.append(tlFill, tlHead);
  const clockEl = h('div', 'clock num', '');
  const legend = h('div', 'legend');
  for (const [cls, label] of [['intro', 'Opening line'], ['mid', 'Mid-set mention'], ['thanks', 'Thank-you near the end']] as const) {
    const s = h('span'); s.append(h('i', cls), label); legend.appendChild(s);
  }
  const tlNote = h('p', 'note', '');
  unit.append(glass, dial, statusBox, toast, ctl);

  /* ---- the SoundCloud player (frames are put here by ScStation) ---- */
  const wcard = h('section', 'card wide');
  wcard.append(h('h2', '', 'SoundCloud player'));
  const wnote = h('p', 'note', 'The sets of the SoundCloud stations play in SoundCloud\'s own player, shown here as its terms ask. If sound does not start, press play in it.');
  const widget = h('div', 'widget', '', { id: 'widget' });
  wcard.append(wnote, widget);

  const tcard = h('section', 'card wide');
  tcard.append(h('h2', '', 'Set timeline'), tl, clockEl, legend, tlNote);

  /* ---- what was said ---- */
  const logCard = h('section', 'card');
  logCard.append(h('h2', '', 'What the announcer said'));
  const logEl = h('div', 'log');
  logCard.appendChild(logEl);
  const aboutCard = h('section', 'card');
  const aboutH = h('h2', '', 'This station');
  const aboutEl = h('div', 'about');
  aboutCard.append(aboutH, aboutEl);

  /* ---- what is on each station ---- */
  const allCard = h('section', 'card wide');
  allCard.append(h('h2', '', 'What is on each station'));
  const details = new Map<string, HTMLDetailsElement>();
  for (const s of stations) {
    const d = h('details', 'st');
    const sum = h('summary', '', '');
    sum.append(h('span', 'num', s.freq || s.badge), ` ${s.name} `, h('span', 'dim', `— ${s.genre}`));
    d.appendChild(sum);
    d.appendChild(h('p', 'note', `${s.about} (${SOURCE_NOTE(s)})`));
    if (s.site) { const p = h('p', 'note'); p.append('Site: ', link(s.site, s.site)); d.appendChild(p); }
    if (s.mixes.length) {
      d.appendChild(h('h3', '', `${s.mixes.length} DJ mixes (each opens on its own SoundCloud page)`));
      const ol = h('ol');
      for (const m of s.mixes) {
        const li = h('li');
        li.append(link(m.title || m.url, m.url), ` — ${m.dj}${m.minutes ? `, ${m.minutes} min` : ''}`);
        ol.appendChild(li);
      }
      d.appendChild(ol);
    }
    if (s.scUrls.length && s.kind !== 'live-stream') {
      const p = h('p', 'note');
      p.append(s.mixes.length ? 'Account (played when no curated mix can play): ' : s.kind === 'ra-pool' ? 'Account and the RA NYC set pool: ' : 'SoundCloud: ');
      s.scUrls.forEach((u, i) => { if (i) p.append(', '); p.appendChild(link(u, u)); });
      d.appendChild(p);
    }
    if (s.streams.length) {
      d.appendChild(h('h3', '', s.streams.length > 1 ? `${s.streams.length} live streams (one is picked at random each time you tune in)` : 'Live stream'));
      const ul = h('ul');
      for (const st of s.streams) {
        const li = h('li');
        li.append(st.site ? link(st.name, st.site) : st.name, ` — ${st.urls.length} stream URL${st.urls.length === 1 ? '' : 's'}`);
        ul.appendChild(li);
      }
      d.appendChild(ul);
    }
    if (s.djLines) d.appendChild(h('p', 'note', `Announcer lines naming the DJ: ${s.djLines.intro} opening, ${s.djLines.mid} mid-set, ${s.djLines.thanks} thank-you.`));
    if (s.kind === 'scripted') d.appendChild(h('p', 'note', s.id === 'groupchat' ? 'The station plays its own script on a loop, spoken by on-device voices.' : 'Seven invented shows and ad breaks in rotation, spoken by the game\'s cast of voices.'));
    details.set(s.id, d);
    allCard.appendChild(d);
  }

  const cols = h('div', 'cols');
  cols.append(logCard, aboutCard);
  const foot = h('p', 'note', 'Nothing here can be recorded or downloaded: the sets and streams play from their own sources. Sets and stream names belong to their makers.');
  root.append(unit, wcard, tcard, cols, allCard, foot);

  /* ---- repaint ---- */
  let markSig = '';
  let logN = -1;
  let detailsFor = '';
  const paintWidget = (v: View): void => {
    for (const f of Array.from(widget.querySelectorAll('iframe'))) {
      const mine = f.dataset.station === v.info.id && v.info.kind !== 'live-stream' && v.info.kind !== 'scripted';
      f.style.display = mine ? 'block' : 'none';
    }
  };
  const paint = (): void => {
    const v = page.view();
    freq.textContent = v.info.freq || v.info.badge;
    fm.textContent = v.info.freq ? 'FM' : '';
    stn.textContent = v.stationName;
    badge.textContent = v.info.badge;
    badge.hidden = !v.info.freq;
    presets.forEach((b, i) => b.setAttribute('aria-pressed', String(v.on && i === v.index)));
    np.textContent = '';
    if (v.title) { np.append('NOW: ', h('b', '', v.title)); }
    else np.textContent = v.on ? ' ' : 'Tap a station to start';
    const bits: string[] = [];
    if (v.dj) bits.push(`DJ: ${v.dj}`);
    if (v.source && v.info.kind !== 'sc-account' && v.info.kind !== 'sc-playlist' && v.info.kind !== 'ra-pool') bits.push(`Source: ${v.source}`);
    if (v.pos !== null) bits.push(`${fmtTime(v.pos)}${v.length ? ` / ${fmtTime(v.length)}` : ''}`);
    if (v.talk) bits.push(v.talk.show ? `${v.talk.show} — ${v.talk.speaker}` : v.talk.speaker);
    meta.textContent = bits.join('   ') || ' ';
    meta.textContent = bits.join('   ') || ' ';
    if (v.link) { meta.append('   '); meta.appendChild(link(v.link.label, v.link.url)); }
    const line = v.announcerLine;
    say.textContent = line ? (v.announcerName ? `${v.announcerName}: ${line}` : line) : v.on ? 'Announcer listening' : 'Announcer idle';
    say.classList.toggle('off', !line);

    statusBox.dataset.level = v.status.level;
    stText.textContent = v.status.text;
    stReason.textContent = v.status.reason;
    bStart.hidden = v.status.level !== 'tap';
    bRetry.hidden = !(v.status.level === 'fail' || v.status.level === 'wait') || !v.on;
    toast.textContent = v.toast;
    toast.hidden = !v.toast;
    bSet.disabled = !v.canNextSet || !v.on;
    bOff.disabled = !v.on;
    paintWidget(v);

    /* timeline */
    const L = v.length ?? 0;
    const sig = `${v.info.id}|${L}|${v.marks.map((m) => `${m.kind}${m.at}${m.state}`).join(',')}`;
    if (sig !== markSig) {
      markSig = sig;
      tl.querySelectorAll('.m').forEach((e) => e.remove());
      if (L > 0) for (const m of v.marks) {
        const e = h('div', `m ${m.kind === 'listening' ? 'intro' : m.kind} ${m.state}`);
        e.style.left = `${(m.at / L) * 100}%`;
        e.title = `${MARK_LABEL[m.kind]} at ${fmtTime(m.at)} (${m.state === 'spoken' ? 'said' : m.state === 'missed' ? 'missed' : 'to come'})`;
        tl.appendChild(e);
      }
    }
    const frac = L > 0 && v.pos !== null ? Math.min(1, v.pos / L) : v.talk ? v.talk.fraction : 0;
    tlFill.style.width = `${frac * 100}%`;
    tlHead.style.left = `${frac * 100}%`;
    clockEl.textContent = v.pos !== null ? `${fmtTime(v.pos)} / ${L ? fmtTime(L) : '?'}` : v.talk ? `Talk loop ${Math.round(v.talk.fraction * 100)}%` : '';
    tlNote.textContent = v.info.kind === 'live-stream' ? 'A live stream has no set to measure, so no DJ-name moments.'
      : v.info.kind === 'scripted' ? 'The bar shows where the talk loop is.'
      : v.marks.length ? 'The marks are the game\'s own plan for this set: the announcer names the DJ once at the start, once near the end, and in between no more than once every 30 to 40 minutes.'
      : v.on ? 'The plan appears once the set is playing and its length is known.' : 'Tune in to a SoundCloud station to see where the announcer names the DJ.';

    /* log */
    if (page.log.length !== logN) {
      logN = page.log.length;
      logEl.textContent = '';
      if (!logN) logEl.appendChild(h('div', '', 'Nothing yet. The announcer speaks a moment after you tune in to a SoundCloud station.'));
      for (const e of page.log.slice().reverse()) {
        const row = h('div'); const tm = h('time', '', new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        row.append(tm, `${e.who}: ${e.text}`); logEl.appendChild(row);
      }
    }

    /* the station's own panel */
    if (detailsFor !== v.info.id) {
      detailsFor = v.info.id;
      aboutH.textContent = v.stationName;
      aboutEl.textContent = '';
      aboutEl.append(h('p', 'note', v.info.about), h('p', 'note', `${v.info.kindLabel}${v.info.host ? `. Announcer: ${v.info.host}` : ''}.`));
      details.forEach((d, id) => { d.open = id === v.info.id; });
    }
  };
  const un = page.onChange(paint);
  paint();
  return () => { un(); };
}
