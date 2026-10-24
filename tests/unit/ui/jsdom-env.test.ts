// @vitest-environment jsdom
import { it, expect } from 'vitest';
it('jsdom environment is available via docblock', () => {
  const el = document.createElement('div'); el.textContent = 'hi'; document.body.appendChild(el);
  expect(document.body.textContent).toContain('hi');
});
