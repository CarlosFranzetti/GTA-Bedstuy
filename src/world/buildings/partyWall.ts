/**
 * Party walls and roofs that read as different buildings: per-lot look (brick colour of the exposed side walls, tar
 * roof variant), the dressing of a side wall that shows above a lower neighbour (soot gradient, faded painted-ad ghost
 * sign with parody text, bricked-up "blind" windows) and the rooftop extras (tar patches, vents, a condenser box, a
 * hatch, a TV mast). Everything is drawn with a lot-local `LotBatch`; nothing here consumes the lot's own rng stream,
 * so the facades keep their layouts (each lot hashes its id into a private stream).
 *
 * The decal atlas (one 1024 x 768 canvas texture, one transparent material for the whole city) holds four ghost signs
 * and a soot gradient. It needs a DOM canvas; without one (unit tests) the decals are skipped and the rest still builds.
 */
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import type { IMaterialLibrary, Lot } from '@/world/types';
import type { BuildingMats, LotBatch } from './facade';

const UPPER_STOREY = 2.9;

export interface LotLook {
  /** brick of the party / back walls and the parapet ring */
  party: THREE.Material;
  /** tar roof (variant of tarRoof) and a contrasting one for patches */
  roof: THREE.Material;
  roofPatch: THREE.Material;
  /** a different brick for blind-window infill */
  infill: THREE.Material;
  /** private rng stream for this lot's wall and roof dressing */
  rng: Rng;
}

const lookCache = new WeakMap<BuildingMats, Map<string, LotLook>>();

/** Per-lot look from the lot id (stable across rebuilds, independent of the lot's own rng stream). */
export function lotLook(m: BuildingMats, lot: Lot): LotLook {
  let byLot = lookCache.get(m);
  if (!byLot) { byLot = new Map(); lookCache.set(m, byLot); }
  const hit = byLot.get(lot.id);
  if (hit) return { ...hit, rng: new Rng(Rng.hash(`${lot.id}:dress`)) };
  const r = new Rng(Rng.hash(`${lot.id}:look`));
  // lots that carry a facade photo replace m.brickRed by their own material: leave those walls alone
  const bricks = m.partyBricks;
  const photo = !!bricks && bricks[0] !== m.brickRed;
  const pw = r.next();
  const party = photo || !bricks ? m.brickRed : bricks[pw < 0.36 ? 0 : pw < 0.6 ? 1 : pw < 0.82 ? 2 : 3];
  const roofs = m.roofs && m.roofs.length >= 3 ? m.roofs : [m.roof, m.roof, m.roof];
  const rv = r.next();
  const ri = rv < 0.42 ? 0 : rv < 0.68 ? 1 : 2;
  const look: LotLook = {
    party,
    roof: roofs[ri],
    roofPatch: roofs[(ri + 1 + (r.next() < 0.5 ? 1 : 0)) % 3],
    infill: party === m.brickAlt ? m.brickRed : m.brickAlt,
    rng: r,
  };
  byLot.set(lot.id, look);
  return { ...look, rng: new Rng(Rng.hash(`${lot.id}:dress`)) };
}

// ---------------------------------------------------------------------------------------------- decal atlas

const ATLAS_W = 1024, ATLAS_H = 768;
/** four ghost-sign tiles (512 x 256) and a soot tile (512 x 256 at 0,512), canvas pixel rects */
const GHOSTS: ReadonlyArray<readonly [number, number]> = [[0, 0], [512, 0], [0, 256], [512, 256]];
const SOOT_TILE = [0, 512] as const;
const TILE_W = 512, TILE_H = 256;

const decalCache = new WeakMap<IMaterialLibrary, THREE.Material | null>();

