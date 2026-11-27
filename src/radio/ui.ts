/** BOOMBOX: the /radio/ page's interface: a boombox on a stoop. Plain DOM, textContent only for anything that comes from the network or the script. */
import type { RadioPage, View, Mark } from './engine';
import { kindLabel } from './engine';
import type { StationInfo } from './stationInfo';
import { boomboxHtml } from './boombox';
import { emblemSvg } from './emblems';
import { dialMarks, nearestMark, stepAlong, type DialMark } from './dial';
import { Visualiser, tempoGuess, BARS, type Frame } from './viz';
import { playStatic } from './static';

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
function link(text: string, href: string): HTMLAnchorElement { return h('a', '', text, { href, target: '_blank', rel: 'noopener noreferrer' }); }
const MARK_LABEL: Record<Mark['kind'], string> = { intro: 'Opening line', listening: 'You are listening', mid: 'Mid-set mention', thanks: 'Thank-you' };
const SOURCE_NOTE = (s: StationInfo): string => `${s.kindLabel}${s.host ? `; announcer ${s.host}` : ''}`;
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

export interface MountOptions { reduced?: boolean; raf?: boolean }
const STATIC_KEY = 'gta-bedstuy.radiopage.static.v1';
const readStatic = (): boolean => { try { return localStorage.getItem(STATIC_KEY) !== 'off'; } catch { return true; } };
const writeStatic = (on: boolean): void => { try { localStorage.setItem(STATIC_KEY, on ? 'on' : 'off'); } catch { /* private mode */ } };
export const prefersReducedMotion = (): boolean => { try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

export function mount(root: HTMLElement, page: RadioPage, opts: MountOptions = {}): () => void {
  root.textContent = '';
  const stations = page.stations;
  const reduced = opts.reduced ?? prefersReducedMotion();
  const marks: DialMark[] = dialMarks(stations);
  const markOf = new Map(marks.map((m) => [m.id, m]));
  const infoOf = new Map(stations.map((s) => [s.id, s]));
  const names: Record<string, string> = {};
  for (const s of stations) names[s.id] = s.name;
  let staticOn = readStatic();

  /* ---- the boombox ---- */
  const scene = h('section', 'sceneWrap', '', { 'aria-label': 'Boombox radio' });
  scene.innerHTML = boomboxHtml(marks, names); // static markup and station names from the game's own catalog
  const q = <T extends HTMLElement>(slot: string): T => scene.querySelector(`[data-slot="${slot}"]`) as T;
  const bb = scene.querySelector('.bb') as HTMLElement;
  const emblemEl = q('emblem'), freqEl = q('freq'), fmEl = q('fm'), badgeEl = q('badge'), stnEl = q('stn'), npEl = q('np'), metaEl = q('meta');
  const visEl = q('vis'), vlabel = q('vlabel'), needle = q('needle'), volKnob = q('vol'), tuneKnob = q('tune'), ledsEl = q('leds');
  const bars = Array.from(visEl.querySelectorAll('i')) as HTMLElement[];
  const keyBtn = (k: string): HTMLButtonElement => scene.querySelector(`[data-key="${k}"]`) as HTMLButtonElement;
  const kPlay = keyBtn('play'), kSet = keyBtn('set'), kOff = keyBtn('off');
  if (reduced) bb.classList.add('calm');

  /* ---- caption, status, log ---- */
  const cap = scene.querySelector('.caption') as HTMLElement;
  const capWho = cap.querySelector('.cap-who') as HTMLElement, capKind = cap.querySelector('.cap-kind') as HTMLElement;
  const capTag = cap.querySelector('.cap-tag') as HTMLElement, capText = cap.querySelector('.cap-text') as HTMLElement;

  const statusBox = h('div', 'status', '', { role: 'status' });
  const stText = h('b', '', 'Radio off');
  const stReason = h('span', 'reason', 'Pick a station to tune in. Sound starts only after a tap.');
  const stBtns = h('span', 'stbtns');
  const bStart = h('button', 'go', 'Start sound', { type: 'button' });
  const bRetry = h('button', '', 'Retry', { type: 'button' });
  stBtns.append(bStart, bRetry);
  statusBox.append(stText, stReason, stBtns);
  const toast = h('div', 'toast', '');
  const settings = h('label', 'setting');
  const staticBox = h('input', '', '', { type: 'checkbox' });
  staticBox.checked = staticOn;
  settings.append(staticBox, ' Dial static between stations (only once sound is on)');
  const ctlRow = h('div', 'ctlrow');
  ctlRow.append(statusBox, toast, settings);

  /* ---- station list (emblems) ---- */
  const listCard = h('section', 'card wide');
  listCard.append(h('h2', '', 'Stations'));
  const dial = h('div', 'dial', '', { role: 'group', 'aria-label': 'Stations' });
  const presets: HTMLButtonElement[] = stations.map((s) => {
    const b = h('button', 'preset', '', { type: 'button', 'data-id': s.id, 'aria-pressed': 'false' });
    const em = h('span', 'pe'); em.innerHTML = emblemSvg(s.id);
    const tx = h('span', 'pt');
    tx.append(h('span', 'f num', s.freq || s.badge), h('span', 'n', s.name), h('span', 'k', s.freq ? s.badge : s.kind === 'live-stream' ? 'stream' : ''));
    b.append(em, tx);
    b.addEventListener('click', () => { pending = null; page.tune(s.id); });
    dial.appendChild(b);
    return b;
  });
  listCard.appendChild(dial);

  /* ---- the SoundCloud player (frames are put here by ScStation) ---- */
  const wcard = h('section', 'card wide');
  wcard.append(h('h2', '', 'SoundCloud player'));
  wcard.append(h('p', 'note', 'The sets of the SoundCloud stations play in SoundCloud\'s own player, shown here as its terms ask. If sound does not start, press play in it.'));
  wcard.append(h('div', 'widget', '', { id: 'widget' }));
  const widget = wcard.querySelector('.widget') as HTMLElement;

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
  const tcard = h('section', 'card wide');
  tcard.append(h('h2', '', 'Set timeline'), tl, clockEl, legend, tlNote);

  const logCard = h('section', 'card');
  const logHead = h('div', 'loghead');
  const clearBtn = h('button', 'clear', 'Clear', { type: 'button' });
  logHead.append(h('h2', '', 'What was said'), clearBtn);
  const logEl = h('div', 'log', '', { role: 'log' });
  logCard.append(logHead, logEl);
  const aboutCard = h('section', 'card');
  const aboutH = h('h2', '', 'This station');
  const aboutEl = h('div', 'about');
  aboutCard.append(aboutH, aboutEl);

  const allCard = h('section', 'card wide');
  allCard.append(h('h2', '', 'What is on each station'));
  const details = new Map<string, HTMLDetailsElement>();
  for (const s of stations) {
    const d = h('details', 'st');
    const sum = h('summary', '', '');
    const em = h('span', 'pe sm'); em.innerHTML = emblemSvg(s.id);
    sum.append(em, h('span', 'num', s.freq || s.badge), ` ${s.name} `, h('span', 'dim', `— ${s.genre}`));
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
  const foot = h('p', 'note', 'Nothing here can be recorded or downloaded: the sets and streams play from their own sources. Sets and stream names belong to their makers. The emblems are drawn for this page and are not the stations\' own logos. The bars are labelled live only when they read the page\'s own audio; otherwise they are a simulation.');
  root.append(scene, ctlRow, listCard, wcard, tcard, cols, allCard, foot);

  /* ---- tuning: needle, knob, keys ---- */
  let pending: string | null = null;
  let pendTimer: ReturnType<typeof setTimeout> | null = null;
  let dragPos: number | null = null;
  let lastView: View = page.view();
  const burst = (): void => { if (staticOn) playStatic(page.runningContext, page.volume); };
  const commit = (): void => {
    if (pendTimer) { clearTimeout(pendTimer); pendTimer = null; }
    if (pending) { const id = pending; pending = null; page.tune(id); }
    paint();
  };
  const stepTo = (d: 1 | -1, now = false): void => {
    pending = stepAlong(pending ?? page.currentId, d, marks);
    burst();
    paint();
    if (now) commit();
    else { if (pendTimer) clearTimeout(pendTimer); pendTimer = setTimeout(commit, 260); }
  };
  const shownId = (): string => pending ?? lastView.info.id;
  const needlePos = (): number => dragPos ?? markOf.get(shownId())?.pos ?? 0;

  keyBtn('prev').addEventListener('click', () => stepTo(-1, true));
  keyBtn('next').addEventListener('click', () => stepTo(1, true));
  kPlay.addEventListener('click', () => { if (page.isOn) page.off(); else page.tune(pending ?? page.currentId); });
  kSet.addEventListener('click', () => page.nextSet());
  kOff.addEventListener('click', () => page.off());
  bStart.addEventListener('click', () => page.tapStart());
  bRetry.addEventListener('click', () => page.retry());
  clearBtn.addEventListener('click', () => page.clearLog());
  staticBox.addEventListener('change', () => { staticOn = staticBox.checked; writeStatic(staticOn); });

  /* the tuning knob: drag sweeps the band and snaps to a station on release; wheel and arrows step along the strip */
  let drag: { x: number; y: number; pos: number; lastBurst: number } | null = null;
  tuneKnob.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, pos: needlePos(), lastBurst: 0 };
    try { tuneKnob.setPointerCapture(e.pointerId); } catch { /* not captured */ }
    needle.classList.add('drag');
  });
  tuneKnob.addEventListener('pointermove', (e) => {
    if (!drag) return;
    dragPos = clamp01(drag.pos + ((e.clientX - drag.x) - (e.clientY - drag.y)) / 280);
    const m = nearestMark(dragPos, marks);
    if (m.id !== pending) { pending = m.id; if (e.timeStamp - drag.lastBurst > 90) { drag.lastBurst = e.timeStamp; burst(); } }
    paint();
  });
  const endDrag = (): void => {
    if (!drag) return;
    drag = null; dragPos = null; needle.classList.remove('drag');
    commit();
  };
  tuneKnob.addEventListener('pointerup', endDrag);
  tuneKnob.addEventListener('pointercancel', endDrag);
  tuneKnob.addEventListener('wheel', (e) => { e.preventDefault(); stepTo(e.deltaY + e.deltaX > 0 ? 1 : -1); }, { passive: false });
  tuneKnob.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); stepTo(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); stepTo(-1); }
  });

  /* the volume knob */
  let vdrag: { x: number; y: number; v: number } | null = null;
  volKnob.addEventListener('pointerdown', (e) => { vdrag = { x: e.clientX, y: e.clientY, v: page.volume }; try { volKnob.setPointerCapture(e.pointerId); } catch { /* */ } });
  volKnob.addEventListener('pointermove', (e) => { if (vdrag) page.setVolume(clamp01(vdrag.v + ((e.clientX - vdrag.x) - (e.clientY - vdrag.y)) / 160)); });
  const vEnd = (): void => { vdrag = null; };
  volKnob.addEventListener('pointerup', vEnd); volKnob.addEventListener('pointercancel', vEnd);
  volKnob.addEventListener('wheel', (e) => { e.preventDefault(); page.setVolume(clamp01(page.volume + (e.deltaY < 0 ? 0.05 : -0.05))); }, { passive: false });
  volKnob.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 0.05 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -0.05 : 0;
    if (d) { e.preventDefault(); e.stopPropagation(); page.setVolume(clamp01(page.volume + d)); }
  });

  /* keyboard: arrows tune, space plays or stops (not while a control has the key) */
  const onKey = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null;
    const tag = t?.tagName ?? '';
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); stepTo(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); stepTo(-1); }
    else if (e.key === ' ' && tag !== 'BUTTON' && tag !== 'INPUT' && tag !== 'SUMMARY' && tag !== 'A' && t?.getAttribute('role') !== 'slider') { e.preventDefault(); kPlay.click(); }
  };
  document.addEventListener('keydown', onKey);

  /* ---- visualiser ---- */
  const viz = new Visualiser(reduced);
  let vizSig = '';
  const paintViz = (f: Frame, t: number): void => {
    for (let i = 0; i < BARS; i++) bars[i].style.transform = `scaleY(${f.bars[i].toFixed(3)})`;
    const p = reduced ? 1 : 1 + f.bass * 0.06;
    bb.style.setProperty('--p', p.toFixed(3));
    bb.style.setProperty('--g', (reduced ? 0 : f.bass).toFixed(2));
    const sig = f.source;
    if (sig !== vizSig) {
      vizSig = sig;
      vlabel.textContent = f.source === 'real' ? 'LIVE SIGNAL' : f.source === 'sim' ? 'SIMULATED' : 'NO SIGNAL';
      vlabel.dataset.src = f.source;
      vlabel.title = f.source === 'real' ? 'Read from the page\'s own audio output.' : f.source === 'sim' ? 'A simulation from the play state and a tempo guess: this sound cannot be analysed by the page.' : 'Nothing is playing.';
    }
    void t;
  };
  const frameNow = (t: number): Frame => {
    const v = lastView;
    return viz.frame(t, { playing: v.on && v.status.level === 'ok', bpm: tempoGuess(v.info.genre), analyser: page.analyser, analysable: v.info.id === 'talk' });
  };
  let raf = 0;
  const loop = (ms: number): void => { paintViz(frameNow(ms / 1000), ms / 1000); raf = requestAnimationFrame(loop); };
  const useRaf = (opts.raf ?? true) && typeof requestAnimationFrame === 'function' && !reduced;
  if (useRaf) raf = requestAnimationFrame(loop);

  /* ---- repaint ---- */
  let markSig = '', logSig = '', detailsFor = '', emblemFor = '';
  const paintWidget = (v: View): void => {
    for (const f of Array.from(widget.querySelectorAll('iframe'))) {
      const mine = f.dataset.station === v.info.id && v.info.kind !== 'live-stream' && v.info.kind !== 'scripted';
      f.style.display = mine ? 'block' : 'none';
    }
  };
  function paint(): void {
    const v = page.view();
    lastView = v;
    const sid = shownId();
    const si = infoOf.get(sid) ?? v.info;
    const preview = sid !== v.info.id;
    if (emblemFor !== sid) { emblemFor = sid; emblemEl.innerHTML = emblemSvg(sid, { name: true, label: `${si.name} emblem` }); }
    freqEl.textContent = si.freq || si.badge;
    fmEl.textContent = si.freq ? 'FM' : '';
    badgeEl.textContent = si.badge;
    badgeEl.hidden = !si.freq;
    stnEl.textContent = preview ? si.name : v.stationName;
    presets.forEach((b, i) => { b.setAttribute('aria-pressed', String(v.on && i === v.index)); });
    npEl.textContent = '';
    if (preview) npEl.textContent = 'Tuning...';
    else if (v.title) npEl.append('NOW: ', h('b', '', v.title));
    else npEl.textContent = v.on ? ' ' : 'Press Tune in, or turn the dial';
    const bits: string[] = [];
    if (!preview) {
      if (v.dj) bits.push(`DJ: ${v.dj}`);
      if (v.source && v.info.kind !== 'sc-account' && v.info.kind !== 'sc-playlist' && v.info.kind !== 'ra-pool') bits.push(`Source: ${v.source}`);
      if (v.pos !== null) bits.push(`${fmtTime(v.pos)}${v.length ? ` / ${fmtTime(v.length)}` : ''}`);
      if (v.talk) bits.push(v.talk.show ? `${v.talk.show} — ${v.talk.speaker}` : v.talk.speaker);
    }
    metaEl.textContent = bits.join('   ') || ' ';
    if (v.link && !preview) { metaEl.append('   '); metaEl.appendChild(link(v.link.label, v.link.url)); }

    /* needle, knobs, lights */
    const np = needlePos();
    needle.style.left = `${(np * 100).toFixed(2)}%`;
    (tuneKnob.firstElementChild as HTMLElement).style.transform = `rotate(${(-140 + np * 280).toFixed(1)}deg)`;
    tuneKnob.setAttribute('aria-valuenow', String(Math.round(np * 100)));
    tuneKnob.setAttribute('aria-valuetext', `${si.freq ? `${si.freq} FM, ` : ''}${si.name}`);
    (volKnob.firstElementChild as HTMLElement).style.transform = `rotate(${(-140 + page.volume * 280).toFixed(1)}deg)`;
    volKnob.setAttribute('aria-valuenow', String(Math.round(page.volume * 100)));
    scene.querySelectorAll('.mk').forEach((m) => m.classList.toggle('on', (m as HTMLElement).dataset.id === sid));
    const lit = (k: string, on: boolean): void => { ledsEl.querySelector(`[data-led="${k}"]`)?.classList.toggle('lit', on); };
    lit('sc', v.on && v.info.kind !== 'live-stream' && v.info.kind !== 'scripted');
    lit('live', v.on && v.info.kind === 'live-stream');
    lit('talk', v.on && v.info.kind === 'scripted');
    lit('air', v.on && v.status.level === 'ok');
    bb.classList.toggle('on', v.on);
    kPlay.querySelector('span')!.textContent = v.on ? 'Stop' : 'Tune in';
    kPlay.querySelector('svg')!.innerHTML = v.on ? '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/>' : '<path d="M7 4v16l13-8z" fill="currentColor"/>';

    /* caption */
    const c = v.caption;
    cap.classList.toggle('show', !!c);
    if (c) {
      capWho.textContent = c.who;
      capKind.textContent = kindLabel(c.kind);
      capKind.classList.toggle('dj', c.kind.startsWith('dj'));
      capTag.hidden = !c.parodyOf;
      capTag.title = c.parodyOf ? `A parody: ${c.parodyOf} is sent up by an invented performer.` : '';
      capText.textContent = c.text;
    }

    statusBox.dataset.level = v.status.level;
    stText.textContent = v.status.text;
    stReason.textContent = v.status.reason;
    bStart.hidden = v.status.level !== 'tap';
    bRetry.hidden = !(v.status.level === 'fail' || v.status.level === 'wait') || !v.on;
    toast.textContent = v.toast;
    toast.hidden = !v.toast;
    kSet.disabled = !v.canNextSet || !v.on;
    kOff.disabled = !v.on;
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

    /* log, newest first */
    const last = page.log[page.log.length - 1];
    const lsig = `${page.log.length}|${last ? `${last.at}${last.text}` : ''}`;
    if (lsig !== logSig) {
      logSig = lsig;
      logEl.textContent = '';
      if (!page.log.length) logEl.appendChild(h('div', 'empty', 'Nothing yet. Announcers and hosts speak a moment after you tune in.'));
      for (const e of page.log.slice().reverse()) {
        const row = h('div', `lg${e.kind.startsWith('dj') ? ' dj' : ''}`);
        const em = h('span', 'pe sm'); em.innerHTML = emblemSvg(e.stationId);
        const tm = h('time', '', new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        const head = h('div', 'lg-head');
        head.append(tm, h('span', 'lg-st', e.station), h('b', 'lg-who', e.who), h('span', `lg-kind${e.kind.startsWith('dj') ? ' dj' : ''}`, kindLabel(e.kind)));
        if (e.parodyOf) head.append(h('span', 'cap-tag', 'PARODY'));
        const body = h('div', 'lg-body');
        body.append(head, h('p', '', e.text));
        row.append(em, body);
        logEl.appendChild(row);
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
    if (!useRaf) paintViz(frameNow(0), 0);
  }
  const un = page.onChange(paint);
  paint();
  return () => {
    un();
    document.removeEventListener('keydown', onKey);
    if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    if (pendTimer) clearTimeout(pendTimer);
  };
}
