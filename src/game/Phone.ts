/**
 * Phone: a minimal in-world phone. Pure logic (no DOM): text messages queued by missions (setup call, follow-up
 * after the reward), a contacts list that grows as you meet people, and the "next mission" pointer.
 *
 *   phone.text(from, body, { delay })  -> queued; delivered after `delay` real seconds of `update`
 *   bindPhone(phone, missions)         -> wires mission events to the phone (intro on start, follow-up after reward)
 *   phone.serialize() / restore()      -> small JSON, validated; storage helpers at the bottom
 *
 * PhoneHud (src/ui/PhoneHud.ts) renders it. Nothing here imports three.js or the DOM.
 */
import type { Vec2 } from '@/core/Math2';
import type { MissionDef } from './missions/types';

export interface PhoneMessage { id: string; from: string; text: string; read: boolean; seq: number }
export interface PhoneContact { name: string; lastSeq: number }
interface Queued { due: number; key: string; from: string; text: string }

/** Where the "next mission" pointer points. */
export interface PhonePointer { title: string; blurb: string; x: number; z: number; distance: number; hint: string }

export interface PhoneSave { v: 1; messages: PhoneMessage[]; queued: Array<{ dueIn: number; key: string; from: string; text: string }>; keys: string[]; seq: number }

const MAX_MESSAGES = 60;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Minimal view of MissionSystem the phone needs, so tests can fake it. */
export interface PhoneMissionSource {
  readonly missions: readonly MissionDef[];
  nextOffer(hour?: number): MissionDef | null;
  on(type: 'mission:started' | 'mission:completed', fn: (e: { id: string }) => void): () => void;
}

export class Phone {
  /** Newest last. */
  readonly messages: PhoneMessage[] = [];
  /** Bumps on every visible change (new text, read, pointer); the HUD compares it. */
  version = 0;
  /** Called with each message the moment it is delivered (toast + ring). */
  onText?: (m: PhoneMessage) => void;
  /** Called when the save changed (new text, read). */
  persist?: (save: PhoneSave) => void;
  readonly pointer: PhonePointer = { title: '', blurb: '', x: 0, z: 0, distance: -1, hint: '' };
  isOpen = false;

  private time = 0;
  private seq = 0;
  private queue: Queued[] = [];
  private readonly keys = new Set<string>();
  private source: PhoneMissionSource | null = null;
  private pointerT = 1e9;

  get unread(): number { let n = 0; for (const m of this.messages) if (!m.read) n++; return n; }
  get hasPointer(): boolean { return this.pointer.title !== ''; }

  /** Contacts: everyone who has texted you, most recent first. */
  get contacts(): PhoneContact[] {
    const last = new Map<string, number>();
    for (const m of this.messages) last.set(m.from, m.seq);
    return [...last].map(([name, lastSeq]) => ({ name, lastSeq })).sort((a, b) => b.lastSeq - a.lastSeq);
  }

  /** Messages from one contact, oldest first. */
  thread(name: string): PhoneMessage[] { return this.messages.filter((m) => m.from === name); }

  /**
   * Queue a text. `key` de-duplicates (a retry must not resend the intro). `delay` is real seconds.
   * Returns false when the key was already used.
   */
  text(from: string, text: string, opts: { delay?: number; key?: string } = {}): boolean {
    const key = opts.key ?? '';
    if (key && (this.keys.has(key) || this.queue.some((q) => q.key === key))) return false;
    const delay = Math.max(0, opts.delay ?? 0);
    this.queue.push({ due: this.time + delay, key, from, text });
    if (delay === 0) this.flush();
    else this.save();
    return true;
  }

  get pending(): number { return this.queue.length; }

  open(): void { if (!this.isOpen) { this.isOpen = true; this.version++; } }
  close(): void { if (this.isOpen) { this.isOpen = false; this.version++; } }
  toggle(): void { if (this.isOpen) this.close(); else this.open(); }

  markAllRead(): void {
    let changed = false;
    for (const m of this.messages) if (!m.read) { m.read = true; changed = true; }
    if (changed) { this.version++; this.save(); }
  }

  /** Connects mission events: the setup text on first start, the follow-up text after the reward. */
  bind(source: PhoneMissionSource): () => void {
    this.source = source;
    const offs = [
      source.on('mission:started', (e) => {
        const d = source.missions.find((m) => m.id === e.id);
        if (d?.phoneIntro) this.text(d.phoneIntro.from, d.phoneIntro.text, { key: `intro:${d.id}` });
      }),
      source.on('mission:completed', (e) => {
        const d = source.missions.find((m) => m.id === e.id);
        if (d?.followUp) this.text(d.followUp.from, d.followUp.text, { delay: d.followUp.delay, key: `follow:${d.id}` });
        this.pointerT = 1e9;
      }),
    ];
    return () => { for (const off of offs) off(); this.source = null; };
  }