function paintGhost(ctx: CanvasRenderingContext2D, ox: number, oy: number, i: number, rng: Rng): void {
  const pad = 10;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox + pad, oy + pad, TILE_W - 2 * pad, TILE_H - 2 * pad);
  ctx.clip();
  // painted field with a hand-lettered look: a cream or pale-red panel, a rule, two lines of text
  const field = ['#e7dfc9', '#d9cdb0', '#c9b69a', '#e2d6c0'][i];
  const ink = ['#2d3a4a', '#7a2a22', '#243a2e', '#4a2a3a'][i];
  ctx.fillStyle = field;
  ctx.fillRect(ox + pad, oy + pad, TILE_W - 2 * pad, TILE_H - 2 * pad);
  ctx.strokeStyle = ink; ctx.lineWidth = 6;
  ctx.strokeRect(ox + pad + 10, oy + pad + 10, TILE_W - 2 * pad - 20, TILE_H - 2 * pad - 20);
  ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lines: Array<[string, string]> = [
    ['FOUR PAWS COAL & ICE', 'WE CARRY IT UP - CALL BEDFORD 4-0412'],
    ['PIGEON BRAND BREAD', 'BAKED THIS MORNING - ASK YOUR GROCER'],
    ['MADAME LULA\'S TONIC', 'FOR THE NERVES AND THE LANDLORD'],
    ['MURPHY & SON PIANOS', 'TUNED - MOVED - FORGIVEN'],
  ];
  ctx.font = '900 58px Impact, "Arial Black", sans-serif';
  ctx.fillText(lines[i][0], ox + TILE_W / 2, oy + 98, TILE_W - 60);
  ctx.font = '700 25px "Arial Black", Arial, sans-serif';
  ctx.fillText(lines[i][1], ox + TILE_W / 2, oy + 168, TILE_W - 54);
  ctx.fillRect(ox + 40, oy + 130, TILE_W - 80, 4);
  // fade: knock the paint out in patches, then lay the whole sign down to a ghost
  ctx.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 260; k++) {
    ctx.fillStyle = `rgba(0,0,0,${rng.range(0.2, 0.8)})`;
    const s = rng.range(2, 22);
    ctx.fillRect(ox + rng.range(0, TILE_W), oy + rng.range(0, TILE_H), s * rng.range(0.6, 3), s);
  }
  const g = ctx.createLinearGradient(ox, oy, ox, oy + TILE_H);
  g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = g;
  ctx.fillRect(ox, oy, TILE_W, TILE_H);
  ctx.restore();
}

function paintSoot(ctx: CanvasRenderingContext2D, ox: number, oy: number, rng: Rng): void {
  const pad = 4;
  const g = ctx.createLinearGradient(0, oy + pad, 0, oy + TILE_H - pad);
  g.addColorStop(0, 'rgba(14,12,10,0.62)'); g.addColorStop(0.35, 'rgba(14,12,10,0.3)'); g.addColorStop(1, 'rgba(14,12,10,0)');
  ctx.fillStyle = g;
  ctx.fillRect(ox + pad, oy + pad, TILE_W - 2 * pad, TILE_H - 2 * pad);
  // run-off streaks down from the roofline
  for (let k = 0; k < 46; k++) {
    const x = ox + rng.range(pad, TILE_W - pad), w = rng.range(2, 12), h = rng.range(60, 230);
    const sg = ctx.createLinearGradient(0, oy + pad, 0, oy + pad + h);
    sg.addColorStop(0, `rgba(10,9,8,${rng.range(0.15, 0.4)})`); sg.addColorStop(1, 'rgba(10,9,8,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(x, oy + pad, w, Math.min(h, TILE_H - 2 * pad));
  }
}

/** The single translucent decal material for ghost signs and soot, or null where there is no canvas (tests). */
export function wallDecalMaterial(lib: IMaterialLibrary): THREE.Material | null {
  if (decalCache.has(lib)) return decalCache.get(lib) ?? null;
  let mat: THREE.Material | null = null;
  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = ATLAS_W; canvas.height = ATLAS_H;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const rng = new Rng('party-wall-decals');
        ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);
        GHOSTS.forEach(([ox, oy], i) => paintGhost(ctx, ox, oy, i, rng));
        paintSoot(ctx, SOOT_TILE[0], SOOT_TILE[1], rng);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        mat = new THREE.MeshStandardMaterial({
          name: 'party-wall-decal', map: tex, transparent: true, depthWrite: false, roughness: 0.95, metalness: 0,
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        });
      }
    } catch { mat = null; }
  }
  decalCache.set(lib, mat);
  return mat;
}

/** uvRect [uMin, vMin, uMax, vMax] of a canvas pixel rect (canvas y runs down, v runs up). */
function atlasRect(px: number, py: number, pw: number, ph: number, inset = 0): [number, number, number, number] {
  return [(px + inset) / ATLAS_W, 1 - (py + ph - inset) / ATLAS_H, (px + pw - inset) / ATLAS_W, 1 - (py + inset) / ATLAS_H];
}

// ---------------------------------------------------------------------------------------------- party walls

export interface PartyWallOpts {
  W: number; D: number;
  /** the wall's lowest y worth dressing (slab / ground floor top) and the roof line */
  y0: number; topY: number;
  /** z of the facade plane (0, or -setback for a set-back brownstone) */
  zFront: number;
  /** corner lots: that side is a windowed facade wall, not a party wall */
  cornerSide: 'left' | 'right' | null;
}

