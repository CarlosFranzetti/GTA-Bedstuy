/**
 * Contextual hints: one line, shown once, remembered. They come after the tutorial, for things that turn up later. Each is data:
 * an id, a line per device (tokens as in steps.ts) and a test run on every frame (or an event name that raises it).
 * "Jump: climb over" when pinned between cars is the host's own toast (main.ts, `player.vaultPrompt`) and stays as it is.
 */
import type { Device, TutorialCtx } from './types';

export interface HintDef {
  id: string;
  text: Record<Device, string>;
  /** Raised by the frame test... */
  when?: (c: TutorialCtx) => boolean;
  /** ...or by one of the game's events (the Tutorial class listens). */
  event?: 'wantedChanged' | 'interior:entered' | 'shop:bought';
  /** For events: the payload must match. */
  match?: (payload: unknown) => boolean;
}

export const HINTS: readonly HintDef[] = [
  {
    id: 'wanted',
    event: 'wantedChanged',
    match: (p) => (p as { stars?: number }).stars !== undefined && (p as { stars: number }).stars > 0,
    text: {
      keyboard: 'You are wanted. Get out of sight and keep moving, or stand still and take the fine.',
      gamepad: 'You are wanted. Get out of sight and keep moving, or stand still and take the fine.',
      touch: 'You are wanted. Get out of sight and keep moving, or stand still and take the fine.',
    },
  },
  {
    id: 'shop',
    event: 'interior:entered',
    match: (p) => (p as { id?: string }).id === 'wax-deli',
    text: {
      keyboard: 'The records are in the bins. Stand by them and press {enter}.',
      gamepad: 'The records are in the bins. Stand by them and press {enter}.',
      touch: 'The records are in the bins. Stand by them and tap {enter}.',
    },
  },
  {
    id: 'record',
    event: 'shop:bought',
    text: {
      keyboard: 'That one is yours now. Play it on the decks at home or at the club.',
      gamepad: 'That one is yours now. Play it on the decks at home or at the club.',
      touch: 'That one is yours now. Play it on the decks at home or at the club.',
    },
  },
  {
    id: 'decks',
    when: (c) => /turntables|the decks/i.test(c.prompt),
    text: {
      keyboard: 'On the decks, match the tempo, line up the beats, then slide the crossfader on a bar line.',
      gamepad: 'On the decks, match the tempo, line up the beats, then slide the crossfader on a bar line.',
      touch: 'On the decks, match the tempo, line up the beats, then slide the crossfader on a bar line.',
    },
  },
  {
    id: 'rain',
    when: (c) => c.raining,
    text: {
      keyboard: 'Rain. It will pass. The city looks its best wet.',
      gamepad: 'Rain. It will pass. The city looks its best wet.',
      touch: 'Rain. It will pass. The city looks its best wet.',
    },
  },
];
