import './map.css';
import type { Vec2 } from '@/core/Math2';
import type { GridModel, Lot, PoiDef } from '@/world/types';
import { NAV_TARGETS } from '@/game/missions/NavTargets';
import { getWaypoint, onWaypointChange, setWaypoint } from '@/game/missions/Waypoint';
import { releasePointerLock, setPanelClass } from './panelKeys';

/** A fixed place on the map: HOME, a venue (WAX DELI) or a shop. */
export interface MapPlace { id: string; kind: 'home' | 'venue' | 'shop'; label: string; x: number; z: number; color?: string }
/** A mission marker (same shape as MissionMarker, so `missions.markers` can be passed straight in). */
export interface MapMarker { x: number; z: number; color: string; kind?: string; label?: string }

const BG = '#0d1117';
const BLOCK = '#1b232e';
const ROAD = '#c9ced8';
const HALO = 'rgba(10, 12, 18, 0.9)';
const GOLD = '#f5c542';
const HOME_GREEN = '#7cd6a0';
const WAYPOINT_BLUE = '#38bdf8';
const MAX_SCALE = 6;
const TAP_MOVE_PX = 8;
const TAP_MS = 600;
/** Screen px between repeated street names along a long street. */
const LABEL_SPACING = 280;

/** Pure view transform: world metres <-> screen px, with zoom about a point. North is up (-z). */
export class MapView {
  cx = 0; cz = 0; scale = 0.3; w = 390; h = 844;
  minScale = 0.1;

  /** Fits the bounds (plus margin metres) in the viewport. `reserveTop/Bottom` leave room for the toolbars. */
  fit(b: { minX: number; maxX: number; minZ: number; maxZ: number }, margin = 40, reserveTop = 0, reserveBottom = 0): void {
    const bw = b.maxX - b.minX + margin * 2, bh = b.maxZ - b.minZ + margin * 2;
    const availH = Math.max(50, this.h - reserveTop - reserveBottom);
    this.scale = Math.min(this.w / bw, availH / bh);
    this.minScale = this.scale * 0.6;
    this.cx = (b.minX + b.maxX) / 2;
    this.cz = (b.minZ + b.maxZ) / 2 - (reserveTop - reserveBottom) / 2 / this.scale;
  }
  toScreen(x: number, z: number): { x: number; y: number } { return { x: this.w / 2 + (x - this.cx) * this.scale, y: this.h / 2 + (z - this.cz) * this.scale }; }
  toWorld(sx: number, sy: number): Vec2 { return { x: this.cx + (sx - this.w / 2) / this.scale, z: this.cz + (sy - this.h / 2) / this.scale }; }
  /** Multiplies the zoom by `k`, keeping the world point under (sx, sy) fixed. */
  zoomAt(sx: number, sy: number, k: number): void {
    const before = this.toWorld(sx, sy);
    this.scale = Math.min(MAX_SCALE, Math.max(this.minScale, this.scale * k));
    this.cx = before.x - (sx - this.w / 2) / this.scale;
    this.cz = before.z - (sy - this.h / 2) / this.scale;
  }
  panPx(dx: number, dy: number): void { this.cx -= dx / this.scale; this.cz -= dy / this.scale; }
}

const short = (s: string, n = 22): string => {
  const t = s.split('·')[0].trim();
  const cased = t === t.toUpperCase() ? t.toLowerCase().replace(/(^|[\s&-])([a-z])/g, (_m, a: string, c: string) => a + c.toUpperCase()) : t;
  return cased.length > n ? `${cased.slice(0, n - 1)}…` : cased;
};

/** HOME and the deli (the nav targets). */
export function navPlaces(): MapPlace[] {
  return NAV_TARGETS.map((t) => ({ id: `nav:${t.id}`, kind: t.id === 'home' ? 'home' : 'venue', label: t.label, x: t.x, z: t.z }));
}

