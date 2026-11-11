/** All talk shows and ads as data. */
import type { Show } from '../types';
import { MERCER_IN_THE_MORNING } from './callin';
import { FLIP_THAT_BROWNSTONE } from './realestate';
import { BOARD_LIVE } from './board';
import { BREATHE_AND_BUILD } from './wellness';
import { DEAD_AIR } from './latenight';
import { BLOCK_TALK } from './interview';
import { NEWS_AT_THE_TOP } from './news';
import { ADS } from './ads';
import { DJ_COPY, HOODS } from './djs';

export const TALK_SHOWS: readonly Show[] = [MERCER_IN_THE_MORNING, FLIP_THAT_BROWNSTONE, BOARD_LIVE, BREATHE_AND_BUILD, DEAD_AIR, BLOCK_TALK, NEWS_AT_THE_TOP];
export { ADS, DJ_COPY, HOODS };
