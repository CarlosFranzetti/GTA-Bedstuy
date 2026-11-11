import './map.css';
import type { Vec2 } from '@/core/Math2';
import type { GridModel, Lot, PoiDef } from '@/world/types';
import { NAV_TARGETS } from '@/game/missions/NavTargets';
import { getWaypoint, onWaypointChange, setWaypoint } from '@/game/missions/Waypoint';
import { createPointerRouter, type PointerRouter } from '@/game/missions/PointerRoute';
import { EL_X_EAST, EL_X_WEST, EL_Z, STATIONS } from '@/transit/ElLine';
import { releasePointerLock, setPanelClass } from './panelKeys';
import { MapView, type Rect } from './map/MapView';
import { MAP_COLORS as C, drawIcon, type IconKind } from './map/palette';
import { gridStreetSource, type MapStreetSource } from './map/streetSource';
import { decodeOverview, drawOverview, loadOverview, overviewLabels, type MapLabel, type OverviewData } from './overviewLayer';

export { MapView } from './map/MapView';
export type { MapStreetSource, MapStreet } from './map/streetSource';
export { gridStreetSource, roadNetStreetSource } from './map/streetSource';

/** A fixed place on the map: HOME, a venue (WAX DELI), a shop or an el station. */
export interface MapPlace { id: string; kind: 'home' | 'venue' | 'shop' | 'station'; label: string; x: number; z: number; color?: string }
/** A mission marker (same shape as MissionMarker, so `missions.markers` can be passed straight in). */
export interface MapMarker { x: number; z: number; color: string; kind?: string; label?: string }
/** Anything the cursor can hover or select: places, stations, mission markers, the waypoint and you. */
export interface MapBlip { id: string; kind: IconKind; label: string; x: number; z: number; color?: string; letter?: string; prio: number }

const TAP_MOVE_PX = 8;
const TAP_MS = 600;
const BLIP_HIT_PX = 17;
const KEY_PAN_PX_S = 560;
const PAD_PAN_PX_S = 760;
const INERTIA_DECAY = 5;
const SNAP_IDLE_S = 0.18;
const FOLLOW = 14;

const short = (s: string, n = 22): string => {
  const t = s.split('·')[0].trim();
  const cased = t === t.toUpperCase() ? t.toLowerCase().replace(/(^|[\s&-])([a-z])/g, (_m, a: string, c: string) => a + c.toUpperCase()) : t;
  return cased.length > n ? `${cased.slice(0, n - 1)}…` : cased;
};

/** HOME and the deli (the nav targets). */
export function navPlaces(): MapPlace[] {
  return NAV_TARGETS.map((t) => ({ id: `nav:${t.id}`, kind: t.id === 'home' ? 'home' : 'venue', label: t.label, x: t.x, z: t.z }));
}

/** The el stops (BKLYN TRANSIT) on their line. */
export function stationPlaces(): MapPlace[] {
  return STATIONS.map((s) => ({ id: `station:${s.id}`, kind: 'station', label: s.name, x: s.x, z: EL_Z }));
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
  /** HOME, venues, shops. Default: HOME and the deli only. El stations are added when none are given. */
  places?: readonly MapPlace[];
  /** Called when the player sets a waypoint on the map. Default: `setWaypoint` (the shared store MissionHud's pointer reads). */
  onWaypoint?: (p: Vec2, label: string) => void;
  /** Built streets. Default: the grid. Pass `roadNetStreetSource(net)` for `?map=real`. */
  streets?: MapStreetSource;
  /** Brooklyn overview: decoded data, null for none, or a loader. Default: lazy fetch of public/data/brooklyn-overview.json. */
  overview?: OverviewData | null | (() => Promise<OverviewData | null>);
  /** Sidewalk router for the waypoint route line. Default: a private one built on the grid. */
  router?: PointerRouter;
}

type Cand = MapLabel;

/**
 * Full-screen map in the GTA idiom (original art): opens centred on the built area and north up, drag / arrow keys / stick
 * pan with inertia, wheel / pinch / +- / triggers zoom between snap levels. Zoomed out past the fit level the rest of Brooklyn
 * appears as a dark low-detail silhouette. Hover or select a blip for its name, click / tap / A sets the waypoint, with a route
 * along the sidewalks. Like the phone it does not pause the simulation; it only covers the screen and swallows its own keys.
 */
export class MapScreen {
  readonly button: HTMLButtonElement;
  readonly root: HTMLElement;
  readonly view = new MapView();
  /** Called right before the map opens (close the phone here). */
  onOpen: (() => void) | null = null;
  onClose: (() => void) | null = null;
  readonly source: MapStreetSource;
  private readonly doc: Document;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly cache: HTMLCanvasElement;
  private readonly cctx: CanvasRenderingContext2D | null;
  private readonly statusEl: HTMLElement;
  private readonly streetEl: HTMLElement;
  private readonly cardEl: HTMLElement;
  private readonly cardText: HTMLElement;
  private readonly cardBtn: HTMLButtonElement;
  private readonly zlvlEl: HTMLElement;
  private readonly legendEl: HTMLElement;
  private readonly legendBtn: HTMLButtonElement;
  private topEl: HTMLElement | null = null;
  private bottomEl: HTMLElement | null = null;
  private readonly clearBtn: HTMLButtonElement;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private readonly router: PointerRouter;
  private places: readonly MapPlace[];
  private markers: readonly MapMarker[] = [];
  private player: Vec2 = { x: 0, z: 0 };
  private heading = 0;
  private clock = 0;
  private opened = false;
  private atFit = true;
  private overview: OverviewData | null = null;
  private overviewAsked = false;
  private tap: { x: number; y: number; t: number; moved: boolean } | null = null;
  private pinch: { dist: number } | null = null;
  private vel = { x: 0, y: 0 };
  private lastMove = 0;
  private dragging = false;
  private zoomTo: { scale: number; sx: number; sy: number } | null = null;
  private idle = 0;
  private cursor: { x: number; y: number; mouse: boolean } = { x: 195, y: 422, mouse: false };
  private hover: MapBlip | null = null;
  private selected: MapBlip | null = null;
  private legendOn: boolean | null = null;
  private keysDown = new Set<string>();
  private padPrev: boolean[] = [];
  private route: Vec2[] = [];
  private routeKey = '';
  private routeLen = 0;
  private staticSig = '';
  private labelSig = '';
  private streetCands: Cand[] = [];
  private drawAcc = 0;
  private lastSig = '';
  private readonly offWaypoint: () => void;
  private resizeObs: ResizeObserver | null = null;
  private readonly keyHandler = (e: KeyboardEvent): void => this.onKey(e);
  private readonly keyUp = (e: KeyboardEvent): void => { this.keysDown.delete(e.code); };
  private readonly openKey = (e: KeyboardEvent): void => this.onOpenKey(e);
  private readonly onResize = (): void => { if (this.opened) this.layout(); };