/** Shops from the raw POI list (the original grid). */
export function placesFromPois(grid: GridModel, pois: readonly PoiDef[]): MapPlace[] {
  const out: MapPlace[] = [];
  for (const p of pois) {
    try {
      const f = grid.blockById(p.block).faces.find((fc) => fc.side === p.face);
      if (!f) continue;
      out.push({ id: p.id, kind: 'shop', label: short(p.sign), x: f.a.x + (f.b.x - f.a.x) * p.t, z: f.a.z + (f.b.z - f.a.z) * p.t, color: p.awningColor });
    } catch { /* unknown block */ }
  }
  return out;
}

/** Shops and venues from the built lots, which include the Stage 9 east expansion. */
export function placesFromLots(lots: readonly Pick<Lot, 'poi' | 'frontA' | 'frontB'>[]): MapPlace[] {
  const out: MapPlace[] = [];
  for (const l of lots) if (l.poi) out.push({ id: l.poi.id, kind: 'shop', label: short(l.poi.sign), x: (l.frontA.x + l.frontB.x) / 2, z: (l.frontA.z + l.frontB.z) / 2, color: l.poi.awningColor });
  return out;
}

export interface MapScreenOptions {
  /** HOME, venues, shops. Default: HOME and the deli only. */
  places?: readonly MapPlace[];
  /** Called when the player taps the map. Default: `setWaypoint` (the shared store MissionHud's pointer reads). */
  onWaypoint?: (p: Vec2, label: string) => void;
}

/**
 * Full-screen map: the whole grid (every street segment, so the Stage 9 east expansion is included), street names, you
 * with your heading, HOME, mission markers, shops and venues. Drag or one finger pans, wheel or pinch zooms, a tap sets
 * the waypoint. A MAP button (always visible) and the M key toggle it. Like the phone, it does not pause the simulation;
 * it only covers the screen and swallows its own keys.
 */
export class MapScreen {
  readonly button: HTMLButtonElement;
  readonly root: HTMLElement;
  readonly view = new MapView();
  /** Called right before the map opens (close the phone here). */
  onOpen: (() => void) | null = null;
  onClose: (() => void) | null = null;
  private readonly doc: Document;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly statusEl: HTMLElement;
  private readonly clearBtn: HTMLButtonElement;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private readonly streetExtent = new Map<string, { min: number; max: number }>();
  private places: readonly MapPlace[];
  private markers: readonly MapMarker[] = [];
  private player: Vec2 = { x: 0, z: 0 };
  private heading = 0;
  private clock = 0;
  private opened = false;
  private fitted = false;
  private tap: { x: number; y: number; t: number; moved: boolean } | null = null;
  private pinch: { dist: number } | null = null;
  private readonly offWaypoint: () => void;
  private readonly keyHandler = (e: KeyboardEvent): void => this.onKey(e);
  private readonly openKey = (e: KeyboardEvent): void => this.onOpenKey(e);
  private readonly onResize = (): void => { if (this.opened) this.layout(); };

