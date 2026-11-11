// UI14 HUD harness: the real HUD pieces over a bright fake scene, driven by query flags. ?car=1 &touch=1 &fx=passed|station
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { Hud } from '@/ui/Hud';
import { MissionHud } from '@/ui/MissionHud';
import { Minimap } from '@/ui/Minimap';
import { PhoneHud } from '@/ui/PhoneHud';
import { MapScreen, navPlaces } from '@/ui/MapScreen';
import { Phone } from '@/game/Phone';

const q = new URLSearchParams(location.search);
const grid = buildGrid(loadBedstuyData());
const overlay = document.getElementById('overlay')!;
const hud = new Hud(overlay);
(hud as unknown as { splashEl: HTMLElement }).splashEl.style.display = 'none';
const mission = new MissionHud(overlay);
const minimap = new Minimap(overlay, grid);
const phoneHud = new PhoneHud(overlay, new Phone());
const map = new MapScreen(overlay, grid, { places: navPlaces() });
void phoneHud; void map;
if (q.has('touch')) overlay.classList.add('touch');
const car = q.has('car');
const state = { stars: 2, speedKmh: car ? 54 : 0, inVehicle: car, radioStation: 'Static FM', prompt: car ? '' : 'F  Enter car', timeOfDay: 17, streetName: 'Throop Ave', fps: 60, health: 0.8, armour: 0.3, vehicleName: 'Hatchback', vehicleClass: 'Compact', wantedCooling: true, radioTrack: 'Block Party' };
const mstate = { status: 'active', title: 'Air Rights', objective: 'Meet Ms. Odette at the deli', step: 1, steps: 3, timeLeft: -1, progress: -1, carrying: '', cash: 1250, toastSeq: 0, toast: '', toastKind: 'info', retryPrompt: '', prompt: '' } as never;
let t = 0;
const tick = (): void => {
  t += 1 / 60;
  hud.update(state as never);
  mission.update(mstate, 1 / 60);
  minimap.update({ x: 140, z: 60 }, 0.4, [], 1 / 60, [{ x: 300, z: 120, color: '#ef4444', kind: 'objective' }, { x: 60, z: -90, color: '#f5c542', kind: 'giver' }]);
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
const fx = q.get('fx');
if (fx === 'station') { hud.setStations(['Static FM', 'WBED 88.9', 'Block Party']); setTimeout(() => hud.showStationBanner('WBED 88.9 — Boom Bap'), 500); }
if (fx === 'passed') setTimeout(() => { (mstate as { status: string }).status = 'complete'; (mstate as { cash: number }).cash = 1550; }, 500);