  /** Call once per frame (real seconds). Delivers due texts and refreshes the pointer about twice a second. */
  update(dt: number, pos: Vec2, hour = -1): void {
    this.time += dt;
    if (this.queue.length > 0) this.flush();
    this.pointerT += dt;
    if (this.pointerT >= 0.5) { this.pointerT = 0; this.refreshPointer(pos, hour); }
  }

  /** The distance readout is live between refreshes. */
  private refreshPointer(pos: Vec2, hour: number): void {
    const next = this.source?.nextOffer(hour) ?? null;
    const p = this.pointer;
    const before = `${p.title}|${Math.round(p.distance / 10)}`;
    if (!next) { p.title = ''; p.blurb = ''; p.distance = -1; p.hint = ''; }
    else {
      p.title = next.title; p.blurb = next.blurb; p.x = next.giver.x; p.z = next.giver.z;
      p.distance = Math.hypot(next.giver.x - pos.x, next.giver.z - pos.z);
      p.hint = next.availableHours ? `Offered ${hourText(next.availableHours[0])} to ${hourText(next.availableHours[1])}` : 'Offered all day';
    }
    if (before !== `${p.title}|${Math.round(p.distance / 10)}`) this.version++;
  }

  private flush(): void {
    let changed = false;
    this.queue.sort((a, b) => a.due - b.due);
    while (this.queue.length > 0 && this.queue[0].due <= this.time) {
      const q = this.queue.shift()!;
      if (q.key) this.keys.add(q.key);
      const m: PhoneMessage = { id: `m${this.seq}`, from: q.from, text: q.text, read: this.isOpen, seq: this.seq++ };
      this.messages.push(m);
      if (this.messages.length > MAX_MESSAGES) this.messages.shift();
      changed = true;
      this.onText?.(m);
    }
    if (changed) { this.version++; this.save(); }
  }

  // ------------------------------------------------------------------ persistence

  serialize(): PhoneSave {
    return {
      v: 1, messages: this.messages.map((m) => ({ ...m })), seq: this.seq, keys: [...this.keys],
      queued: this.queue.map((q) => ({ dueIn: Math.max(0, q.due - this.time), key: q.key, from: q.from, text: q.text })),
    };
  }

  /** Returns false (state untouched) when `data` is not a valid save. */
  restore(data: unknown): boolean {
    if (typeof data !== 'object' || data === null) return false;
    const o = data as Partial<PhoneSave>;
    if (o.v !== 1 || !Array.isArray(o.messages) || !Array.isArray(o.queued) || !Array.isArray(o.keys) || !finite(o.seq)) return false;
    const okMsg = (m: unknown): m is PhoneMessage => {
      const x = m as PhoneMessage;
      return typeof x === 'object' && x !== null && typeof x.id === 'string' && typeof x.from === 'string' && typeof x.text === 'string' && typeof x.read === 'boolean' && finite(x.seq);
    };
    const okQ = (q: unknown): boolean => {
      const x = q as PhoneSave['queued'][number];
      return typeof x === 'object' && x !== null && finite(x.dueIn) && typeof x.key === 'string' && typeof x.from === 'string' && typeof x.text === 'string';
    };
    if (!o.messages.every(okMsg) || !o.queued.every(okQ) || !o.keys.every((k) => typeof k === 'string')) return false;
    this.messages.length = 0;
    for (const m of o.messages) this.messages.push({ id: m.id, from: m.from, text: m.text, read: m.read, seq: m.seq });
    this.seq = o.seq;
    this.keys.clear();
    for (const k of o.keys) this.keys.add(k);
    this.queue = o.queued.map((q) => ({ due: this.time + Math.max(0, q.dueIn), key: q.key, from: q.from, text: q.text }));
    this.version++;
    return true;
  }

  private save(): void { this.persist?.(this.serialize()); }
}

function hourText(h: number): string {
  const hh = ((Math.floor(h) % 24) + 24) % 24;
  return `${hh % 12 === 0 ? 12 : hh % 12}${hh >= 12 ? 'pm' : 'am'}`;
}

// ---------------------------------------------------------------------- storage (own key, all access guarded)

export const PHONE_SAVE_KEY = 'gta-bedstuy.phone.v1';

function store(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function savePhoneData(save: PhoneSave): void {
  try { store()?.setItem(PHONE_SAVE_KEY, JSON.stringify(save)); } catch { /* quota / blocked */ }
}

export function loadPhoneData(): unknown {
  try {
    const raw = store()?.getItem(PHONE_SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearPhoneData(): void {
  try { store()?.removeItem(PHONE_SAVE_KEY); } catch { /* ignore */ }
}
