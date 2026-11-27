/**
 * TALK3: the Group Chat 99.9 as a rotation of bits instead of one fixed loop.
 *
 * A bit is one skit (an argument, a call-in, a quiz, an ad break ...). The old script (script-groupchat.json) is cut into
 * its own bits by id tag (`morn01`.. is one bit, the next tag starts the next); the new bits come from
 * script-groupchat-bits.json. `BitRotation.nextPass()` returns one pass: every bit exactly once, shuffled, with a
 * station ident before each bit and a short host link after every second one. The morning opener stays first and the
 * sign-off last. A pass never opens with the bit that closed the one before. TalkPlayer asks for the next pass when a
 * pass ends (`setScript(pass, () => rot.nextPass())`) and starts a first tune-in on a random line, inside a bit.
 * Pure data and logic: the radio page can use it as it is.
 */
import { parseScript, totalSeconds, type TalkSegment } from './script';

export interface Bit {
  id: string;
  /** Show form: argument, call-in, expert interview, consumer desk, ad break, listener mail, quiz, field report, news desk ... */
  form: string;
  title: string;
  /** Owner's targets and topics this bit covers (TALK3 coverage table). */
  topics: readonly string[];
  segments: readonly TalkSegment[];
  /** Fixed place in every pass. */
  pin?: 'first' | 'last';
}

export interface BitFile { idents: string[]; links: string[]; bits: Bit[] }

type Random = () => number;

/** Forms of the old 400-line script's tags (TALK2's rundown). */
const OLD_FORMS: Record<string, { form: string; title: string; topics: string[] }> = {
  morn: { form: 'morning show', title: 'Morning Scroll', topics: ['ai', 'weather', 'subway'] },
  bell: { form: 'call-in', title: 'Thirty Seconds and a Bell', topics: ['trump', 'mamdani'] },
  money: { form: 'money desk', title: 'Money Chat', topics: ['stocks', 'crypto'] },
  land: { form: 'tour', title: 'Landmarks', topics: ['landmarks'] },
  clin: { form: 'advice', title: 'The Clinic', topics: ['dating'] },
  tech: { form: 'scene report', title: 'Black Room', topics: ['techno'] },
  house: { form: 'scene report', title: 'Hug Frequency', topics: ['house'] },
  after: { form: 'call-in', title: 'After the After', topics: ['underground'] },
  news: { form: 'news desk', title: 'Tiny News', topics: ['news'] },
  ai: { form: 'segment', title: 'Is Pat Real', topics: ['ai'] },
  wx: { form: 'weather', title: 'Weather', topics: ['weather'] },
  transit: { form: 'transit', title: 'Transit', topics: ['subway'] },
  close: { form: 'sign-off', title: 'Sign Off', topics: [] },
};

/** Cuts a flat script into its bits: a run of segments with the same id tag (the id without its trailing counter). */
export function bitsFromFlat(segs: readonly TalkSegment[], prefix = 'old'): Bit[] {
  const out: Bit[] = [];
  let tag = '';
  for (const s of segs) {
    const t = s.id.replace(/\d+$/, '');
    if (t !== tag || out.length === 0) {
      tag = t;
      const meta = OLD_FORMS[t] ?? { form: 'segment', title: t, topics: [] };
      out.push({ id: `${prefix}-${out.length + 1}-${t}`, form: meta.form, title: meta.title, topics: meta.topics, segments: [],
        pin: t === 'morn' && out.length === 0 ? 'first' : undefined });
    }
    (out[out.length - 1].segments as TalkSegment[]).push(s);
  }
  const last = out[out.length - 1];
  if (last && last.id.endsWith('-close')) last.pin = 'last';
  return out;
}

/** Reads script-groupchat-bits.json (tolerant: bad bits are dropped). */
export function parseBitFile(raw: unknown): BitFile {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : []);
  const bits: Bit[] = [];
  for (const b of Array.isArray(o.bits) ? o.bits : []) {
    if (!b || typeof b !== 'object') continue;
    const r = b as Record<string, unknown>;
    const segments = parseScript(r.segments);
    if (typeof r.id !== 'string' || segments.length === 0) continue;
    bits.push({ id: r.id, form: typeof r.form === 'string' ? r.form : 'segment', title: typeof r.title === 'string' ? r.title : r.id, topics: strs(r.topics), segments });
  }
  return { idents: strs(o.idents), links: strs(o.links), bits };
}

