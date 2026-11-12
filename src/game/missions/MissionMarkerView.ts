/**
 * Draws MissionSystem.markers as glowing cylinders (open-ended light column + ground ring). Owns one THREE.Group;
 * add `view.group` to the scene. `sync` rebuilds only when `markersVersion` changed (pooled meshes, shared
 * geometry); `update` just pulses opacity. No per-frame allocations.
 */
import * as THREE from 'three';
import type { MissionMarker } from './types';

const COLUMN_HEIGHT = 8;
const RING_Y = 0.12;
const MIN_VISUAL_RADIUS = 1.2;

interface Slot { column: THREE.Mesh; ring: THREE.Mesh; colMat: THREE.MeshBasicMaterial; ringMat: THREE.MeshBasicMaterial }

export class MissionMarkerView {
  readonly group = new THREE.Group();
  private readonly colGeo = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true);
  private readonly ringGeo = new THREE.RingGeometry(0.88, 1, 40);
  private readonly slots: Slot[] = [];
  private shown = 0;
  private version = -1;
  private readonly tmp = new THREE.Color();

  constructor() {
    this.group.name = 'mission-markers';
    this.ringGeo.rotateX(-Math.PI / 2);
  }

  /** @returns true when the marker set was rebuilt. */
  sync(markers: readonly MissionMarker[], version: number): boolean {
    if (version === this.version) return false;
    this.version = version;
    for (let i = 0; i < markers.length; i++) {
      const slot = this.slots[i] ?? this.addSlot();
      const m = markers[i];
      const r = Math.max(MIN_VISUAL_RADIUS, m.radius);
      slot.column.position.set(m.x, COLUMN_HEIGHT / 2 + RING_Y, m.z);
      // Thin beam: the ring shows the trigger radius; a column that wide fills the first view at spawn.
      const cr = Math.min(0.9, Math.max(0.35, r * 0.3));
      slot.column.scale.set(cr, COLUMN_HEIGHT, cr);
      slot.ring.position.set(m.x, RING_Y, m.z);
      slot.ring.scale.set(r, 1, r);
      this.tmp.set(m.color);
      slot.colMat.color.copy(this.tmp);
      slot.ringMat.color.copy(this.tmp);
      slot.column.visible = true; slot.ring.visible = true;
    }
    for (let i = markers.length; i < this.shown; i++) { this.slots[i].column.visible = false; this.slots[i].ring.visible = false; }
    this.shown = markers.length;
    return true;
  }

  /** Gentle pulse; `t` is seconds. */
  update(t: number): void {
    const k = 0.5 + 0.5 * Math.sin(t * 3);
    for (let i = 0; i < this.shown; i++) {
      this.slots[i].colMat.opacity = 0.1 + 0.08 * k;
      this.slots[i].ringMat.opacity = 0.55 + 0.35 * k;
    }
  }

  get visibleCount(): number { return this.shown; }

  dispose(): void {
    this.colGeo.dispose(); this.ringGeo.dispose();
    for (const s of this.slots) { s.colMat.dispose(); s.ringMat.dispose(); }
    this.group.removeFromParent();
  }

  private addSlot(): Slot {
    const mat = (): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending, fog: false,
    });
    const colMat = mat(), ringMat = mat();
    const column = new THREE.Mesh(this.colGeo, colMat);
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    column.renderOrder = 5; ring.renderOrder = 5; // frustum culled: far-off markers (up to 8 draws) were drawn in every view
    this.group.add(column, ring);
    const slot = { column, ring, colMat, ringMat };
    this.slots.push(slot);
    return slot;
  }
}
