/**
 * The story panels' stylesheet is loaded as a string and put in one <style> tag the first time a panel is built, instead of a plain `import './story.css'`:
 * a CSS import would be inlined into the single-file build even while the story switch is off (about 7.7 kB), while a string goes away with the dead branch.
 */
import css from './story.css?inline';

export function ensureStoryStyle(doc: Document): void {
  if (!doc.head || doc.getElementById('story-ui-style')) return;
  const el = doc.createElement('style');
  el.id = 'story-ui-style';
  el.textContent = typeof css === 'string' ? css : '';
  doc.head.appendChild(el);
}
