import { describe, it, expect } from 'vitest';
import { MissionMarkerView } from '@/game/missions/MissionMarkerView';
import { MissionSystem } from '@/game/missions/MissionSystem';
import type { MissionDef } from '@/game/missions/types';

const mk = (id: string, x: number): MissionDef => ({
  id, title: id, blurb: '', giverPoi: 'p', giver: { x, z: 0 }, triggerRadius: 4,
  objectives: [{ kind: 'goTo', at: { x: x + 50, z: 10 }, radius: 6, presence: 'any', text: 'go' }],
  reward: { cash: 1, message: '' },
});

describe('MissionMarkerView', () => {
  it('shows one column + ring per marker, rebuilds only on a new version, hides spares', () => {
    const m = new MissionSystem([mk('a', 0), mk('b', 100)]);
    const view = new MissionMarkerView();
    expect(view.sync(m.markers, m.markersVersion)).toBe(true);
    expect(view.visibleCount).toBe(2);
    expect(view.group.children).toHaveLength(4);
    expect(view.sync(m.markers, m.markersVersion)).toBe(false);

    m.update(1 / 60, { x: 50, z: 0 }, false, 0);
    m.update(1 / 60, { x: 0, z: 0 }, false, 0); // starts 'a'
    expect(view.sync(m.markers, m.markersVersion)).toBe(true);
    expect(view.visibleCount).toBe(1);
    const visible = view.group.children.filter((c) => c.visible);
    expect(visible).toHaveLength(2);
    expect(visible.map((c) => c.position.x)).toEqual([50, 50]);
    // pooled: no new meshes created for the shrink
    expect(view.group.children).toHaveLength(4);
    view.update(1.3);
    const mesh = view.group.children[0] as unknown as { material: { opacity: number } };
    expect(mesh.material.opacity).toBeGreaterThan(0.1);
    view.dispose();
  });
});
