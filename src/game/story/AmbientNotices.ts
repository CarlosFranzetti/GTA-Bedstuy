/**
 * Ambient storytelling: posters, eviction notices, billboards and scorch-board signs that appear on the facades as the
 * story moves (flag-driven, so a loaded save shows the right block). Pure data (`ambientItems`) + a small three.js
 * group (`AmbientNotices`) that paints each sign onto a canvas texture, once, the first time it becomes visible.
 *
 * Host: `scene.add(ambient.group)`; `ambient.sync(missions.story)` whenever `story.version` changes (cheap to call each frame).
 * Positions sit on the lot frontage line (`facePoint`, without the sidewalk offset), facing the street.
 */
import * as THREE from 'three';
import type { Vec2 } from '@/core/Math2';
import type { FlagRule } from '@/game/missions/types';
import type { GridModel, Side } from '@/world/types';
import { F } from './flags';
import type { StoryState } from './StoryState';

export type AmbientKind = 'poster' | 'notice' | 'billboard' | 'decal' | 'sign';

export interface AmbientItem {
  id: string;
  kind: AmbientKind;
  x: number; z: number;
  /** Direction the sign faces (the street side), as a unit vector. */
  nx: number; nz: number;
  /** Height of the centre above the pavement, and size (m). */
  y: number; w: number; h: number;
  title: string;
  body: string;
  /** Visible while this holds (all of `flag`/`not`). */
  show: FlagRule;
  /** Also hidden when any of these flags is set (endings that replace a sign). */
  hideWhen?: string[];
}

/** Point on the lot frontage line of a block face (t 0..1 along it) and the outward normal. */
function frontage(grid: GridModel, blockId: string, side: Side, t: number): { p: Vec2; n: Vec2 } {
  const face = grid.blockById(blockId).faces.find((f) => f.side === side);
  if (!face) throw new Error(`no face ${blockId}/${side}`);
  const k = Math.min(1, Math.max(0, t));
  return { p: { x: face.a.x + (face.b.x - face.a.x) * k, z: face.a.z + (face.b.z - face.a.z) * k }, n: { x: face.outward.x, z: face.outward.z } };
}

/** `?map=real`: where the frontage is on the real lots (roadnet/placesReal.ts `RealPlaces.frontage`). */
export type RealFrontage = (blockId: string, side: Side, t: number) => { p: Vec2; n: Vec2 };

export function ambientItems(grid: GridModel, real?: RealFrontage): AmbientItem[] {
  const at = (blockId: string, side: Side, t: number, base: Omit<AmbientItem, 'x' | 'z' | 'nx' | 'nz'>): AmbientItem => {
    const f = real ? real(blockId, side, t) : frontage(grid, blockId, side, t);
    return { ...base, x: f.p.x + f.n.x * 0.08, z: f.p.z + f.n.z * 0.08, nx: f.n.x, nz: f.n.z };
  };
  const base = (id: string, kind: AmbientKind, y: number, w: number, h: number, title: string, body: string, show: FlagRule, hideWhen?: string[]) => ({ id, kind, y, w, h, title, body, show, hideWhen });
  const items: AmbientItem[] = [
    // the paper that starts it (peeled by Notice of Intent)
    ...[['r3c1', 'W', 0.45], ['r3c1', 'W', 0.78], ['r4c1', 'W', 0.15], ['r4c1', 'W', 0.45]].map(([b, s, t], i) =>
      at(b as string, s as Side, t as number, base(`notice-${i}`, 'notice', 1.7, 0.5, 0.7, 'NOTICE OF INTENT', 'to accept offers\nfrom parties unknown\n\nSigned: nobody', { not: F.ACT1 }))),
    at('r1c1', 'S', 0.5, base('billboard-parallax', 'billboard', 6.5, 9, 3.4, 'PARALLAX LIVING', 'Live on a street that used to have a name.', { flag: F.ACT1 }, [F.END_TRUST])),
    at('r2c1', 'W', 0.4, base('save-wax', 'poster', 2.0, 0.9, 1.2, 'SAVE WAX DELI', 'Records, patties, and a counter\nthat has never once asked\nwhat you do for a living.', { flag: F.ACT1, not: F.ODETTE_EVICTED })),
    at('r0c0', 'W', 0.5, base('stillwater', 'poster', 1.9, 0.8, 1.1, 'STILLWATER COLLECTIVE', 'Sound baths. Breathwork.\nSliding scale. Silence extra.', { not: F.ACT3 })),
    at('r0c0', 'W', 0.56, base('community-partner', 'decal', 1.6, 0.55, 0.55, 'COMMUNITY PARTNER', 'Parallax Living\n(non-renewing)', { flag: F.ACT1 }, [F.END_TRUST])),
    at('r2c1', 'W', 0.4, base('wax-closed', 'notice', 1.5, 1.1, 1.4, 'CLOSED BY ORDER OF THE MARSHAL', 'Thirty-eight years.\nThe records are not here.', { flag: F.ODETTE_EVICTED })),
    at('r2c1', 'W', 0.43, base('wax-partnering', 'decal', 1.0, 0.8, 0.3, 'THANK YOU FOR PARTNERING', '', { flag: F.ODETTE_FIXER, not: F.ODETTE_PAID }, undefined)),
    at('r4c0', 'E', 0.5, base('narcan-psa', 'poster', 1.9, 0.7, 1.0, 'FREE OVERDOSE KITS', 'Ask at the register.\nNobody will ask why.', { flag: F.TAY_ALIVE })),
    at('r2c1', 'W', 0.86, base('fire-board', 'sign', 1.8, 1.4, 1.0, 'NO ADMITTANCE', 'Fire investigation.\nPlease do not light anything.', { flag: F.AUNTIE_BURNED }, [F.END_TRUST])),
    at('r2c1', 'W', 0.74, base('hearing-flyer', 'poster', 1.9, 0.6, 0.85, 'TENANTS\' HEARING 9AM', 'Borough Hall.\nBring a neighbour.\nBring a casserole.', { flag: F.AUNTIE_BURNED })),
    at('r2c1', 'W', 0.86, base('land-trust', 'sign', 2.0, 1.6, 0.8, 'THROOP LAND TRUST', 'Not for sale.\nNot for rent increase.', { flag: F.END_TRUST })),
    at('r1c1', 'S', 0.5, base('billboard-faces', 'billboard', 6.5, 9, 3.4, 'NINE HOMES', 'The fire marshal\'s log, in public.', { flag: F.END_TRUST })),
    at('r2c1', 'W', 0.7, base('throop-row', 'sign', 2.2, 1.8, 0.7, 'THROOP ROW RESIDENCES', 'Heat on. Pets not on.', { flag: F.END_LANDLORD })),
    at('r1c1', 'S', 0.5, base('billboard-stoopable', 'billboard', 6.5, 9, 3.4, 'STOOPABLE', 'Now frictionless.', { flag: F.END_BUYOUT })),
  ];
  return items;
}

