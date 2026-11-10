// UI10 harness: the real HUD pieces on the real grid with fake game state, for screenshots and layout checks.
// Open /scripts/ui10-harness.html?touch=1 (touch controls) &mission=1 &car=1 &demo=map|menu|saves|phone-saves
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { Hud } from '@/ui/Hud';
import { MissionHud } from '@/ui/MissionHud';
import { Minimap } from '@/ui/Minimap';
import { PhoneHud } from '@/ui/PhoneHud';
import { Menu } from '@/ui/Menu';
import { TouchControls } from '@/ui/TouchControls';
import { MapScreen, navPlaces, placesFromPois } from '@/ui/MapScreen';
import { SaveManager, SaveStore, type SaveParts } from '@/ui/GameSave';
import { Input } from '@/core/Input';
import { Phone } from '@/game/Phone';
import { Inventory } from '@/game/Inventory';
import { PROCEDURAL_RECORDS } from '@/game/records';
import { createPointerRouter } from '@/game/missions/PointerRoute';

const q = new URLSearchParams(location.search);
const data = loadBedstuyData();
const grid = buildGrid(data);
const overlay = document.getElementById('overlay')!;
const hud = new Hud(overlay);
const missionHud = new MissionHud(overlay);
missionHud.setRouter(createPointerRouter(grid));
const minimap = new Minimap(overlay, grid);
const input = new Input(overlay);
const touch = q.has('touch');
if (touch) new TouchControls(overlay, input);

const live = { x: 9, z: 20, h: 0.6, hour: 15.5, day: 2, cash: 240 };
const inventory = new Inventory(PROCEDURAL_RECORDS, null);
inventory.add(live.cash - inventory.cash);
const parts: SaveParts = {
  getPose: () => ({ x: live.x, z: live.z, heading: live.h, inCar: q.has('car') }), setPose: (p) => { live.x = p.x; live.z = p.z; live.h = p.heading; },
  getHour: () => live.hour, setHour: (h) => { live.hour = h; }, getDay: () => live.day, setDay: (d) => { live.day = d; },
  inventory, missions: { serialize: () => ({ v: 1, completed: [], cash: 0 }), restore: () => true }, phone: { serialize: () => ({}), restore: () => true },
  getWanted: () => 0, setWanted: () => undefined, getWeather: () => 'dry', setWeather: () => undefined, getStation: () => 'Static FM', setStation: () => undefined,
  getLook: () => ({ seed: 7 }), setLook: () => undefined, getStreet: () => grid.nearestStreet({ x: live.x, z: live.z }).signName,
};
const store = new SaveStore(q.has('blocked') ? null : undefined);
const saves = new SaveManager(store, { newGame: () => undefined });
saves.bind(parts);
if (!q.has('noslots')) { saves.save('auto', Date.now() - 3 * 60_000); live.cash = 1250; inventory.add(1010); live.hour = 22.25; live.day = 5; saves.save('slot1'); }

const phone = new Phone();
phone.text('Ms. Odette', 'Buy three records.');
const phoneHud = new PhoneHud(overlay, phone, { saves });
const map = new MapScreen(overlay, grid, { places: [...navPlaces(), ...placesFromPois(grid, data.pois)] });
map.onOpen = () => { if (phoneHud.isOpen) phoneHud.toggle(); };
const menu = new Menu(overlay, {}, { touch, saves, storage: null, openOnPointerUnlock: false });

const markers = [
  { id: 'g', kind: 'giver' as const, x: 60, z: -40, radius: 3, color: '#f5c542', label: 'Ms. Odette' },
  { id: 'o', kind: 'objective' as const, x: 330, z: 110, radius: 3, color: '#ef4444', label: 'Drop-off' },
];
const mState = {
  status: q.has('mission') ? 'active' : 'idle', title: 'Wax for the Deli', objective: 'Deliver the crate to the deli', step: 2, steps: 4, timeLeft: -1, progress: -1,
  carrying: '', cash: 240, toastSeq: 0, toast: '', toastKind: 'info', retryPrompt: '', prompt: '',
} as never;
hud.setInputMode(touch ? 'touch' : 'keyboard');
const car = q.has('car');
function frame(): void {
  hud.update({ stars: q.has('stars') ? 3 : 0, speedKmh: car ? 48 : 0, inVehicle: car, radioStation: 'Static FM', prompt: car ? 'CAR  Exit car' : '', timeOfDay: live.hour, streetName: 'Throop Ave', fps: 60 });
  missionHud.update(mState, 1 / 60);
  missionHud.updatePointer(markers, { x: live.x, z: live.z }, 0);
  phoneHud.update('', { x: live.x, z: live.z }, 0);
  minimap.update({ x: live.x, z: live.z }, live.h, [], 1 / 60, markers);
  map.update({ x: live.x, z: live.z }, live.h, markers, 1 / 60);
  requestAnimationFrame(frame);
}
frame();
(window as unknown as { __ui10: unknown }).__ui10 = { map, menu, phoneHud, saves, live };
