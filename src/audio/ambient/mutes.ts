/**
 * Per-source mutes for the environment sounds (AMBIENT, 27 Nov 2026), so a player who still hears a stutter can switch the
 * suspects off one at a time and tell us which one it is. Not engine, not radio.
 *
 * How to use it: open the game with `?mute=hum,weather` (comma list; `?mute=all` mutes every source below), or turn on
 * `?debug=audio` and click a source name in the panel. The choice is kept in localStorage (`gta.audio.mute`) and a plain
 * `?mute=none` clears it. Everything is wrapped in try/catch: with storage blocked it simply works for the session.
 */
export const AMBIENT_SOURCES = [
  { id: 'hum', label: 'city hum (day and night bed)' },
  { id: 'crickets', label: 'night crickets' },
  { id: 'wash', label: 'traffic wash' },
  { id: 'road', label: 'tyres, cabin wind, squeal' },
  { id: 'weather', label: 'rain, wind, thunder' },
  { id: 'sirens', label: 'distant sirens' },
  { id: 'birds', label: 'birds' },
  { id: 'kids', label: 'kids and far music' },
  { id: 'steps', label: 'footsteps' },
  { id: 'signals', label: 'crosswalk signals' },
  { id: 'peds', label: 'pedestrian chatter' },
] as const;
export type AmbientSource = (typeof AMBIENT_SOURCES)[number]['id'];
const IDS: string[] = AMBIENT_SOURCES.map((s) => s.id);
const KEY = 'gta.audio.mute';

export class SourceMutes {
  private readonly set_ = new Set<string>();
  private readonly subs = new Set<(id: string, on: boolean) => void>();

  constructor(search = '', private readonly store: Pick<Storage, 'getItem' | 'setItem'> | null = null) {
    const q = new URLSearchParams(search).get('mute');
    if (q !== null) this.load(q); // an explicit URL choice replaces the stored one
    else { try { this.load(store?.getItem(KEY) ?? ''); } catch { /* storage blocked */ } }
    if (q !== null) this.save();
  }

  private load(list: string): void {
    this.set_.clear();
    const parts = list.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (parts.includes('none')) return;
    if (parts.includes('all')) { for (const id of IDS) this.set_.add(id); return; }
    for (const p of parts) if (IDS.includes(p)) this.set_.add(p);
  }
  private save(): void { try { this.store?.setItem(KEY, [...this.set_].join(',') || 'none'); } catch { /* storage blocked */ } }

  muted(id: AmbientSource): boolean { return this.set_.has(id); }
  /** 0 when muted, else 1: multiply a level by it. */
  gain(id: AmbientSource): number { return this.set_.has(id) ? 0 : 1; }
  list(): string[] { return [...this.set_]; }
  get any(): boolean { return this.set_.size > 0; }
  set(id: AmbientSource, on: boolean): void {
    if (on === this.set_.has(id)) return;
    if (on) this.set_.add(id); else this.set_.delete(id);
    this.save();
    for (const f of this.subs) f(id, on);
  }
  toggle(id: AmbientSource): boolean { this.set(id, !this.set_.has(id)); return this.set_.has(id); }
  onChange(f: (id: string, on: boolean) => void): () => void { this.subs.add(f); return () => { this.subs.delete(f); }; }
}

function search(): string { try { return typeof location !== 'undefined' ? location.search : ''; } catch { return ''; } }
function store(): Pick<Storage, 'getItem' | 'setItem'> | null { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } }

/** The shared instance every source reads. Tests build their own with `new SourceMutes()`. */
export const sourceMutes = new SourceMutes(search(), store());
