import { afterEach, describe, expect, it } from 'vitest';
import { PED_SPECS, pedVariantIndex } from '@/textures/painters/ped';
import { getPlayerLook, playerSpecId, randomPlayerLook, setPlayerCastSpec, setPlayerLook } from '@/textures/painters/pedRoster';
import { PEDRO_LOOK, castBootLook, installCastLook, lookOf, playerName } from '@/game/story/cast/player';

afterEach(() => { setPlayerCastSpec(null); setPlayerLook({ group: 'ba', variant: 0 }); });

describe('CAST: Pedro as the player', () => {
  it('a new game (no save) starts as Pedro in his day outfit', () => {
    expect(castBootLook(null, false)).toEqual(PEDRO_LOOK);
    expect(PEDRO_LOOK).toMatchObject({ cast: 'pedro', outfit: 'day', group: 'la' });
  });
  it('an old save (a look with no cast) keeps its random look: nothing is applied', () => {
    expect(castBootLook({ seed: 0, group: 'wh', variant: 3 }, true)).toBeNull();
    expect(castBootLook(undefined, true)).toBeNull();
    const l = randomPlayerLook('old-save'); setPlayerLook(l);
    expect(getPlayerLook()).toEqual(l);
    expect(installCastLook(getPlayerLook())).toBeNull();
    expect(playerSpecId()).toBe(`player-${l.group}-${l.variant}`);
    expect(() => pedVariantIndex('player')).not.toThrow();
  });
  it('a save with a cast look restores that character and outfit; junk falls back', () => {
    expect(castBootLook({ group: 'la', variant: 0, cast: 'lana', outfit: 'night' }, true)).toMatchObject({ cast: 'lana', outfit: 'night' });
    expect(castBootLook({ cast: 'nobody' }, true)).toBeNull();
    expect(castBootLook({ cast: 'pedro', outfit: 'wat' }, true)).toMatchObject({ cast: 'pedro', outfit: 'day' });
  });
  it('installing Pedro makes the player model his registered spec, in every outfit', () => {
    for (const outfit of ['day', 'night', 'gig'] as const) {
      setPlayerLook(lookOf('pedro', outfit));
      expect(getPlayerLook()).toMatchObject({ cast: 'pedro', outfit });
      expect(installCastLook(getPlayerLook())).toBe(`cast-pedro-${outfit}`);
      const i = pedVariantIndex('player');
      expect(PED_SPECS[i].id).toBe(`cast-pedro-${outfit}`);
      expect(PED_SPECS[i].role).toBe('player');
      expect(PED_SPECS[i].skin).toBeTruthy();
    }
  });
  it('the player name is Pedro unless another character is active', () => {
    expect(playerName(undefined)).toBe('Pedro');
    expect(playerName({ group: 'ba' } as never)).toBe('Pedro');
    expect(playerName({ cast: 'lana' })).toBe('Lana');
  });
  it('setPlayerLook keeps the cast fields and round-trips through a JSON save', () => {
    setPlayerLook(lookOf('adele', 'gig'));
    const saved = JSON.parse(JSON.stringify({ seed: 0, ...getPlayerLook() }));
    setPlayerLook({ group: 'ba', variant: 0 });
    setPlayerLook(saved);
    expect(getPlayerLook()).toMatchObject({ cast: 'adele', outfit: 'gig' });
  });
});