/**
 * Dresses the two side walls of one lot, in the part that shows above a lower neighbour: soot gradient from the roofline,
 * and per wall either a faded painted-ad ghost sign, a few blind windows, both, or nothing. Decals are 2 cm proud of the wall.
 */
export function partyWallDetail(b: LotBatch, m: BuildingMats, look: LotLook, o: PartyWallOpts): void {
  const rng = look.rng;
  const decal = wallDecalMaterial(m.lib);
  const { W, D, y0, topY, zFront } = o;
  const height = topY - y0;
  const floorsUp = Math.max(1, Math.round(height / UPPER_STOREY));
  for (const side of ['left', 'right'] as const) {
    if (o.cornerSide === side) continue;
    const x = side === 'left' ? 0 : W;
    const nx = side === 'left' ? -1 : 1;
    const zA = -D + 0.05, zB = zFront - 0.05;
    const span = zB - zA;
    if (span < 3 || height < 5) continue;
    const roll = rng.next();
    const kind = roll < 0.3 ? 'ad' : roll < 0.52 ? 'blind' : roll < 0.6 ? 'both' : 'plain';
    // soot: the top 6 m of the wall under the roofline, one quad over the whole depth
    if (decal) {
      const sh = Math.min(6.5, height - 0.3);
      const u = side === 'left' ? [0, 0, span] as const : [0, 0, -span] as const;
      const org: [number, number, number] = [x + nx * 0.02, topY - sh, side === 'left' ? zA : zB];
      b.rect(decal, org, [u[0], u[1], u[2]], [0, sh, 0], { uvRect: atlasRect(SOOT_TILE[0], SOOT_TILE[1], TILE_W, TILE_H, 4) });
    }
    if ((kind === 'ad' || kind === 'both') && decal && span > 7) {
      const w = Math.min(5.4, span - 2.5), h = w / 2;
      const drop = rng.chance(0.4) ? UPPER_STOREY : 0;
      const yTop = topY - 0.9 - drop;
      if (yTop - h > y0 + 0.4) {
        const zc = -(kind === 'both' ? 1.2 + w / 2 : rng.range(1.4 + w / 2, Math.max(1.4 + w / 2, Math.min(span - 1 - w / 2, 7 + w / 2))));
        const g = GHOSTS[rng.int(0, 3)];
        const z0 = zFront + zc - w / 2, z1 = zFront + zc + w / 2;
        const u: [number, number, number] = side === 'left' ? [0, 0, z1 - z0] : [0, 0, -(z1 - z0)];
        b.rect(decal, [x + nx * 0.03, yTop - h, side === 'left' ? z0 : z1], u, [0, h, 0], { uvRect: atlasRect(g[0], g[1], TILE_W, TILE_H, 8) });
      }
    }
    if ((kind === 'blind' || kind === 'both') && span > 6) {
      // rows align with the real window rows; the columns run toward the back when a sign takes the front
      const cols = rng.int(2, 3), rows = Math.min(rng.chance(0.25) ? 2 : 1, floorsUp);
      const zStart = kind === 'both' ? -(1.2 + 5.4 + 1.8) : -(rng.range(2.2, 3.4));
      const stepZ = 2.5;
      for (let r = 0; r < rows; r++) {
        const sill = topY - UPPER_STOREY * (r + 1) + 0.6 - 0.0;
        if (sill < y0 + 0.5) continue;
        for (let c = 0; c < cols; c++) {
          const zc = zFront + zStart - c * stepZ;
          if (zc - 0.6 < zA + 0.3) continue;
          blindWindow(b, m, look, x, nx, sill, zc);
        }
      }
    }
  }
}

/** A bricked-up window: infill brick panel, stone sill and lintel, on a side wall facing nx. */
function blindWindow(b: LotBatch, m: BuildingMats, look: LotLook, x: number, nx: number, sill: number, zc: number): void {
  const w = 1.1, h = 1.75;
  const xo = x + nx * 0.015;
  const u: [number, number, number] = nx < 0 ? [0, 0, w] : [0, 0, -w];
  b.rect(look.infill, [xo, sill, nx < 0 ? zc - w / 2 : zc + w / 2], u, [0, h, 0], { ru: w / 3, rv: h / 3, hint: [nx, 0, 0] });
  // sill and lintel: only the faces that show (outward face and top)
  const x0 = nx < 0 ? x - 0.09 : x, x1 = nx < 0 ? x : x + 0.09;
  const fa = nx < 0 ? 'lu' : 'ru';
  b.box(m.limestone, x0, sill - 0.09, zc - w / 2 - 0.1, x1, sill, zc + w / 2 + 0.1, fa);
  b.box(m.limestone, x0, sill + h, zc - w / 2 - 0.1, x1, sill + h + 0.14, zc + w / 2 + 0.1, fa);
}

