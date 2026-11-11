// CREDITS lane harness: the real title screen (Hud splash) and the credits roll, no 3D world. For screenshots.
import { Hud } from '@/ui/Hud';
import { Credits } from '@/ui/Credits';
const overlay = document.getElementById('overlay')!;
const hud = new Hud(overlay);
const credits = new Credits(overlay, { onOpen: () => console.log('credits open'), onClose: () => console.log('credits close') });
hud.onCredits = () => credits.open();
hud.showSplash();
(window as unknown as { __cr: unknown }).__cr = { hud, credits };
