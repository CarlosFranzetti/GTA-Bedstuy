/** Which bark lines are baked for which voice group (shared by the pack plan and the runtime picker). */
import { clipKey, hash32 } from '../script';
import { BARKS, BARK_KINDS, CHATS, norm, type BarkKind, type BarkText } from './barks';
import { GROUP_BY_ID, PED_GROUPS, type PedVoiceGroup } from './groups';
import type { PlanClip } from '../packPlan';

/** How many voice groups each line is baked for (the size budget decides; see VOICES.md). */
export const GROUPS_PER_LINE = 2;

export interface BarkLine extends BarkText {
  id: string;
  kind: BarkKind;
  /** Chat pairs: 'a' opens, 'b' answers. */
  side?: 'a' | 'b';
  /** Pair id for chat lines. */
  pair?: string;
  /** Group ids this line is baked for. */
  baked: readonly string[];
}

export function lineId(kind: BarkKind, text: string): string { return hash32(`${kind}|${text}`); }

/** Groups eligible for a line: those sharing one of its personas, or all twelve for an unrestricted line. */
export function eligibleGroups(personas: readonly string[]): PedVoiceGroup[] {
  if (!personas.length) return [...PED_GROUPS];
  const g = PED_GROUPS.filter((x) => x.personas.some((p) => personas.includes(p)));
  return g.length ? g : [...PED_GROUPS];
}

/** Deterministic choice of the groups a line is baked for: a hash-ordered slice of the eligible groups. */
export function bakedGroups(id: string, personas: readonly string[], k = GROUPS_PER_LINE): string[] {
  const el = eligibleGroups(personas);
  return el
    .map((g) => ({ g, h: hash32(`${id}|${g.id}`) }))
    .sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0))
    .slice(0, k)
    .map((x) => x.g.id);
}

function build(): BarkLine[] {
  const out: BarkLine[] = [];
  for (const kind of BARK_KINDS) {
    if (kind === 'chat') {
      CHATS.forEach((p, i) => {
        const pair = `c${i.toString().padStart(2, '0')}`;
        for (const [side, raw] of [['a', p.a], ['b', p.b]] as const) {
          const t = norm(raw);
          const id = lineId('chat', t.text);
          // Chat lines are baked for more groups: two peds with different voices must both have their half.
          out.push({ ...t, id, kind: 'chat', side, pair, baked: bakedGroups(id, t.personas, GROUPS_PER_LINE + 1) });
        }
      });
      continue;
    }
    for (const raw of BARKS[kind]) {
      const t = norm(raw);
      const id = lineId(kind, t.text);
      out.push({ ...t, id, kind, baked: bakedGroups(id, t.personas) });
    }
  }
  return out;
}

export const BARK_LINES: readonly BarkLine[] = build();
export const BARK_BY_ID: ReadonlyMap<string, BarkLine> = new Map(BARK_LINES.map((l) => [l.id, l]));

/** Lines of a kind (and side) that are baked for this group; the picker prefers these so a bark is ready at once. */
export function linesFor(kind: BarkKind, groupId: string, side?: 'a' | 'b'): BarkLine[] {
  return BARK_LINES.filter((l) => l.kind === kind && (!side || l.side === side) && l.baked.includes(groupId));
}

/** Plan clips for the pack: tier 5, bank per voice group. */
export function planBarks(): PlanClip[] {
  const out: PlanClip[] = [];
  for (const l of BARK_LINES) {
    for (const gid of l.baked) {
      const g = GROUP_BY_ID.get(gid);
      if (!g) continue;
      out.push({ key: clipKey(l.text, g.voice, g.speed), who: g.id, voice: g.voice, speed: g.speed, text: l.text, kind: 'bark', bank: `bark-${g.id}`, tier: 5 });
    }
  }
  return out;
}

/** Lines written by CHAR14 (src/game/pedBarks.ts) for kinds without a table here: baked for two groups each, tier 5. */
export function planExternalBarks(lines: readonly string[]): PlanClip[] {
  const out: PlanClip[] = [];
  for (const text of new Set(lines)) {
    for (const gid of bakedGroups(`ext:${hash32(text)}`, [])) {
      const g = GROUP_BY_ID.get(gid)!;
      out.push({ key: clipKey(text, g.voice, g.speed), who: g.id, voice: g.voice, speed: g.speed, text, kind: 'bark', bank: `bark-${g.id}`, tier: 5 });
    }
  }
  return out;
}