  constructor(parent: HTMLElement, private readonly grid: GridModel, private readonly opts: MapScreenOptions = {}) {
    this.doc = parent.ownerDocument;
    this.places = opts.places ?? navPlaces();
    for (const seg of grid.segments) {
      const s = grid.streetById(seg.streetId);
      const lo = s.axis === 'ew' ? Math.min(seg.a.x, seg.b.x) : Math.min(seg.a.z, seg.b.z);
      const hi = s.axis === 'ew' ? Math.max(seg.a.x, seg.b.x) : Math.max(seg.a.z, seg.b.z);
      const e = this.streetExtent.get(s.id);
      if (e) { e.min = Math.min(e.min, lo); e.max = Math.max(e.max, hi); } else this.streetExtent.set(s.id, { min: lo, max: hi });
    }

    this.button = this.mk('button', 'map-button') as HTMLButtonElement;
    this.button.type = 'button';
    this.button.setAttribute('aria-label', 'Map (M)');
    this.button.textContent = 'MAP';
    const press = (e: Event): void => { e.preventDefault(); e.stopPropagation(); this.toggle(); };
    this.button.addEventListener('click', press);
    this.button.addEventListener('touchstart', press, { passive: false });

    this.root = this.mk('div', 'map-root');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Map');
    this.root.setAttribute('data-ui-modal', '');
    this.canvas = this.mk('canvas', 'map-canvas') as HTMLCanvasElement;
    try { this.ctx = this.canvas.getContext('2d'); } catch { this.ctx = null; }

    const top = this.mk('div', 'map-top');
    const title = this.mk('b', 'map-title'); title.textContent = 'MAP';
    this.statusEl = this.mk('span', 'map-status');
    this.statusEl.setAttribute('role', 'status');
    const close = this.btn('map-close', 'X', 'Close map', () => this.close());
    top.append(title, this.statusEl, close);

    const zoom = this.mk('div', 'map-zoom');
    zoom.append(this.btn('map-zin', '+', 'Zoom in', () => this.zoomCentre(1.5)), this.btn('map-zout', '−', 'Zoom out', () => this.zoomCentre(1 / 1.5)));

    const bottom = this.mk('div', 'map-bottom');
    const me = this.btn('map-me', 'Find me', 'Centre the map on you', () => this.centreOnPlayer());
    this.clearBtn = this.btn('map-clear', 'Clear pin', 'Remove the waypoint', () => setWaypoint(null));
    const hint = this.mk('span', 'map-hint');
    hint.textContent = 'Drag to pan, pinch or wheel to zoom, tap to set a waypoint';
    bottom.append(me, this.clearBtn, hint);

    this.root.append(this.canvas, top, zoom, bottom);
    parent.append(this.button, this.root);

    this.canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onMove(e));
    const up = (e: PointerEvent): void => this.onUp(e);
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', (e) => { this.pointers.delete(e.pointerId); this.tap = null; this.pinch = null; });
    this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); const r = this.canvas.getBoundingClientRect(); this.view.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    this.doc.addEventListener('keydown', this.openKey);
    this.doc.defaultView?.addEventListener('resize', this.onResize);
    this.offWaypoint = onWaypointChange(() => this.syncStatus());
    this.syncStatus();
  }

  get isOpen(): boolean { return this.opened; }

  open(): void {
    if (this.opened) return;
    this.onOpen?.();
    this.opened = true;
    this.root.hidden = false;
    this.button.classList.add('on');
    setPanelClass(this.doc, 'map-open', true);
    releasePointerLock(this.doc);
    this.doc.addEventListener('keydown', this.keyHandler, true);
    this.layout();
    this.fitted = true;
    this.fitAll(); // always opens on the whole grid; zoom or "Find me" from there
    this.syncStatus();
    this.draw();
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.root.hidden = true;
    this.button.classList.remove('on');
    this.pointers.clear(); this.tap = null; this.pinch = null;
    setPanelClass(this.doc, 'map-open', false);
    this.doc.removeEventListener('keydown', this.keyHandler, true);
    this.onClose?.();
  }

  toggle(): void { if (this.opened) this.close(); else this.open(); }

  setPlaces(places: readonly MapPlace[]): void { this.places = places; }

  /** Call every frame (cheap while closed). `markers` is `missions.markers`; heading 0 = north, clockwise (the player's). */
  update(player: Vec2, heading: number, markers: readonly MapMarker[] = [], dt = 1 / 60): void {
    this.player = player; this.heading = heading; this.markers = markers;
    if (!this.opened) return;
    this.clock += dt;
    this.syncStatus();
    this.draw();
  }

  /** Sets the waypoint at a screen position (a tap). Returns the world point. */
  tapAt(sx: number, sy: number): Vec2 {
    const p = this.view.toWorld(sx, sy);
    const near = this.places.find((pl) => Math.hypot(pl.x - p.x, pl.z - p.z) < Math.max(10, 18 / this.view.scale));
    const target = near ? { x: near.x, z: near.z } : p;
    const label = near ? near.label : this.grid.nearestStreet(p).signName;
    (this.opts.onWaypoint ?? ((q, l) => setWaypoint(q, l)))(target, label);
    return target;
  }

  dispose(): void {
    this.close();
    this.offWaypoint();
    this.doc.removeEventListener('keydown', this.openKey);
    this.doc.defaultView?.removeEventListener('resize', this.onResize);
    this.button.remove(); this.root.remove();
  }

  // ---------------------------------------------------------------- input

  private onOpenKey(e: KeyboardEvent): void {
    if (e.code !== 'KeyM' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || this.opened) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const cl = this.doc.body.classList;
    if (cl.contains('shop-open') || cl.contains('dj-open')) return;
    if (this.doc.querySelector('.menu-root:not([hidden])')) return;
    e.preventDefault();
    this.open();
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.opened || e.ctrlKey || e.metaKey || e.altKey) return;
    const step = 60;
    let used = true;
    if (e.code === 'KeyM' || e.code === 'Escape' || e.key === 'Escape') { if (!e.repeat) this.close(); }
    else if (e.code === 'KeyP') { /* swallowed: the phone does not open under the map */ }
    else if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') this.zoomCentre(1.25);
    else if (e.key === '-' || e.code === 'NumpadSubtract') this.zoomCentre(1 / 1.25);
    else if (e.code === 'ArrowLeft') this.view.panPx(step, 0);
    else if (e.code === 'ArrowRight') this.view.panPx(-step, 0);
    else if (e.code === 'ArrowUp') this.view.panPx(0, step);
    else if (e.code === 'ArrowDown') this.view.panPx(0, -step);
    else if (e.code === 'KeyC') this.centreOnPlayer();
    else used = false;
    if (used) { e.preventDefault(); e.stopPropagation(); }
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown(e: PointerEvent): void {
    e.preventDefault();
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* synthetic event / unsupported */ }
    if (this.pointers.size === 1) { this.tap = { x: p.x, y: p.y, t: Date.now(), moved: false }; this.pinch = null; }
    else if (this.pointers.size === 2) {
      this.tap = null;
      const [a, b] = [...this.pointers.values()];
      this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
    }
  }

  private onMove(e: PointerEvent): void {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 1) {
      if (this.tap && !this.tap.moved && Math.hypot(p.x - this.tap.x, p.y - this.tap.y) > TAP_MOVE_PX) this.tap.moved = true;
      if (this.tap?.moved || !this.tap) this.view.panPx(p.x - prev.x, p.y - prev.y);
    } else if (this.pointers.size === 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      this.view.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / this.pinch.dist);
      this.pinch.dist = dist;
      // the pinch midpoint also drags the map
      this.view.panPx((p.x - prev.x) / 2, (p.y - prev.y) / 2);
    }
  }

  private onUp(e: PointerEvent): void {
    const had = this.pointers.has(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (!had) return;
    const t = this.tap;
    this.tap = null;
    if (t && !t.moved && Date.now() - t.t < TAP_MS) this.tapAt(t.x, t.y);
  }

  // ---------------------------------------------------------------- view

  private layout(): void {
    const r = this.canvas.getBoundingClientRect();
    const w = r.width || this.doc.defaultView?.innerWidth || 390, h = r.height || this.doc.defaultView?.innerHeight || 844;
    const dpr = Math.min(2, this.doc.defaultView?.devicePixelRatio || 1);
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (this.canvas.width !== bw) this.canvas.width = bw;
    if (this.canvas.height !== bh) this.canvas.height = bh;
    const first = this.view.w !== w || this.view.h !== h;
    this.view.w = w; this.view.h = h;
    if (first && this.fitted) this.fitAll();
  }

  private fitAll(): void { this.view.fit(this.grid.bounds, 60, 56, 64); }

  private centreOnPlayer(): void {
    this.view.cx = this.player.x; this.view.cz = this.player.z;
    if (this.view.scale < 0.8) this.view.zoomAt(this.view.w / 2, this.view.h / 2, 0.8 / this.view.scale);
  }

  private zoomCentre(k: number): void { this.view.zoomAt(this.view.w / 2, this.view.h / 2, k); }

  private syncStatus(): void {
    const wp = getWaypoint();
    this.clearBtn.disabled = !wp;
    const text = wp ? `${wp.label}  ${Math.round(Math.hypot(wp.x - this.player.x, wp.z - this.player.z) / 5) * 5} m` : 'No waypoint';
    if (this.statusEl.textContent !== text) this.statusEl.textContent = text;
  }

  // ---------------------------------------------------------------- drawing

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const v = this.view;
    const dpr = this.canvas.width / (v.w || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, v.w, v.h);

    ctx.fillStyle = BLOCK;
    for (const b of this.grid.blocks) {
      ctx.beginPath();
      b.curb.forEach((pt, i) => { const s = v.toScreen(pt.x, pt.z); if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); });
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = ROAD; ctx.fillStyle = ROAD; ctx.lineCap = 'butt';
    for (const seg of this.grid.segments) {
      const a = v.toScreen(seg.a.x, seg.a.z), b = v.toScreen(seg.b.x, seg.b.z);
      ctx.lineWidth = Math.max(1.5, seg.width * v.scale);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (const it of this.grid.intersections) {
      const a = v.toScreen(it.center.x - it.halfX, it.center.z - it.halfZ);
      ctx.fillRect(a.x, a.y, Math.max(1.5, it.halfX * 2 * v.scale), Math.max(1.5, it.halfZ * 2 * v.scale));
    }

    this.drawStreetNames(ctx);
    this.drawPlaces(ctx);
    this.drawMarkers(ctx);
    this.drawWaypoint(ctx);
    this.drawPlayer(ctx);
  }

  private text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color = '#fff', size = 11): void {
    ctx.font = `700 ${size}px Arial, Helvetica, sans-serif`;
    ctx.lineJoin = 'round'; ctx.lineWidth = 3.5; ctx.strokeStyle = HALO; ctx.fillStyle = color;
    ctx.strokeText(s, x, y); ctx.fillText(s, x, y);
  }

  /** One name per ~280 px of the visible part of each street, so names stay readable at every zoom and pan. */
  private drawStreetNames(ctx: CanvasRenderingContext2D): void {
    const v = this.view;
    const tl = v.toWorld(0, 0), br = v.toWorld(v.w, v.h);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const s of this.grid.streets) {
      const ext = this.streetExtent.get(s.id);
      if (!ext) continue;
      const ew = s.axis === 'ew';
      const crossVis = ew ? s.offset >= tl.z - 20 && s.offset <= br.z + 20 : s.offset >= tl.x - 20 && s.offset <= br.x + 20;
      if (!crossVis) continue;
      const lo = Math.max(ext.min, ew ? tl.x : tl.z), hi = Math.min(ext.max, ew ? br.x : br.z);
      const lenPx = (hi - lo) * v.scale;
      const width = s.name.length * 6.4 + 10;
      if (lenPx < width) continue;
      const n = Math.max(1, Math.floor(lenPx / LABEL_SPACING));
      for (let i = 0; i < n; i++) {
        const along = lo + ((i + 0.5) / n) * (hi - lo);
        const p = ew ? v.toScreen(along, s.offset) : v.toScreen(s.offset, along);
        ctx.save();
        ctx.translate(p.x, p.y);
        if (!ew) ctx.rotate(-Math.PI / 2);
        this.text(ctx, s.name, 0, 0, s.class === 'avenue' ? '#ffffff' : '#e2e8f0', 11);
        ctx.restore();
      }
    }
  }

  private drawPlaces(ctx: CanvasRenderingContext2D): void {
    const v = this.view;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const labelShops = v.scale >= 0.9;
    for (const pl of this.places) {
      const p = v.toScreen(pl.x, pl.z);
      if (p.x < -30 || p.y < -30 || p.x > v.w + 30 || p.y > v.h + 30) continue;
      if (pl.kind === 'home') {
        const pulse = (this.clock * 1.2) % 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, 12 * (1 + pulse * 0.9), 0, Math.PI * 2);
        ctx.lineWidth = 2; ctx.strokeStyle = `rgba(124, 214, 160, ${(0.8 * (1 - pulse)).toFixed(3)})`; ctx.stroke();
        ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, Math.PI * 2); ctx.fillStyle = HALO; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = HOME_GREEN; ctx.stroke();
        ctx.fillStyle = HOME_GREEN;
        ctx.beginPath(); ctx.moveTo(p.x - 7, p.y - 1); ctx.lineTo(p.x, p.y - 8); ctx.lineTo(p.x + 7, p.y - 1); ctx.closePath(); ctx.fill();
        ctx.fillRect(p.x - 4.5, p.y - 1, 9, 7);
        this.text(ctx, 'HOME', p.x, p.y + 22, HOME_GREEN, 12);
      } else if (pl.kind === 'venue') {
        ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, Math.PI * 2); ctx.fillStyle = HALO; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = GOLD; ctx.stroke();
        this.text(ctx, pl.label.charAt(0), p.x, p.y + 0.5, GOLD, 13);
        this.text(ctx, pl.label, p.x, p.y + 22, GOLD, 11);
      } else {
        const r = 4.5;
        ctx.fillStyle = pl.color ?? '#9aa4b2';
        ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        ctx.lineWidth = 1.5; ctx.strokeStyle = HALO; ctx.strokeRect(p.x - r, p.y - r, r * 2, r * 2);
        if (labelShops) this.text(ctx, pl.label, p.x, p.y - 12, '#e5e9f0', 10);
      }
    }
  }

  private drawMarkers(ctx: CanvasRenderingContext2D): void {
    const v = this.view;
    const pulse = 0.5 + 0.5 * Math.sin(this.clock * Math.PI * 2 * 1.4);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const m of this.markers) {
      const p = v.toScreen(m.x, m.z);
      if (p.x < -20 || p.y < -20 || p.x > v.w + 20 || p.y > v.h + 20) continue;
      const giver = m.kind === 'giver';
      const color = giver ? GOLD : m.color;
      const r = giver ? 9 : 7;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.lineWidth = 5; ctx.strokeStyle = HALO; ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.lineWidth = 2.5; ctx.strokeStyle = color; ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.5 + (giver ? 1.5 * pulse : 0), 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      if (m.label) this.text(ctx, m.label, p.x, p.y - r - 8, color, 11);
    }
  }

  private drawWaypoint(ctx: CanvasRenderingContext2D): void {
    const wp = getWaypoint();
    if (!wp) return;
    const p = this.view.toScreen(wp.x, wp.z);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 8, p.y - 18); ctx.lineTo(p.x + 8, p.y - 18); ctx.closePath();
    ctx.fillStyle = WAYPOINT_BLUE; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = HALO; ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, p.y - 22, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, p.y - 22, 3, 0, Math.PI * 2); ctx.fillStyle = HALO; ctx.fill();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D): void {
    const p = this.view.toScreen(this.player.x, this.player.z);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
    ctx.rotate(this.heading); // heading 0 = north (up), clockwise
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, 9); ctx.lineTo(0, 5); ctx.lineTo(-8, 9); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 2; ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- DOM helpers

  private mk(tag: string, cls: string): HTMLElement {
    const el = this.doc.createElement(tag);
    el.className = cls;
    return el;
  }

  private btn(cls: string, text: string, label: string, fn: () => void): HTMLButtonElement {
    const b = this.mk('button', `map-btn ${cls}`) as HTMLButtonElement;
    b.type = 'button'; b.textContent = text; b.setAttribute('aria-label', label);
    b.addEventListener('click', fn);
    return b;
  }
}
