/**
 * COMBAT2: draws `Blood`. Two instanced meshes (flying droplets, marks on the ground) however many there are: a hit adds no draw call.
 * The marks fade through a per-instance alpha; everything is unlit dark oxblood (0x4b1015), made from canvas shapes, no image files.
 */
import * as THREE from 'three';
import { groundAt } from '@/world/Ground';
import { Blood, BLOOD_CAPS } from './blood';

const OXBLOOD = new THREE.Color(0x4b1015);

function splatTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  // an irregular blob: a core and a ring of lobes with a few flecks
  g.beginPath(); g.arc(32, 32, 17, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + (i % 2) * 0.3, r = 16 + (i * 7) % 9; g.beginPath(); g.arc(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 4 + (i * 3) % 5, 0, Math.PI * 2); g.fill(); }
  for (let i = 0; i < 6; i++) { const a = i * 1.1 + 0.4; g.beginPath(); g.arc(32 + Math.cos(a) * 27, 32 + Math.sin(a) * 27, 1.6, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function dotTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 15);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.7, 'rgba(255,255,255,0.9)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** MeshBasicMaterial with a per-instance alpha attribute (`aAlpha`). */
function alphaMaterial(map: THREE.Texture, depthTest = true): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ map, color: OXBLOOD, transparent: true, depthWrite: false, depthTest, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = (sh): void => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vBlood;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlood = aAlpha;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vBlood;').replace('#include <dithering_fragment>', 'gl_FragColor.a *= vBlood;\n#include <dithering_fragment>');
  };
  return m;
}

export class BloodView {
  readonly root = new THREE.Group();
  private readonly marksMesh: THREE.InstancedMesh;
  private readonly dropsMesh: THREE.InstancedMesh;
  private readonly markAlpha: THREE.InstancedBufferAttribute;
  private readonly dropAlpha: THREE.InstancedBufferAttribute;
  private readonly textures: THREE.Texture[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly qs = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  private readonly e = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 0, 1);
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(scene: THREE.Object3D, private readonly blood: Blood) {
    this.root.name = 'blood';
    const caps = BLOOD_CAPS[blood.tier];
    const marksTex = splatTexture(), dropTex = dotTexture();
    this.textures.push(marksTex, dropTex);
    const quad = new THREE.PlaneGeometry(1, 1);
    const nMarks = Math.max(1, caps.marks + caps.pools), nDrops = Math.max(1, caps.drops);
    this.markAlpha = new THREE.InstancedBufferAttribute(new Float32Array(nMarks), 1);
    this.dropAlpha = new THREE.InstancedBufferAttribute(new Float32Array(nDrops), 1);
    const gm = quad.clone(); gm.setAttribute('aAlpha', this.markAlpha);
    const gd = quad.clone(); gd.setAttribute('aAlpha', this.dropAlpha);
    quad.dispose();
    this.marksMesh = new THREE.InstancedMesh(gm, alphaMaterial(marksTex), nMarks);
    this.dropsMesh = new THREE.InstancedMesh(gd, alphaMaterial(dropTex), nDrops);
    for (const mesh of [this.marksMesh, this.dropsMesh]) { mesh.count = 0; mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 2; this.root.add(mesh); }
    this.marksMesh.name = 'blood:marks'; this.dropsMesh.name = 'blood:drops';
    // droplets face the camera
    this.dropsMesh.onBeforeRender = (_r, _s, camera): void => {
      camera.getWorldQuaternion(this.q);
      for (let i = 0; i < this.dropsMesh.count; i++) {
        const d = blood.drops[i]; if (!d) break;
        this.dropsMesh.setMatrixAt(i, this.m.compose(this.p.set(d.x, d.y, d.z), this.q, this.s.set(d.size * 2, d.size * 2, 1)));
      }
      this.dropsMesh.instanceMatrix.needsUpdate = true;
    };
    scene.add(this.root);
  }

  /** Copy the simulation into the instances. Call once per frame after `blood.update`. */
  sync(): void {
    const b = this.blood;
    let n = 0;
    for (const mk of b.marks) {
      if (n >= this.marksMesh.instanceMatrix.count) break;
      const r = Blood.radius(mk);
      this.e.setFromAxisAngle(this.up, mk.rot);
      this.marksMesh.setMatrixAt(n, this.m.compose(this.p.set(mk.x, groundAt(mk.x, mk.z) + 0.035, mk.z), this.q.copy(this.qs).multiply(this.e), this.s.set(r * 2, r * 2, 1)));
      this.markAlpha.setX(n, Blood.alpha(mk) * (mk.pool ? 0.92 : 0.8));
      n++;
    }
    this.marksMesh.count = n; this.marksMesh.visible = n > 0;
    this.marksMesh.instanceMatrix.needsUpdate = true; this.markAlpha.needsUpdate = true;
    const nd = Math.min(b.drops.length, this.dropsMesh.instanceMatrix.count);
    for (let i = 0; i < nd; i++) this.dropAlpha.setX(i, 0.95);
    this.dropsMesh.count = nd; this.dropsMesh.visible = nd > 0; this.dropAlpha.needsUpdate = true;
  }

  get drawCalls(): number { return (this.marksMesh.visible ? 1 : 0) + (this.dropsMesh.visible ? 1 : 0); }

  dispose(): void {
    this.root.removeFromParent();
    for (const mesh of [this.marksMesh, this.dropsMesh]) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); mesh.dispose(); }
    for (const t of this.textures) t.dispose();
  }
}
