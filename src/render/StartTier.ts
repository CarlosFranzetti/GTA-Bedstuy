import { Input } from '@/core/Input';
import { resolveQuality } from '@/textures/hosted';
import type { Quality } from './Shadows';

/** The tier the page starts in (same rule as main.ts: ?q= or a touch device -> phone, else medium); null without a browser (unit tests, node tools). */
export function browserTier(): Quality | null {
  if (typeof location === 'undefined') return null;
  return resolveQuality(new URLSearchParams(location.search).get('q'), Input.isTouchDevice()).quality;
}
