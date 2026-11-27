/** RADIOPAGE entry (/radio/): the game's radio without the game. Imports no 3D, world or game code. */
import './radio.css';
import { RadioPage } from './engine';
import { localLastStation } from '@/audio/RadioDirector';
import type { SpeechLike, UtteranceLike } from '@/audio/talk/TalkPlayer';
import { mount } from './ui';

function browserSpeech(): SpeechLike | null {
  try {
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return null;
    return speechSynthesis as unknown as SpeechLike;
  } catch { return null; }
}

const root = document.getElementById('app')!;
const widgetHost = document.createElement('div');
const page = new RadioPage({
  speech: browserSpeech(),
  makeUtterance: (text) => new SpeechSynthesisUtterance(text) as unknown as UtteranceLike,
  createContext: () => { try { return new AudioContext(); } catch { return null; } },
  packBase: '../voice/',
  lastStore: localLastStation('gta-bedstuy.radiopage.last.v1'),
  widgetHost: { el: widgetHost, css: 'display:block;width:100%;max-width:640px;height:166px;border:0;border-radius:6px;' },
});
mount(root, page);
const slot = document.getElementById('widget');
if (slot) slot.appendChild(widgetHost);
page.start();
(window as unknown as { __radioPage?: RadioPage }).__radioPage = page;
