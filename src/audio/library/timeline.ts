/**
 * A music station's playlist as a timeline: filled slots are tracks, runs of empty (or unplayable) slots are
 * procedural synth blocks, so a station never goes silent. The station's virtual clock moves through this
 * timeline and loops, whether or not the player is listening.
 */
import type { Library, Track } from './Library';
import type { LibraryStationId } from './genres';

/** Seconds of synth music that stand in for one empty slot. */
export const SYNTH_SLOT_SECONDS = 40;
/** Duration assumed for a track whose length could not be read. */
export const UNKNOWN_TRACK_SECONDS = 180;

export interface Segment {
  kind: 'track' | 'synth';
  /** First slot index covered. */
  slot: number;
  /** Seconds from the start of the loop. */
  start: number;
  duration: number;
  track?: Track;
}

export interface Timeline {
  segments: Segment[];
  total: number;
}

export function buildTimeline(lib: Library, station: LibraryStationId, unplayable: ReadonlySet<string> = new Set()): Timeline {
  const segments: Segment[] = [];
  let t = 0;
  const ids = lib.slotIds(station);
  for (let i = 0; i < ids.length; i++) {
    const track = lib.slotTrack(station, i);
    if (track && track.url && !unplayable.has(track.id)) {
      const duration = track.duration > 0 ? track.duration : UNKNOWN_TRACK_SECONDS;
      segments.push({ kind: 'track', slot: i, start: t, duration, track });
      t += duration;
    } else {
      const last = segments[segments.length - 1];
      if (last && last.kind === 'synth') { last.duration += SYNTH_SLOT_SECONDS; t += SYNTH_SLOT_SECONDS; }
      else { segments.push({ kind: 'synth', slot: i, start: t, duration: SYNTH_SLOT_SECONDS }); t += SYNTH_SLOT_SECONDS; }
    }
  }
  return { segments, total: t };
}

export interface Located {
  segment: Segment;
  /** Seconds into the segment. */
  offset: number;
  /** How many times the loop has completed. */
  cycle: number;
}

/** Finds what the virtual clock `vt` (seconds, monotonic) is playing. */
export function locate(tl: Timeline, vt: number): Located {
  const total = tl.total > 0 ? tl.total : 1;
  const v = Number.isFinite(vt) && vt > 0 ? vt : 0;
  const cycle = Math.floor(v / total);
  const t = v - cycle * total;
  let seg = tl.segments[tl.segments.length - 1];
  for (const s of tl.segments) if (t < s.start + s.duration) { seg = s; break; }
  return { segment: seg, offset: Math.max(0, Math.min(seg.duration, t - seg.start)), cycle };
}
