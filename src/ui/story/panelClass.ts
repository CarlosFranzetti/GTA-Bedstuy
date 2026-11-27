/**
 * Body classes for the story panels (scene card, thrift rack). `setPanelClass` in ../panelKeys only knows the older panels and would
 * clear `ui-panel-open` while a story panel is open, so the story panels keep their own list and recompute the shared class from both.
 */
const KNOWN = /^(shop|dj|phone|map|menu|radio|scene|rack)-open$/;

export function setStoryPanelClass(doc: Document, name: 'scene-open' | 'rack-open', open: boolean): void {
  const cl = doc.body?.classList;
  if (!cl) return;
  cl.toggle(name, open);
  cl.toggle('ui-panel-open', [...cl].some((c) => KNOWN.test(c)));
}
