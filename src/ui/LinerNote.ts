/**
 * Liner note: the truth behind a parody sleeve. Used by the WAX DELI shop and the DJ decks.
 * The sleeve is the joke; the note gives the real performer, title, year, source and licence (CC BY and honesty both need it).
 */
import { linerFor } from '@/game/archiveRecords';
import type { RecordDef } from '@/game/records';
import { sleeveElement } from './sleeve';

export function linerLines(def: RecordDef): string[] {
  const l = linerFor(def);
  if (!l) {
    if (def.kind === 'procedural') return ['Original loop synthesised in the game. No sample, no recording: the title and artist are invented too.'];
    if (def.kind === 'library') return ['Your own file, pressed from your Radio library. It never leaves your device.'];
    if (def.kind === 'drop') return ['Your own file from the drop folder. Licensing is on you.'];
    return [];
  }
  return [
    `Really: ${l.title}, by ${l.performer}, ${l.year}.`,
    l.recorded + '.',
    `Source: ${l.sourceName} (${l.sourceUrl}).`,
    `Licence: ${l.licence}. ${l.licenceText}`,
    ...(l.attribution ? [`Credit: ${l.attribution}`] : []),
    ...(l.changes ? [l.changes] : []),
  ];
}

/** The note as a DOM block: big sleeve on the left, the sleeve credits (invented) above the real credits. */
export function linerNote(doc: Document, def: RecordDef, onClose?: () => void): HTMLElement {
  const root = doc.createElement('div'); root.className = 'liner'; root.setAttribute('role', 'region'); root.setAttribute('aria-label', `Liner note: ${def.title}`);
  const sleeve = sleeveElement(doc, def, 'liner-sleeve');
  const text = doc.createElement('div'); text.className = 'liner-text';
  const add = (cls: string, content: string): HTMLElement => { const e = doc.createElement('p'); e.className = cls; e.textContent = content; text.appendChild(e); return e; };
  const l = linerFor(def);
  add('liner-h', 'On the sleeve (invented)');
  add('liner-t', def.title);
  add('liner-a', def.artist);
  if (def.label) add('liner-m', `${def.label} · ${def.cat ?? ''} · ${def.year ?? ''}`.replace(/ · $/, ''));
  if (l) {
    add('liner-h', 'The truth');
    add('liner-t', l.title);
    add('liner-a', `${l.performer}, ${l.year}`);
    add('liner-m', l.recorded);
    const src = doc.createElement('p'); src.className = 'liner-m';
    const a = doc.createElement('a'); a.href = l.sourceUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = l.sourceUrl.replace(/^https:\/\//, '');
    src.append(`${l.sourceName}: `, a); text.appendChild(src);
    add('liner-l', `Licence: ${l.licence}. ${l.licenceText}`);
    if (l.attribution) add('liner-l', `Credit: ${l.attribution}`);
    if (l.changes) add('liner-m', l.changes);
    if (l.checked) add('liner-m', l.checked === 'A' ? 'Licence check: tier A (a second statement agrees with the licence field).' : 'Licence check: tier B (the item\'s licence field, set by the label\'s own upload, is the only statement reachable).');
    add('liner-m', def.beatMatched === false ? 'Not beat-matched: the tempo drifts or could not be measured with confidence, so the decks show a guide tempo only.' : `Steady tempo, about ${Math.round(def.bpm)} BPM (an estimate: nudge by ear).`);
  } else {
    for (const ln of linerLines(def)) add('liner-l', ln);
  }
  root.append(sleeve, text);
  if (onClose) {
    const b = doc.createElement('button'); b.type = 'button'; b.className = 'shop-btn liner-close'; b.textContent = 'Back'; b.addEventListener('click', onClose); text.appendChild(b);
  }
  return root;
}
