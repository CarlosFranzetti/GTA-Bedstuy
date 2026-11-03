/** Room music: a looping procedural record, muffled in the deli, open in the club, silent at home. */
import { PROCEDURAL_RECORDS, type RecordSource } from '@/game/records';
import type { DjHost } from '@/game/DjAudio';
import type { InteriorId } from './defs';

const TRACK: Partial<Record<InteriorId, { id: string; cutoff: number; level: number }>> = {
  deli: { id: 'wax-01', cutoff: 3200, level: 0.45 },
  club: { id: 'wax-12', cutoff: 18000, level: 0.8 },
};

export class WebAmbient {
  private src: AudioBufferSourceNode | null = null;
  private nodes: AudioNode[] = [];
  private token = 0;
  private level = 0.5;
  constructor(private readonly host: () => DjHost | null, private readonly source: () => RecordSource | null) {}

  /** Wire to Interiors' `onChange`. Pass `suppress` true while the player's own decks play. */
  set(id: InteriorId | null): void {
    this.stop();
    const spec = id ? TRACK[id] : undefined;
    const host = this.host(); const source = this.source();
    if (!spec || !host || !source) return;
    const def = PROCEDURAL_RECORDS.find((r) => r.id === spec.id);
    if (!def) return;
    const my = ++this.token;
    void source.load(def).then((buf) => {
      if (!buf || my !== this.token) return;
      const { ctx, dest } = host;
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = spec.cutoff;
      const g = ctx.createGain(); g.gain.value = spec.level;
      s.connect(f); f.connect(g); g.connect(dest);
      try { s.start(); } catch { /* ignore */ }
      this.src = s; this.nodes = [f, g]; this.level = spec.level;
    });
  }

  stop(): void {
    this.token++;
    if (this.src) { try { this.src.stop(); this.src.disconnect(); } catch { /* ignore */ } this.src = null; }
    this.nodes.forEach((n) => { try { n.disconnect(); } catch { /* ignore */ } });
    this.nodes = [];
  }

  /** Lowers the room music while the player's decks play. */
  duck(on: boolean): void {
    const g = this.nodes[1] as GainNode | undefined;
    if (g) g.gain.value = on ? 0.05 : this.level;
  }
}
