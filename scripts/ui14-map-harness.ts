// UI14 map harness: the real MapScreen on the real grid with fake game state, for screenshots. /scripts/ui14-map-harness.html?touch=1
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { MapScreen, navPlaces, placesFromPois } from '@/ui/MapScreen';
import { Minimap } from '@/ui/Minimap';
import { setWaypoint } from '@/game/missions/Waypoint';

const q = new URLSearchParams(location.search);
const data = loadBedstuyData();
const grid = buildGrid(data);
const overlay = document.getElementById('overlay')!;
if (q.has('touch')) { const r = document.createElement('div'); r.className = 'hud-root touch'; overlay.appendChild(r); }
const minimap = new Minimap(overlay, grid);
void minimap;
const map = new MapScreen(overlay, grid, { places: [...navPlaces(), ...placesFromPois(grid, data.pois)] });
const player = { x: 140, z: 60 };
const markers = [
  { x: 420, z: 180, color: '#f5c542', kind: 'giver', label: 'Ms. Odette' },
  { x: -120, z: 330, color: '#ef4444', kind: 'objective', label: 'Drop-off' },
];
let last = performance.now();
const tick = (): void => { const n = performance.now(); map.update(player, 0.5, markers, (n - last) / 1000); last = n; requestAnimationFrame(tick); };
requestAnimationFrame(tick);
(window as unknown as Record<string, unknown>).__map = { map, setWaypoint, player };