const visible = (i: AmbientItem, s: Pick<StoryState, 'has' | 'test'>): boolean =>
  s.test(i.show) && !(i.hideWhen ?? []).some((f) => s.has(f));

export class AmbientNotices {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<string, THREE.Mesh>();
  private lastVersion = -1;
  private readonly items: AmbientItem[];

  constructor(grid: GridModel, real?: RealFrontage) {
    this.items = ambientItems(grid, real);
    this.group.name = 'ambient-notices';
  }

  /** Items currently visible for this story state (also what tests read). */
  visibleIds(story: Pick<StoryState, 'has' | 'test'>): string[] { return this.items.filter((i) => visible(i, story)).map((i) => i.id); }

  /** Show / hide the signs for the story state. Only does work when `story.version` changed. */
  sync(story: StoryState): void {
    if (story.version === this.lastVersion) return;
    this.lastVersion = story.version;
    for (const item of this.items) {
      const on = visible(item, story);
      let mesh = this.meshes.get(item.id);
      if (on && !mesh) { mesh = this.build(item); this.meshes.set(item.id, mesh); this.group.add(mesh); }
      if (mesh) mesh.visible = on;
    }
  }

  dispose(): void {
    for (const m of this.meshes.values()) { m.geometry.dispose(); const mat = m.material as THREE.MeshBasicMaterial; mat.map?.dispose(); mat.dispose(); }
    this.meshes.clear();
    this.group.clear();
  }

  private build(i: AmbientItem): THREE.Mesh {
    const tex = paint(i);
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: tex ? 0xffffff : COLORS[i.kind].bg, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(i.w, i.h), mat);
    mesh.position.set(i.x, i.y, i.z);
    mesh.rotation.y = Math.atan2(i.nx, i.nz); // plane +z faces the street
    mesh.name = `ambient:${i.id}`;
    mesh.userData.ambient = i.id;
    return mesh;
  }
}

const COLORS: Record<AmbientKind, { bg: number; fg: string; bgCss: string }> = {
  poster: { bg: 0xe8e0c8, fg: '#2a2418', bgCss: '#e8e0c8' },
  notice: { bg: 0xf4f0e0, fg: '#7a1111', bgCss: '#f4f0e0' },
  billboard: { bg: 0x1f6f5a, fg: '#f3f0e2', bgCss: '#1f6f5a' },
  decal: { bg: 0xdce8e4, fg: '#2c5a4c', bgCss: '#dce8e4' },
  sign: { bg: 0x222222, fg: '#f0e8d0', bgCss: '#222222' },
};

/** Paint a sign onto a canvas texture. Returns null where no canvas exists (tests, workers): the mesh falls back to a flat colour. */
function paint(i: AmbientItem): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  let ctx: CanvasRenderingContext2D | null = null;
  const canvas = document.createElement('canvas');
  try { ctx = canvas.getContext('2d'); } catch { ctx = null; }
  if (!ctx) return null;
  const px = 256;
  canvas.width = px; canvas.height = Math.max(64, Math.round(px * (i.h / i.w)));
  const c = COLORS[i.kind];
  ctx.fillStyle = c.bgCss; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = c.fg; ctx.lineWidth = 4; ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
  ctx.fillStyle = c.fg; ctx.textAlign = 'center';
  ctx.font = `bold ${i.kind === 'billboard' ? 30 : 24}px sans-serif`;
  wrap(ctx, i.title, canvas.width / 2, 38, canvas.width - 28, 28);
  ctx.font = '16px sans-serif';
  i.body.split('\n').forEach((line, k) => ctx!.fillText(line, canvas.width / 2, canvas.height * 0.55 + k * 20, canvas.width - 24));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number): void {
  let line = '', yy = y;
  for (const word of text.split(' ')) {
    const t = line ? `${line} ${word}` : word;
    if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, yy); line = word; yy += lh; } else line = t;
  }
  if (line) ctx.fillText(line, x, yy);
}
