/**
 * The two rows the tutorial adds to the pause menu, Settings, Game: "Replay tutorial" and "Hints: On / Off". main.ts passes them to
 * the Menu as `gameRows`; the Menu knows nothing else about the tutorial.
 */
import type { RowSpec } from '../menuRows';

export interface TutorialRowsHost {
  replay(): void;
  readonly hintsOn: boolean;
  setHints(on: boolean): void;
}

export function tutorialRows(t: TutorialRowsHost, close: () => void): RowSpec[] {
  return [
    {
      id: 'replay-tutorial', label: 'Replay tutorial', kind: 'action',
      desc: 'Runs the short walk-through again from the first step, with the keys you have now. Your save is not touched.',
      press: () => { close(); t.replay(); },
    },
    {
      id: 'hints', label: 'Hints', kind: 'toggle', def: () => true,
      desc: 'A one-line tip the first time something comes up: being wanted, a shop, the decks, rain. Each shows once. Off means none.',
      get: () => t.hintsOn, set: ((v: boolean) => t.setHints(v)) as RowSpec['set'],
    },
  ];
}
