/** BOOMBOX: the tuning strip's maths. Pure. Stations with a frequency in the game sit at it; the others sit in the LIVE / TALK end. */
export const FM_LO = 89;
export const FM_HI = 104;
/** Part of the strip (0..1) the FM band takes; the rest is the LIVE / TALK end. */
const BAND_FROM = 0.03;
const BAND_TO = 0.77;
const LIVE_FROM = 0.84;
const LIVE_TO = 0.965;

export interface DialMark { id: string; pos: number; freq: string; live: boolean }

export function freqPos(mhz: number): number {
  const t = (Math.min(FM_HI, Math.max(FM_LO, mhz)) - FM_LO) / (FM_HI - FM_LO);
  return BAND_FROM + t * (BAND_TO - BAND_FROM);
}

/** One mark per station, in catalog order. Without a frequency: spread over the LIVE / TALK end in catalog order. */
export function dialMarks(stations: ReadonlyArray<{ id: string; freq: string }>): DialMark[] {
  const live = stations.filter((s) => !s.freq);
  return stations.map((s) => {
    if (s.freq && Number.isFinite(Number(s.freq))) return { id: s.id, pos: freqPos(Number(s.freq)), freq: s.freq, live: false };
    const i = live.findIndex((l) => l.id === s.id);
    const t = live.length > 1 ? i / (live.length - 1) : 0.5;
    return { id: s.id, pos: LIVE_FROM + t * (LIVE_TO - LIVE_FROM), freq: '', live: true };
  });
}

/** Station ids left to right along the strip. */
export function stripOrder(marks: readonly DialMark[]): string[] { return marks.slice().sort((a, b) => a.pos - b.pos).map((m) => m.id); }

/** The mark nearest a continuous position (the knob snaps to it). */
export function nearestMark(pos: number, marks: readonly DialMark[]): DialMark {
  let best = marks[0];
  for (const m of marks) if (Math.abs(m.pos - pos) < Math.abs(best.pos - pos)) best = m;
  return best;
}

/** Neighbour along the strip, wrapping. */
export function stepAlong(id: string, d: 1 | -1, marks: readonly DialMark[]): string {
  const o = stripOrder(marks);
  const i = Math.max(0, o.indexOf(id));
  return o[(i + d + o.length) % o.length];
}

/** Printed frequencies: every 2 MHz from 90 to 102 (major), every 1 between (minor). */
export function dialTicks(): Array<{ pos: number; label: string; major: boolean }> {
  const out: Array<{ pos: number; label: string; major: boolean }> = [];
  for (let f = 90; f <= 103; f++) out.push({ pos: freqPos(f), label: f % 2 === 0 ? String(f) : '', major: f % 2 === 0 });
  return out;
}
