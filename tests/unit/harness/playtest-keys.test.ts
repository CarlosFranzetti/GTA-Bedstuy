import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs harness module
import { sanitizeActions } from '../../../scripts/playtest/session.mjs';

describe('playtest key whitelist', () => {
  it('accepts the phone key, arrows and panel keys', () => {
    for (const k of ['KeyP', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Backspace']) {
      const { actions, notes } = sanitizeActions([{ keys: [k], tap: true }]);
      expect(actions.length, k).toBe(1);
      expect(notes.join(' '), k).not.toContain('unknown key');
    }
  });
  it('still rejects keys the game does not read', () => {
    const { actions, notes } = sanitizeActions([{ key: 'F5' }]);
    expect(actions.length).toBe(0);
    expect(notes.join(' ')).toContain('F5');
  });
});
