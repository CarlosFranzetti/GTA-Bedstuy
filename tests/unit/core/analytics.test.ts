import { describe, expect, it } from 'vitest';
import { analyticsAllowed, startAnalytics } from '@/core/Analytics';

describe('analytics runs on the live site only', () => {
  it('is on for the hosted build over https on a real host', () => {
    expect(analyticsAllowed(true, { protocol: 'https:', hostname: 'gta-bedstuy.vercel.app' })).toBe(true);
  });
  it('is off for the single-file and desktop builds, localhost, plain http and no page at all', () => {
    expect(analyticsAllowed(false, { protocol: 'https:', hostname: 'gta-bedstuy.vercel.app' })).toBe(false);
    expect(analyticsAllowed(true, { protocol: 'file:', hostname: '' })).toBe(false);
    expect(analyticsAllowed(true, { protocol: 'http:', hostname: 'example.org' })).toBe(false);
    expect(analyticsAllowed(true, { protocol: 'https:', hostname: 'localhost' })).toBe(false);
    expect(analyticsAllowed(true, { protocol: 'https:', hostname: '127.0.0.1' })).toBe(false);
    expect(analyticsAllowed(true, undefined)).toBe(false);
  });
  it('does nothing and does not throw where there is no page (tests, node)', () => {
    expect(() => startAnalytics()).not.toThrow();
  });
});
