/**
 * One look for the map screen and the minimap (UI14): dark desaturated land, blue-black water, built blocks a step lighter,
 * light-grey streets, and the same blip icons in both. Original art; the idiom (not any game's pixels) is the reference.
 */

export const MAP_COLORS = {
  /** deepest layer: water, blue-black */
  water: '#08111c',
  shore: '#2c3a4c',
  /** Brooklyn land outside the built area */
  land: '#1b1d21',
  /** other boroughs, darker */
  landOther: '#131519',
  /** land just inside the playable area (under the blocks) */
  built: '#1f2227',
  /** a built city block, slightly lighter than land */
  block: '#2b3038',
  park: '#25332b',
  street: '#c4c9d3',
  avenue: '#d7dbe3',
  /** overview roads (25 % luminance by class) */
  ovStreet: '#34383f',
  ovAvenue: '#3d424a',
  ovArterial: '#4a505a',
  ovHighway: '#575e6a',
  el: '#9aa6bd',
  label: '#ffffff',
  ovLabel: '#6c7686',
  halo: 'rgba(10, 12, 18, 0.9)',
  gold: '#f5c542',
  home: '#7cd6a0',
  waypoint: '#38bdf8',
  goal: '#ef4444',
  shop: '#9aa4b2',
  station: '#8fb0ff',
  player: '#ffffff',
} as const;

export type IconKind = 'player' | 'home' | 'venue' | 'shop' | 'station' | 'waypoint' | 'giver' | 'goal';

export interface IconOpts {
  /** pixel scale (1 = the map-screen size) */
  k?: number;
  color?: string;
  letter?: string;
  /** radians, clockwise from up (player arrow) */
  angle?: number;
  /** 0..1 pulse for the attention rings */
  pulse?: number;
  selected?: boolean;
}

/** Draws one blip centred on (x, y). Shared by MapScreen and Minimap so the two read as one system. */
export function drawIcon(ctx: CanvasRenderingContext2D, kind: IconKind, x: number, y: number, o: IconOpts = {}): void {
  const k = o.k ?? 1;
  const halo = MAP_COLORS.halo;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';
  const disc = (r: number, stroke: string, w: number): void => {
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = halo; ctx.fill();
    ctx.lineWidth = w; ctx.strokeStyle = stroke; ctx.stroke();
  };
  if (o.selected) { ctx.beginPath(); ctx.arc(0, 0, 17 * k, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); }
  switch (kind) {
    case 'player': {
      ctx.beginPath(); ctx.arc(0, 0, 15 * k, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
      ctx.rotate(o.angle ?? 0);
      ctx.beginPath(); ctx.moveTo(0, -12 * k); ctx.lineTo(8 * k, 9 * k); ctx.lineTo(0, 5 * k); ctx.lineTo(-8 * k, 9 * k); ctx.closePath();
      ctx.fillStyle = MAP_COLORS.player; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 2; ctx.fill(); ctx.stroke();
      break;
    }
    case 'home': {
      const c = o.color ?? MAP_COLORS.home;
      if (o.pulse !== undefined) {
        ctx.beginPath(); ctx.arc(0, 0, 12 * k * (1 + o.pulse * 0.9), 0, Math.PI * 2);
        ctx.lineWidth = 2; ctx.strokeStyle = `rgba(124, 214, 160, ${(0.8 * (1 - o.pulse)).toFixed(3)})`; ctx.stroke();
      }
      disc(12 * k, c, 2);
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(-7 * k, -1 * k); ctx.lineTo(0, -8 * k); ctx.lineTo(7 * k, -1 * k); ctx.closePath(); ctx.fill();
      ctx.fillRect(-4.5 * k, -1 * k, 9 * k, 7 * k);
      break;
    }
    case 'venue': {
      const c = o.color ?? MAP_COLORS.gold;
      disc(11 * k, c, 2);
      ctx.font = `700 ${Math.round(13 * k)}px Arial, Helvetica, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = c; ctx.fillText((o.letter ?? 'V').slice(0, 1).toUpperCase(), 0, 0.5);
      break;
    }
    case 'shop': {
      const r = 4.5 * k;
      ctx.fillStyle = o.color ?? MAP_COLORS.shop; ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.lineWidth = 1.5; ctx.strokeStyle = halo; ctx.strokeRect(-r, -r, r * 2, r * 2);
      break;
    }
    case 'station': {
      const c = o.color ?? MAP_COLORS.station, r = 8 * k;
      ctx.beginPath(); ctx.roundRect?.(-r, -r, r * 2, r * 2, 3 * k); if (!ctx.roundRect) ctx.rect(-r, -r, r * 2, r * 2);
      ctx.fillStyle = halo; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = c; ctx.stroke();
      ctx.fillStyle = c; ctx.fillRect(-5 * k, -3.5 * k, 10 * k, 2 * k); ctx.fillRect(-5 * k, 1.5 * k, 10 * k, 2 * k);
      ctx.fillRect(-1 * k, -5.5 * k, 2 * k, 11 * k);
      break;
    }
    case 'waypoint': {
      // a blue diamond on a short pin; the tip is at (0, 0)
      const c = o.color ?? MAP_COLORS.waypoint, hy = -20 * k, r = 9 * k;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, hy + r); ctx.lineWidth = 3.5; ctx.strokeStyle = halo; ctx.stroke();
      ctx.lineWidth = 1.5; ctx.strokeStyle = c; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, hy - r); ctx.lineTo(r, hy); ctx.lineTo(0, hy + r); ctx.lineTo(-r, hy); ctx.closePath();
      ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = halo; ctx.stroke();
      break;
    }
    case 'giver':
    case 'goal': {
      const giver = kind === 'giver', c = giver ? MAP_COLORS.gold : (o.color ?? MAP_COLORS.goal), r = (giver ? 9 : 7) * k;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.lineWidth = 5; ctx.strokeStyle = halo; ctx.stroke();
      ctx.lineWidth = 2.5; ctx.strokeStyle = c; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, (2.5 + (giver ? 1.5 * (o.pulse ?? 0) : 0)) * k, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill();
      if (o.letter) { ctx.font = `700 ${Math.round(9 * k)}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(o.letter, 0, 0.5); }
      break;
    }
  }
  ctx.restore();
}