  constructor(parent: HTMLElement, private readonly grid: GridModel, private readonly opts: MapScreenOptions = {}) {
    this.doc = parent.ownerDocument;
    this.source = opts.streets ?? gridStreetSource(grid);
    const given = opts.places ?? navPlaces();
    this.places = given.some((p) => p.kind === 'station') ? given : [...given, ...stationPlaces()];
    this.router = opts.router ?? createPointerRouter(grid);
    if (opts.overview !== undefined && typeof opts.overview !== 'function') this.overview = opts.overview;

    this.button = this.mk('button', 'map-button') as HTMLButtonElement;
    this.button.type = 'button';
    this.button.setAttribute('aria-label', 'Map (M)');
    this.button.insertAdjacentHTML('afterbegin', '<span class="hb-lbl">MAP</span><svg class="hb-ico" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 6l6-2.5 6 2.5 6-2.5v14.5l-6 2.5-6-2.5-6 2.5z M9 3.5v14.5 M15 6v14.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>');
    const press = (e: Event): void => { e.preventDefault(); e.stopPropagation(); this.toggle(); };
    this.button.addEventListener('click', press);
    this.button.addEventListener('touchstart', press, { passive: false });

    this.root = this.mk('div', 'map-root');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Map');
    this.root.setAttribute('data-ui-modal', '');
    this.canvas = this.mk('canvas', 'map-canvas') as HTMLCanvasElement;
    this.cache = this.doc.createElement('canvas');
    try { this.ctx = this.canvas.getContext('2d'); } catch { this.ctx = null; }
    try { this.cctx = this.cache.getContext('2d'); } catch { this.cctx = null; }

    const top = this.mk('div', 'map-top');
    const title = this.mk('b', 'map-title'); title.textContent = 'MAP';
    this.statusEl = this.mk('span', 'map-status');
    this.statusEl.setAttribute('role', 'status');
    const close = this.btn('map-close', 'X', 'Close map', () => this.close());
    top.append(title, this.statusEl, close);

    this.streetEl = this.mk('div', 'map-street');
    this.cardEl = this.mk('div', 'map-card'); this.cardEl.hidden = true;
    this.cardText = this.mk('span', 'map-card-text');
    this.cardBtn = this.btn('map-cardbtn', 'Set waypoint', 'Set or clear the waypoint here', () => this.cardAction());
    this.cardEl.append(this.cardText, this.cardBtn);

    const zoom = this.mk('div', 'map-zoom');
    this.zlvlEl = this.mk('span', 'map-zlvl');
    zoom.append(this.btn('map-zin', '+', 'Zoom in', () => this.stepZoom(1)), this.zlvlEl, this.btn('map-zout', '−', 'Zoom out', () => this.stepZoom(-1)));

    const bottom = this.mk('div', 'map-bottom');
    this.legendEl = this.mk('div', 'map-legend'); this.legendEl.hidden = true;
    const rows: Array<[IconKind, string, string?]> = [['player', 'You'], ['home', 'HOME'], ['giver', 'Mission offer', 'M'], ['goal', 'Mission goal'], ['venue', 'Venue', 'W'], ['shop', 'Shop'], ['station', 'El station'], ['waypoint', 'Waypoint']];
    for (const [kind, text, letter] of rows) {
      const li = this.mk('span', 'map-key');
      const cv = this.doc.createElement('canvas'); cv.width = 56; cv.height = 56; cv.className = 'map-sw';
      try { const g = cv.getContext('2d'); if (g) drawIcon(g, kind, 28, kind === 'waypoint' ? 46 : 28, { k: 1.45, letter, pulse: kind === 'giver' ? 0.5 : undefined }); } catch { /* no canvas */ }
      li.append(cv, this.doc.createTextNode(text));
      this.legendEl.appendChild(li);
    }
    this.legendBtn = this.btn('map-legendbtn', 'Legend', 'Show or hide the legend', () => this.toggleLegend());
    const me = this.btn('map-me', 'Find me', 'Centre the map on you', () => this.centreOnPlayer());
    this.clearBtn = this.btn('map-clear', 'Clear pin', 'Remove the waypoint', () => setWaypoint(null));
    const hint = this.mk('span', 'map-hint');
    hint.textContent = 'Drag or arrows to pan, wheel / pinch / +- to zoom, click to set a waypoint';
    this.bottomEl = bottom; this.topEl = top;
    bottom.append(this.legendEl, this.legendBtn, me, this.clearBtn, hint);

    this.root.append(this.canvas, top, this.streetEl, this.cardEl, zoom, bottom);
    parent.append(this.button, this.root);

    this.canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.onUp(e));
    this.canvas.addEventListener('pointercancel', (e) => { this.pointers.delete(e.pointerId); this.tap = null; this.pinch = null; this.dragging = false; });
    this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.wheel(e); }, { passive: false });
    this.doc.addEventListener('keydown', this.openKey);
    this.doc.defaultView?.addEventListener('resize', this.onResize);
    if (typeof ResizeObserver !== 'undefined') { this.resizeObs = new ResizeObserver(() => { if (this.opened) this.layout(); }); this.resizeObs.observe(this.root); }
    this.offWaypoint = onWaypointChange(() => { this.routeKey = ''; this.syncStatus(); });
    this.syncStatus();
  }

  get isOpen(): boolean { return this.opened; }
  /** 0 at the fit zoom and above; 1 once zoomed well past it. The overview layer is only drawn while this is above 0. */
  get overviewAlpha(): number {
    if (!this.overview) return 0;
    const f = this.view.fitScale, s = this.view.scale;
    const t = Math.min(1, Math.max(0, (f * 0.97 - s) / (f * 0.12)));
    return t * t * (3 - 2 * t);
  }
  get hasOverview(): boolean { return this.overview !== null; }
  get hovered(): MapBlip | null { return this.hover; }
  get selectedBlip(): MapBlip | null { return this.selected; }
  get routePoints(): readonly Vec2[] { return this.route; }

  open(): void {
    if (this.opened) return;
    this.onOpen?.();
    this.opened = true;
    this.root.hidden = false;
    this.button.classList.add('on');
    setPanelClass(this.doc, 'map-open', true);
    releasePointerLock(this.doc);
    this.doc.addEventListener('keydown', this.keyHandler, true);
    this.doc.addEventListener('keyup', this.keyUp, true);
    this.view.far = this.farRect();
    this.layout(true);
    if (this.legendOn === null) this.setLegend(this.view.w >= 700 && this.view.h >= 520);
    this.requestOverview();
    this.selected = null; this.hover = null;
    this.syncStatus();
    this.draw(true);
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.root.hidden = true;
    this.button.classList.remove('on');
    this.pointers.clear(); this.tap = null; this.pinch = null; this.keysDown.clear(); this.vel = { x: 0, y: 0 }; this.dragging = false;
    setPanelClass(this.doc, 'map-open', false);
    this.doc.removeEventListener('keydown', this.keyHandler, true);
    this.doc.removeEventListener('keyup', this.keyUp, true);
    this.onClose?.();
  }

  toggle(): void { if (this.opened) this.close(); else this.open(); }

  setPlaces(places: readonly MapPlace[]): void { this.places = places.some((p) => p.kind === 'station') ? places : [...places, ...stationPlaces()]; }

  /** Call every frame (cheap while closed). `markers` is `missions.markers`; heading 0 = north (grid up), clockwise (the player's). */
  update(player: Vec2, heading: number, markers: readonly MapMarker[] = [], dt = 1 / 60): void {
    this.player = player; this.heading = heading; this.markers = markers;
    if (!this.opened) return;
    this.clock += dt;
    this.advance(dt);
    this.syncStatus();
    this.draw();
  }

  /** Advances inertia, key / stick pan and zoom easing by `dt` seconds. Public so tests can step time. */
  advance(dt: number): void {
    const v = this.view;
    let moved = false;
    // keyboard
    let kx = 0, ky = 0;
    const k = this.keysDown;
    if (k.has('ArrowLeft') || k.has('KeyA')) kx += 1;
    if (k.has('ArrowRight') || k.has('KeyD')) kx -= 1;
    if (k.has('ArrowUp') || k.has('KeyW')) ky += 1;
    if (k.has('ArrowDown') || k.has('KeyS')) ky -= 1;
    if (kx || ky) { this.panBy(kx * KEY_PAN_PX_S * dt, ky * KEY_PAN_PX_S * dt); this.vel = { x: 0, y: 0 }; this.useCentreCursor(); moved = true; }
    this.pollPad(dt);
    // inertia
    if (!this.dragging && !this.pinch && (Math.abs(this.vel.x) > 8 || Math.abs(this.vel.y) > 8)) {
      this.panBy(this.vel.x * dt, this.vel.y * dt);
      const f = Math.exp(-INERTIA_DECAY * dt);
      this.vel.x *= f; this.vel.y *= f;
      moved = true;
    } else if (!this.dragging) { this.vel.x = 0; this.vel.y = 0; }
    // zoom easing, and the snap after a wheel / pinch settles
    if (this.zoomTo) {
      const z = this.zoomTo;
      const ratio = z.scale / v.scale;
      if (Math.abs(Math.log(ratio)) < 0.004) { v.zoomAt(z.sx, z.sy, ratio); this.zoomTo = null; } else v.zoomAt(z.sx, z.sy, Math.pow(ratio, 1 - Math.exp(-FOLLOW * dt)));
      moved = true;
    } else if (this.idle > 0) {
      this.idle -= dt;
      if (this.idle <= 0 && !this.pinch) this.zoomTo = { scale: v.levels()[v.levelIndex()] ?? v.scale, sx: this.cursor.x, sy: this.cursor.y };
    }
    if (moved) this.atFit = false;
  }

  /** Sets the waypoint at a screen position (a tap or click). A blip within reach is selected and used; tapping the waypoint clears it. */
  tapAt(sx: number, sy: number): Vec2 {
    const blip = this.blipAt(sx, sy);
    if (blip && blip.kind === 'waypoint') { this.selected = null; setWaypoint(null); return { x: blip.x, z: blip.z }; }
    const p = blip ? { x: blip.x, z: blip.z } : this.view.toWorld(sx, sy);
    const label = blip ? blip.label : (this.source.nearest(p, 150)?.name ?? this.districtAt(p) ?? 'Waypoint');
    this.selected = blip;
    (this.opts.onWaypoint ?? ((q, l) => setWaypoint(q, l)))(p, label);
    return p;
  }

  /** The blip under a screen point (within `radius` px), nearest first, mission and waypoint blips winning ties. */
  blipAt(sx: number, sy: number, radius = BLIP_HIT_PX): MapBlip | null {
    let best: MapBlip | null = null, bd = Infinity;
    for (const b of this.blips()) {
      const s = this.view.toScreen(b.x, b.z);
      const hy = b.kind === 'waypoint' ? s.y - 18 : s.y;
      const d = Math.hypot(s.x - sx, hy - sy);
      if (d > radius) continue;
      const score = d - b.prio * 4;
      if (score < bd) { bd = score; best = b; }
    }
    return best;
  }

  /** Every blip on the map right now. */
  blips(): MapBlip[] {
    const out: MapBlip[] = [];
    const wp = getWaypoint();
    if (wp) out.push({ id: 'waypoint', kind: 'waypoint', label: wp.label, x: wp.x, z: wp.z, prio: 5 });
    this.markers.forEach((m, i) => {
      const giver = m.kind === 'giver';
      out.push({ id: `marker:${i}`, kind: giver ? 'giver' : 'goal', label: m.label ?? (giver ? 'Mission' : 'Goal'), x: m.x, z: m.z, color: m.color, letter: giver ? (m.label ?? 'M').charAt(0).toUpperCase() : undefined, prio: 4 });
    });
    for (const p of this.places) {
      out.push({ id: p.id, kind: p.kind === 'home' ? 'home' : p.kind === 'venue' ? 'venue' : p.kind === 'station' ? 'station' : 'shop', label: p.label, x: p.x, z: p.z, color: p.color, letter: p.label.charAt(0), prio: p.kind === 'shop' ? 1 : 3 });
    }
    out.push({ id: 'player', kind: 'player', label: 'You', x: this.player.x, z: this.player.z, prio: 0 });
    return out;
  }

  /** Eases the view onto the player, or onto the built area when the player is outside it. */
  centreOnPlayer(): void {
    const a = this.view.area;
    const inside = !a || (this.player.x >= a.minX && this.player.x <= a.maxX && this.player.z >= a.minZ && this.player.z <= a.maxZ);
    if (!inside) { this.fitAll(); return; }
    this.view.cx = this.player.x; this.view.cz = this.player.z;
    if (this.view.scale < this.view.fitScale * 1.9) this.view.zoomAt(this.view.ox, this.view.oy, this.view.fitScale * 2 / this.view.scale);
    else this.view.clampCentre();
    this.atFit = false;
  }

  /** One snap-level in (+1) or out (-1), about the screen centre of the map. */
  stepZoom(dir: 1 | -1): void {
    this.zoomTo = { scale: this.view.stepScale(dir), sx: this.view.ox, sy: this.view.oy };
    this.atFit = false;
  }

  toggleLegend(): void { this.setLegend(!(this.legendOn ?? false)); }

  dispose(): void {
    this.close();
    this.offWaypoint();
    this.resizeObs?.disconnect();
    this.doc.removeEventListener('keydown', this.openKey);
    this.doc.defaultView?.removeEventListener('resize', this.onResize);
    this.button.remove(); this.root.remove();
  }

  // ---------------------------------------------------------------- input

  private setLegend(on: boolean): void {
    this.legendOn = on;
    this.legendEl.hidden = !on;
    this.legendBtn.classList.toggle('on', on);
    this.legendBtn.setAttribute('aria-pressed', String(on));
  }

  private panBy(dx: number, dy: number): void { this.view.panPx(dx, dy); this.atFit = false; }

  private useCentreCursor(): void { this.cursor = { x: this.view.ox, y: this.view.oy, mouse: false }; }

  private cardAction(): void {
    const b = this.selected;
    if (!b) return;
    const wp = getWaypoint();
    if (wp && Math.hypot(wp.x - b.x, wp.z - b.z) < 1) setWaypoint(null);
    else (this.opts.onWaypoint ?? ((q, l) => setWaypoint(q, l)))({ x: b.x, z: b.z }, b.label);
  }

  private wheel(e: WheelEvent): void {
    const r = this.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const base = this.zoomTo?.scale ?? this.view.scale;
    const next = Math.min(this.view.maxScale, Math.max(this.view.minScale, base * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015))));
    this.zoomTo = { scale: next, sx, sy };
    this.idle = SNAP_IDLE_S + 0.2;
    this.atFit = false;
  }

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
    let used = true;
    if (e.code === 'KeyM' || e.code === 'Escape' || e.key === 'Escape') { if (!e.repeat) this.close(); }
    else if (e.code === 'KeyP') { /* swallowed: the phone does not open under the map */ }
    else if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') { if (!e.repeat) this.stepZoom(1); }
    else if (e.key === '-' || e.code === 'NumpadSubtract') { if (!e.repeat) this.stepZoom(-1); }
    else if (e.code.startsWith('Arrow')) { this.keysDown.add(e.code); }
    else if (e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD') { this.keysDown.add(e.code); used = false; } // the game keeps its movement keys
    else if (e.code === 'KeyC') this.centreOnPlayer();
    else if (e.code === 'KeyL') this.toggleLegend();
    else if ((e.code === 'Enter' || e.code === 'Space') && !(e.target as HTMLElement | null)?.closest?.('button')) { if (!e.repeat) this.tapAt(this.cursor.x, this.cursor.y); }
    else used = false;
    if (used) { e.preventDefault(); e.stopPropagation(); }
  }

  private pollPad(dt: number): void {
    const pads = (typeof navigator !== 'undefined' && navigator.getGamepads) ? navigator.getGamepads() : [];
    const pad = pads && Array.from(pads).find((p) => p && p.connected);
    if (!pad) return;
    const dz = (v: number): number => (Math.abs(v) < 0.2 ? 0 : v);
    const ax = dz(pad.axes[0] ?? 0), ay = dz(pad.axes[1] ?? 0);
    if (ax || ay) { this.panBy(-ax * PAD_PAN_PX_S * dt, -ay * PAD_PAN_PX_S * dt); this.vel = { x: 0, y: 0 }; this.useCentreCursor(); }
    const down = pad.buttons.map((b) => b.pressed);
    const edge = (i: number): boolean => !!down[i] && !this.padPrev[i];
    if (edge(7)) this.stepZoom(1);
    if (edge(6)) this.stepZoom(-1);
    if (edge(0)) this.tapAt(this.cursor.x, this.cursor.y);
    if (edge(2)) setWaypoint(null);
    if (edge(3)) this.toggleLegend();
    if (edge(9)) this.centreOnPlayer();
    this.padPrev = down;
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
    this.vel = { x: 0, y: 0 }; this.zoomTo = null; this.idle = 0;
    if (e.pointerType !== 'touch') this.cursor = { x: p.x, y: p.y, mouse: true };
    if (this.pointers.size === 1) { this.tap = { x: p.x, y: p.y, t: Date.now(), moved: false }; this.pinch = null; this.dragging = false; }
    else if (this.pointers.size === 2) {
      this.tap = null; this.dragging = false;
      const [a, b] = [...this.pointers.values()];
      this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
    }
  }

  private onMove(e: PointerEvent): void {
    const prev = this.pointers.get(e.pointerId);
    const p = this.local(e);
    if (!prev) { if (e.pointerType !== 'touch') this.cursor = { x: p.x, y: p.y, mouse: true }; return; } // mouse hover
    this.pointers.set(e.pointerId, p);
    if (e.pointerType !== 'touch') this.cursor = { x: p.x, y: p.y, mouse: true };
    if (this.pointers.size === 1) {
      if (this.tap && !this.tap.moved && Math.hypot(p.x - this.tap.x, p.y - this.tap.y) > TAP_MOVE_PX) this.tap.moved = true;
      if (this.tap?.moved || !this.tap) {
        const now = Date.now(), dt = Math.max(0.008, (now - this.lastMove) / 1000);
        this.lastMove = now;
        this.dragging = true;
        this.panBy(p.x - prev.x, p.y - prev.y);
        this.vel = { x: this.vel.x * 0.5 + ((p.x - prev.x) / dt) * 0.5, y: this.vel.y * 0.5 + ((p.y - prev.y) / dt) * 0.5 };
      }
    } else if (this.pointers.size === 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      this.view.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / this.pinch.dist);
      this.pinch.dist = dist;
      this.panBy((p.x - prev.x) / 2, (p.y - prev.y) / 2); // the pinch midpoint also drags the map
      this.atFit = false;
    }
  }

  private onUp(e: PointerEvent): void {
    const had = this.pointers.has(e.pointerId);
    this.pointers.delete(e.pointerId);
    const wasPinch = this.pinch !== null;
    if (this.pointers.size < 2) this.pinch = null;
    if (wasPinch && !this.pinch) this.zoomTo = { scale: this.view.levels()[this.view.levelIndex()] ?? this.view.scale, sx: this.view.ox, sy: this.view.oy }; // snap
    if (!had) return;
    this.dragging = false;
    if (Date.now() - this.lastMove > 90) this.vel = { x: 0, y: 0 };
    const t = this.tap;
    this.tap = null;
    if (t && !t.moved && Date.now() - t.t < TAP_MS) this.tapAt(t.x, t.y);
  }

  // ---------------------------------------------------------------- view

  private farRect(): Rect | null {
    const o = this.overview;
    if (!o) return null;
    return o.bounds;
  }

  private requestOverview(): void {
    if (this.overviewAsked || this.overview) return;
    this.overviewAsked = true;
    const o = this.opts.overview;
    const p = typeof o === 'function' ? o() : loadOverview();
    void p.then((d) => {
      if (!d) return;
      this.overview = d;
      this.view.setFar(this.farRect());
      this.staticSig = '';
      if (this.opened) this.draw(true);
    }).catch(() => { /* no overview: the map still works */ });
  }

  /** Lets a host hand in already-decoded overview JSON (hosted build, tests). */
  setOverview(d: OverviewData | { v: number }): void {
    this.overview = 'rings' in d ? d : decodeOverview(d as never);
    this.overviewAsked = true;
    this.view.setFar(this.farRect());
    this.staticSig = '';
  }

  private layout(force = false): void {
    const r = this.canvas.getBoundingClientRect();
    const w = r.width || this.doc.defaultView?.innerWidth || 390, h = r.height || this.doc.defaultView?.innerHeight || 844;
    const dpr = Math.min(3, this.doc.defaultView?.devicePixelRatio || 1);
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (this.canvas.width !== bw) this.canvas.width = bw;
    if (this.canvas.height !== bh) this.canvas.height = bh;
    if (this.cache.width !== bw) this.cache.width = bw;
    if (this.cache.height !== bh) this.cache.height = bh;
    const changed = this.view.w !== w || this.view.h !== h;
    this.view.w = w; this.view.h = h;
    if (force || (changed && this.atFit)) { this.fitAll(); return; }
    if (changed) {
      const keep = { cx: this.view.cx, cz: this.view.cz, scale: this.view.scale };
      this.fitAll();
      this.view.cx = keep.cx; this.view.cz = keep.cz; this.view.scale = Math.min(this.view.maxScale, Math.max(this.view.minScale, keep.scale));
      this.view.clampCentre(); this.atFit = false;
    }
    this.useCentreCursor();
    this.staticSig = '';
  }

  /** Re-fits the built area to the free part of the screen, north up. */
  fitAll(): void {
    const top = this.topEl?.getBoundingClientRect().height || 56, bot = this.bottomEl?.getBoundingClientRect().height || 64;
    this.view.far = this.farRect();
    this.view.fit(this.source.bounds, 40, top + 6, Math.min(bot, 64) + 6);
    this.atFit = true; this.zoomTo = null; this.vel = { x: 0, y: 0 };
    this.useCentreCursor();
    this.staticSig = '';
  }

  private districtAt(p: Vec2): string | null {
    const o = this.overview;
    if (!o) return null;
    let best: string | null = null, bd = 2500;
    for (const n of o.nta) { const d = Math.hypot(n.x - p.x, n.z - p.z); if (d < bd) { bd = d; best = n.name; } }
    return best;
  }

  private dist(x: number, z: number): number { return Math.hypot(x - this.player.x, z - this.player.z); }

  private fmtDist(m: number): string { return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 5) * 5} m`; }

  private syncStatus(): void {
    const wp = getWaypoint();
    this.clearBtn.disabled = !wp;
    const d = wp ? (this.route.length > 1 && this.routeLen > 0 ? this.routeLen : this.dist(wp.x, wp.z)) : 0;
    const text = wp ? `${wp.label}  ${this.fmtDist(d)}` : 'No waypoint';
    if (this.statusEl.textContent !== text) this.statusEl.textContent = text;
  }

  private updateRoute(): void {
    const wp = getWaypoint();
    if (!wp) { this.route = []; this.routeLen = 0; this.routeKey = ''; return; }
    const key = `${wp.x}|${wp.z}|${Math.round(this.player.x / 10)}|${Math.round(this.player.z / 10)}`;
    if (key === this.routeKey) return;
    this.routeKey = key;
    const to = { x: wp.x, z: wp.z };
    const pts: Vec2[] = [{ x: this.player.x, z: this.player.z }];
    try {
      let cur = pts[0];
      for (let i = 0; i < 60; i++) {
        const n = this.router(cur, to);
        const nx = { x: n.x, z: n.z };
        if (Math.hypot(nx.x - to.x, nx.z - to.z) < 1) break;
        if (Math.hypot(nx.x - cur.x, nx.z - cur.z) < 1) break;
        pts.push(nx); cur = nx;
      }
    } catch { /* straight line */ }
    pts.push(to);
    this.route = pts;
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    this.routeLen = len;
  }

  // ---------------------------------------------------------------- drawing

  private sig(): string {
    const v = this.view;
    return `${v.cx.toFixed(2)},${v.cz.toFixed(2)},${v.scale.toFixed(5)},${v.w},${v.h},${v.ox},${v.oy},${this.overview ? 1 : 0}`;
  }

  private draw(force = false): void {
    const ctx = this.ctx, cctx = this.cctx;
    this.updateRoute();
    this.syncStatus();
    const sig = this.sig();
    const changed = sig !== this.lastSig;
    this.lastSig = sig;
    this.drawAcc += 1 / 60;
    // hover / info DOM (cheap string compares)
    const cw = this.view.toWorld(this.cursor.x, this.cursor.y);
    const hv = this.blipAt(this.cursor.x, this.cursor.y);
    this.hover = hv;
    const street = hv ? hv.label : (this.source.nearest(cw, 40)?.name ?? '');
    if (this.streetEl.textContent !== street) { this.streetEl.textContent = street; this.streetEl.hidden = !street; }
    this.syncCard();
    const lvl = `${this.view.levelIndex() + 1}/${this.view.levels().length}`;
    if (this.zlvlEl.textContent !== lvl) this.zlvlEl.textContent = lvl;
    if (!ctx || !cctx) return;
    if (!force && !changed && this.drawAcc < 1 / 30) return;
    this.drawAcc = 0;
    const v = this.view;
    const dpr = this.canvas.width / (v.w || 1);
    if (sig !== this.staticSig || force) {
      this.staticSig = sig;
      cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.drawStatic(cctx);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.cache, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawOverlay(ctx);
  }

  private polyPath(ctx: CanvasRenderingContext2D, ring: readonly Vec2[], close = true): void {
    ring.forEach((pt, i) => { const s = this.view.toScreen(pt.x, pt.z); if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); });
    if (close) ctx.closePath();
  }

  /** Everything that only changes with the view: void, overview, built-area ground, blocks, streets, the el. */
  private drawStatic(ctx: CanvasRenderingContext2D): void {
    const v = this.view;
    ctx.fillStyle = '#0f1115'; ctx.fillRect(0, 0, v.w, v.h);
    if (this.overview) drawOverview(ctx, this.overview, v, this.overviewAlpha);
    const a = this.source.bounds;
    const area = [{ x: a.minX, z: a.minZ }, { x: a.maxX, z: a.minZ }, { x: a.maxX, z: a.maxZ }, { x: a.minX, z: a.maxZ }];
    ctx.beginPath(); this.polyPath(ctx, area); ctx.fillStyle = C.built; ctx.fill();
    ctx.fillStyle = C.block;
    ctx.beginPath();
    for (const ring of this.source.blocks()) this.polyPath(ctx, ring);
    ctx.fill();
    // streets: locals first, wider and lighter classes on top
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    const streets = this.source.streets();
    const order: Array<[string, string, number]> = [['street', C.street, 1.5], ['avenue', C.avenue, 2.4], ['arterial', C.avenue, 2.4], ['highway', C.avenue, 3]];
    for (const [cls, color, minPx] of order) {
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      for (const s of streets) {
        if (s.cls !== cls) continue;
        ctx.lineWidth = Math.max(minPx, s.width * v.scale * 0.9);
        ctx.beginPath(); this.polyPath(ctx, s.pts, false); ctx.stroke();
      }
    }
    // the el: a dashed line with ties
    const e0 = v.toScreen(EL_X_WEST, EL_Z), e1 = v.toScreen(EL_X_EAST, EL_Z);
    ctx.beginPath(); ctx.moveTo(e0.x, e0.y); ctx.lineTo(e1.x, e1.y);
    ctx.lineWidth = Math.max(2.2, 6 * v.scale); ctx.strokeStyle = C.halo; ctx.setLineDash([]); ctx.stroke();
    ctx.lineWidth = Math.max(1.4, 3 * v.scale); ctx.strokeStyle = C.el; ctx.setLineDash([Math.max(6, 14 * v.scale * 2), Math.max(4, 8 * v.scale * 2)]); ctx.stroke();
    ctx.setLineDash([]);
    // the playable area's edge
    ctx.beginPath(); this.polyPath(ctx, area);
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(245, 197, 66, 0.28)'; ctx.setLineDash([8, 6]); ctx.stroke(); ctx.setLineDash([]);
  }

  private rect(c: Cand): { l: number; t: number; r: number; b: number } {
    const ca = Math.abs(Math.cos(c.ang)), sa = Math.abs(Math.sin(c.ang));
    const hw = (c.w * ca + (c.size + 3) * sa) / 2 + 2, hh = (c.w * sa + (c.size + 3) * ca) / 2 + 2;
    return { l: c.x - hw, t: c.y - hh, r: c.x + hw, b: c.y + hh };
  }

  private text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, size: number, caps = false): void {
    ctx.font = `${caps ? 'small-caps ' : ''}700 ${size}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 3.5; ctx.strokeStyle = C.halo; ctx.fillStyle = color;
    ctx.strokeText(s, x, y); ctx.fillText(s, x, y);
  }

  /** Street-name candidates along the built streets, cached per view. */
  private computeStreetLabels(ctx: CanvasRenderingContext2D): Cand[] {
    const v = this.view;
    const out: Cand[] = [];
    if (this.overviewAlpha > 0.4) return out;
    const top = this.topEl?.getBoundingClientRect().height || 56, bot = this.bottomEl?.getBoundingClientRect().height || 64;
    const clip = { x0: 0, x1: v.w, y0: top, y1: v.h - Math.min(bot, 64) };
    ctx.font = '700 11px Arial, Helvetica, sans-serif';
    for (const s of this.source.streets()) {
      const w = (ctx.measureText(s.name).width || s.name.length * 6.2) + 4;
      const pri = s.cls === 'street' ? 2 : 1;
      for (let i = 0; i + 1 < s.pts.length; i++) {
        const A = v.toScreen(s.pts[i].x, s.pts[i].z), B = v.toScreen(s.pts[i + 1].x, s.pts[i + 1].z);
        const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy);
        if (len < w + 10) continue;
        // Liang-Barsky against the free viewport
        let t0 = 0, t1 = 1;
        const cl = (p: number, q: number): boolean => { if (p === 0) return q >= 0; const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } return true; };
        if (!(cl(-dx, A.x - clip.x0) && cl(dx, clip.x1 - A.x) && cl(-dy, A.y - clip.y0) && cl(dy, clip.y1 - A.y))) continue;
        const vis = (t1 - t0) * len;
        if (vis < w + 10) continue;
        let ang = Math.atan2(dy, dx);
        if (ang > Math.PI / 2) ang -= Math.PI; else if (ang <= -Math.PI / 2) ang += Math.PI;
        const mid = (t0 + t1) / 2;
        const spacing = 300 / len;
        const n = Math.floor((vis - w) / 300);
        for (let k = -n; k <= n; k++) {
          const t = mid + k * spacing;
          out.push({ text: s.name, x: A.x + dx * t, y: A.y + dy * t, ang, size: 11, color: '#fff', pri: pri + (k === 0 ? 0 : 0.5), w });
        }
      }
    }
    out.sort((a, b) => a.pri - b.pri || b.w - a.w);
    return out;
  }

  private drawOverlay(ctx: CanvasRenderingContext2D): void {
    const v = this.view;
    const pulse = 0.5 + 0.5 * Math.sin(this.clock * Math.PI * 2 * 1.4);
    const hpulse = (this.clock * 1.2) % 1;
    const blips = this.blips();
    const placed: Array<{ l: number; t: number; r: number; b: number }> = [];
    const hit = (b: { l: number; t: number; r: number; b: number }): boolean => placed.some((o) => b.l < o.r && b.r > o.l && b.t < o.b && b.b > o.t);

    // route line under the blips
    if (this.route.length > 1 && getWaypoint()) {
      ctx.beginPath(); this.polyPath(ctx, this.route, false);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.lineWidth = 7; ctx.strokeStyle = C.halo; ctx.stroke();
      ctx.lineWidth = 3.5; ctx.strokeStyle = C.waypoint; ctx.setLineDash([10, 7]); ctx.lineDashOffset = -this.clock * 18; ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }

    const zoom = v.scale;
    const touch = this.doc.querySelector('.hud-root.touch') !== null;
    const kk = touch ? 1.15 : 1;
    // 1. blip label slots first so nothing else sits on a blip name
    type Slot = { b: MapBlip; s: { x: number; y: number }; label: Cand | null };
    const slots: Slot[] = [];
    const wants = (b: MapBlip): boolean => {
      if (b === this.hover || b === this.selected) return true;
      if (b.kind === 'home' || b.kind === 'venue' || b.kind === 'giver' || b.kind === 'goal') return true;
      if (b.kind === 'station') return zoom >= v.fitScale * 0.9;
      if (b.kind === 'shop') return zoom >= 0.8;
      return false;
    };
    for (const b of blips) {
      const s = v.toScreen(b.x, b.z);
      if (s.x < -30 || s.y < -40 || s.x > v.w + 30 || s.y > v.h + 30) continue;
      if ((b.kind === 'shop' || b.kind === 'station' || b.kind === 'venue') && this.overviewAlpha > 0.5) continue; // no venue labels out there
      let label: Cand | null = null;
      if (wants(b) && b.kind !== 'player' && b.kind !== 'waypoint') {
        ctx.font = '700 11px Arial, Helvetica, sans-serif';
        const size = b.kind === 'shop' ? 10 : 11;
        const w = ctx.measureText(b.label).width + 4;
        const dy = b.kind === 'goal' || b.kind === 'giver' ? -17 : b.kind === 'shop' ? -12 : 22;
        label = { text: b.label, x: s.x, y: s.y + dy, ang: 0, size, color: b.kind === 'home' ? C.home : b.kind === 'venue' || b.kind === 'giver' ? C.gold : b.kind === 'goal' ? (b.color ?? C.goal) : '#e5e9f0', pri: 0, w };
        const required = b.kind !== 'shop' && b.kind !== 'station';
        let r = this.rect(label);
        if (hit(r)) {
          const step = size + 3;
          const alt = [-1, 1, -2, 2, -3, 3].map((k) => ({ ...label!, y: label!.y + k * step })).find((c) => !hit(this.rect(c)));
          if (alt) { label = alt; r = this.rect(alt); } else if (!required) label = null;
        }
        if (label) placed.push(this.rect(label));
      }
      placed.push({ l: s.x - 12, t: s.y - 12, r: s.x + 12, b: s.y + 12 });
      slots.push({ b, s, label });
    }
    // 2. overview labels, then street names, skipping collisions
    const measure = (t: string, size: number): number => { ctx.font = `700 ${size}px Arial, sans-serif`; return ctx.measureText(t).width; };
    const lsig = this.staticSig;
    if (lsig !== this.labelSig) { this.labelSig = lsig; this.streetCands = this.computeStreetLabels(ctx); }
    const cands: Cand[] = [...(this.overview && this.overviewAlpha > 0.35 ? overviewLabels(this.overview, v, measure) : []).sort((a, b) => a.pri - b.pri), ...this.streetCands];
    for (const c of cands) {
      const r = this.rect(c);
      if (r.r < 0 || r.b < 0 || r.l > v.w || r.t > v.h || hit(r)) continue;
      placed.push(r);
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.ang);
      this.text(ctx, c.text, 0, 0, c.color, c.size, c.caps);
      ctx.restore();
    }
    // 3. blips and their names on top (low priority first)
    slots.sort((a, b) => a.b.prio - b.b.prio);
    for (const { b, s, label } of slots) {
      const sel = b === this.selected || b === this.hover;
      if (b.kind === 'player') continue;
      drawIcon(ctx, b.kind, s.x, s.y, {
        k: kk, color: b.kind === 'goal' ? b.color : b.kind === 'shop' ? b.color : undefined, letter: b.letter,
        pulse: b.kind === 'home' ? hpulse : pulse, selected: sel && b.kind !== 'shop',
      });
      if (label) this.text(ctx, label.text, label.x, label.y, label.color, label.size);
    }
    // you, last
    const ps = v.toScreen(this.player.x, this.player.z);
    drawIcon(ctx, 'player', ps.x, ps.y, { k: kk, angle: this.heading + v.ang });
    // the cursor
    this.drawCursor(ctx);
    this.drawCompass(ctx);
    this.drawScaleBar(ctx);
  }

  private drawCursor(ctx: CanvasRenderingContext2D): void {
    const { x, y } = this.cursor;
    if (this.pointers.size > 1) return;
    ctx.save();
    ctx.lineWidth = 3; ctx.strokeStyle = C.halo;
    const arms = (): void => { ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x - 5, y); ctx.moveTo(x + 5, y); ctx.lineTo(x + 14, y); ctx.moveTo(x, y - 14); ctx.lineTo(x, y - 5); ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 14); };
    arms(); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; arms(); ctx.stroke();
    ctx.restore();
  }

  /** North is always up; the compass says so (the game's own axes are turned 8.6 degrees from it, see MapView). */
  private drawCompass(ctx: CanvasRenderingContext2D): void {
    const top = this.topEl?.getBoundingClientRect().height || 56;
    const cx = 28, cy = top + 30;
    ctx.save(); ctx.translate(cx, cy);
    ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fillStyle = C.halo; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = C.gold; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(4.5, -4); ctx.lineTo(-4.5, -4); ctx.closePath(); ctx.fillStyle = C.gold; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(3.5, 5); ctx.lineTo(-3.5, 5); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();
    ctx.font = '700 9px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.gold; ctx.fillText('N', 0, -0.5 + 1);
    ctx.restore();
  }

  private drawScaleBar(ctx: CanvasRenderingContext2D): void {
    const v = this.view;
    const bot = Math.min(this.bottomEl?.getBoundingClientRect().height || 64, 64);
    const steps = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    const m = steps.find((s) => s * v.scale >= 70) ?? steps[steps.length - 1];
    const px = m * v.scale;
    const x1 = v.w - 70 - (v.w > 700 ? 12 : 0), y = v.h - bot - 16, x0 = x1 - px;
    ctx.save();
    ctx.lineWidth = 4; ctx.strokeStyle = C.halo; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x0, y - 4); ctx.lineTo(x0, y); ctx.lineTo(x1, y); ctx.lineTo(x1, y - 4); ctx.stroke();
    this.text(ctx, m >= 1000 ? `${m / 1000} km` : `${m} m`, (x0 + x1) / 2, y - 11, '#fff', 10);
    ctx.restore();
  }

  private syncCard(): void {
    const b = this.selected;
    this.cardEl.hidden = !b;
    if (!b) return;
    const wp = getWaypoint();
    const isWp = !!wp && Math.hypot(wp.x - b.x, wp.z - b.z) < 1;
    const t = `${b.label}  ·  ${this.fmtDist(this.dist(b.x, b.z))}`;
    if (this.cardText.textContent !== t) this.cardText.textContent = t;
    const bt = isWp ? 'Clear waypoint' : 'Set waypoint';
    if (this.cardBtn.textContent !== bt) this.cardBtn.textContent = bt;
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