function shuffled<T>(items: readonly T[], random: Random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(Math.max(0, random()) * (i + 1)));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class BitRotation {
  private pass = 0;
  private lastBit = '';
  private identBag: string[] = [];
  private linkBag: string[] = [];
  /** Bit ids of the pass handed out last, in order (tests, the radio page). */
  order: string[] = [];

  constructor(readonly bits: readonly Bit[], private readonly idents: readonly string[], private readonly links: readonly string[] = [],
    private readonly random: Random = Math.random, private readonly identSpeaker = 'Group Chat Jingle', private readonly linkSpeaker = 'Station Voice') {}

  get passes(): number { return this.pass; }

  /** One pass of every bit once, shuffled, with idents and links between bits, as one flat script. */
  nextPass(): TalkSegment[] {
    if (this.bits.length === 0) return [];
    this.pass++;
    const first = this.bits.filter((b) => b.pin === 'first');
    const last = this.bits.filter((b) => b.pin === 'last');
    let mid = shuffled(this.bits.filter((b) => !b.pin), this.random);
    // Never open a pass with the bit that closed the previous one.
    if (first.length === 0 && mid.length > 1 && mid[0].id === this.lastBit) mid = [...mid.slice(1), mid[0]];
    const order = [...first, ...mid, ...last];
    this.order = order.map((b) => b.id);
    this.lastBit = (mid[mid.length - 1] ?? order[order.length - 1]).id;
    const out: TalkSegment[] = [];
    order.forEach((b, i) => {
      const opensWithJingle = b.segments[0]?.kind === 'jingle';
      const ident = this.draw('ident');
      if (ident && !opensWithJingle) out.push(this.seg(`ident-${this.pass}-${i}`, 'jingle', this.identSpeaker, ident));
      out.push(...b.segments);
      const link = i % 2 === 1 && i < order.length - 1 ? this.draw('link') : '';
      if (link) out.push(this.seg(`link-${this.pass}-${i}`, 'host', this.linkSpeaker, link));
    });
    return out;
  }

  /** Planned length of one pass in seconds (bits only, without idents and links). */
  get bitSeconds(): number { return this.bits.reduce((n, b) => n + totalSeconds(b.segments), 0); }

  private seg(id: string, kind: TalkSegment['kind'], speaker: string, text: string): TalkSegment {
    return parseScript([{ id, kind, speaker, voice: 'announcer', text }])[0];
  }

  private draw(which: 'ident' | 'link'): string {
    const src = which === 'ident' ? this.idents : this.links;
    if (src.length === 0) return '';
    let bag = which === 'ident' ? this.identBag : this.linkBag;
    if (bag.length === 0) { bag = shuffled(src, this.random); if (which === 'ident') this.identBag = bag; else this.linkBag = bag; }
    return bag.pop()!;
  }
}

/** Old script plus new bits as one rotation. */
export function groupChatRotation(oldScript: readonly TalkSegment[], file: BitFile, random: Random = Math.random): BitRotation {
  return new BitRotation([...bitsFromFlat(oldScript), ...file.bits], file.idents, file.links, random);
}

/**
 * Loads both Group Chat files as their own chunks, on hosted and native builds only (the single-file build never
 * includes them and the station is then not on the dial). Null when either is missing.
 */
export async function loadGroupChatRotation(random: Random = Math.random): Promise<BitRotation | null> {
  if (import.meta.env?.VITE_HOSTED !== '1') return null;
  const oldMods = import.meta.glob('./script-groupchat.json', { import: 'default' }) as Record<string, () => Promise<unknown>>;
  const newMods = import.meta.glob('./script-groupchat-bits.json', { import: 'default' }) as Record<string, () => Promise<unknown>>;
  const o = Object.values(oldMods)[0];
  const n = Object.values(newMods)[0];
  if (!o) return null;
  const [oldRaw, newRaw] = await Promise.all([o(), n ? n() : Promise.resolve(null)]);
  const old = parseScript(oldRaw);
  if (old.length === 0) return null;
  return groupChatRotation(old, parseBitFile(newRaw), random);
}