// ---------------------------------------------------------------------------------------------- roofs

export interface RoofDetailOpts {
  x0: number; x1: number; zBack: number; zFront: number; y: number;
  /** parapet height of the roof (details stay clear of the front parapet) */
  ph?: number;
}

/**
 * Roof extras that differ from lot to lot: tar patches in a second variant, vent stacks, a condenser box, a roof hatch, a
 * TV mast. They live in the band between the rear clutter and the front parapet so they do not collide with the chimney,
 * skylight, bulkhead or the water tank (which sit within ~5.5 m of the back wall or on the centre line at the back).
 */
export function roofDetails(b: LotBatch, m: BuildingMats, look: LotLook, o: RoofDetailOpts): void {
  const rng = look.rng;
  const { x0, x1, zBack, zFront, y } = o;
  const w = x1 - x0, depth = zFront - zBack;
  if (w < 2.5 || depth < 8) return;
  // tar patches (a lighter or darker second variant), flat, a hair above the roof plate
  const patches = rng.int(0, 3);
  for (let i = 0; i < patches; i++) {
    const pw = rng.range(1.2, Math.min(3.6, w - 0.6)), pd = rng.range(1.2, 3.4);
    const px = x0 + 0.3 + rng.next() * Math.max(0, w - 0.6 - pw);
    const pz = zBack + 0.5 + rng.next() * Math.max(0, depth - 1.0 - pd);
    b.rect(look.roofPatch, [px, y + 0.022, pz + pd], [pw, 0, 0], [0, 0, -pd], { ru: pw / 3, rv: pd / 3 });
  }
  const zNear = zBack + 5.7, zFar = zFront - 1.6;
  if (zFar - zNear < 1.5) return;
  const pickZ = (margin = 0.4): number => zNear + margin + rng.next() * Math.max(0, zFar - zNear - 2 * margin);
  const pickX = (half: number): number => x0 + half + 0.3 + rng.next() * Math.max(0, w - 2 * half - 0.6);
  const used: Array<[number, number, number]> = [];
  const free = (x: number, z: number, r: number): boolean => used.every(([ux, uz, ur]) => Math.hypot(ux - x, uz - z) > ur + r + 0.3);
  const place = (half: number, build: (x: number, z: number) => void): void => {
    for (let k = 0; k < 6; k++) {
      const x = pickX(half), z = pickZ(half);
      if (!free(x, z, half)) continue;
      used.push([x, z, half]);
      build(x, z);
      return;
    }
  };
  // vent stacks: capped pipes of different heights
  const nv = rng.int(0, 2);
  for (let i = 0; i < nv; i++) {
    const h = rng.range(0.55, 1.35), r = rng.range(0.07, 0.12);
    place(0.2, (x, z) => {
      b.cyl(m.metal, x, y, y + h, z, r, 4);
      b.box(m.metal, x - r * 1.6, y + h, z - r * 1.6, x + r * 1.6, y + h + 0.05, z + r * 1.6, 'u');
    });
  }
  // condenser / fan housing
  if (rng.chance(0.3)) {
    place(0.7, (x, z) => {
      b.box(m.metal, x - 0.6, y, z - 0.45, x + 0.6, y + 0.8, z + 0.45, 'rlufb');
      b.box(m.metal, x - 0.42, y + 0.8, z - 0.32, x + 0.42, y + 0.88, z + 0.32, 'u');
    });
  }
  // roof hatch to the stairs
  if (rng.chance(0.3)) {
    place(0.6, (x, z) => {
      b.box(look.infill, x - 0.55, y, z - 0.5, x + 0.55, y + 0.95, z + 0.5, 'rlfb');
      b.box(m.metal, x - 0.62, y + 0.95, z - 0.56, x + 0.62, y + 1.03, z + 0.56, 'u');
    });
  }
  // TV mast with a few cross elements
  if (rng.chance(0.3)) {
    place(0.3, (x, z) => {
      const h = rng.range(3.2, 5.4);
      b.bar(m.metal, [x, y, z], [x, y + h, z], 0.05);
      for (let k = 0; k < 2; k++) {
        const yy = y + h - 0.2 - k * 0.45, half = 0.62 - k * 0.2;
        b.bar(m.metal, [x - half, yy, z], [x + half, yy, z], 0.035);
      }
    });
  }
}
