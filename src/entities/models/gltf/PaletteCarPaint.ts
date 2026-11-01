/**
 * Car paint for palette-textured glTF cars (the Kenney Car Kit style): one small colour-palette texture shared by every
 * part, so "the body colour" is a rectangle of that texture, not a material. This standard material recolours only the
 * fragments whose UV lies inside the paint cell and keeps the baked shading of the palette (the cell's own gradient),
 * so windows, trim and lamps keep their colours.
 *
 * The paint colour is the `paintColor` uniform, or, for instanced meshes with an instance colour (the far-car LOD in
 * CarLod), the per-instance colour. `color` (the material colour) still multiplies the result, so Vehicle's wreck
 * darkening (`color.multiplyScalar`) works unchanged. `clone()` keeps everything (the class re-installs the shader hook).
 */
import * as THREE from 'three';

/** A rectangle of a palette atlas, in grid cells (v counts from the top, the glTF convention). */
export interface PaletteCell {
  col: number;
  row: number;
  /** grid size of the atlas (default 8 x 4, the Kenney palette: 64 x 128 px cells in 512 x 512) */
  cols?: number;
  rows?: number;
}

const HEADER = /* glsl */ `
uniform vec4 paintRect;
uniform vec3 paintColor;
uniform vec2 paintRef;
`;

const PAINT = /* glsl */ `
#ifdef USE_MAP
{
  vec2 pc = vMapUv;
  if (pc.x >= paintRect.x && pc.y >= paintRect.y && pc.x <= paintRect.z && pc.y <= paintRect.w) {
    vec3 refC = texture2D( map, paintRef ).rgb;
    float shade = clamp( dot( sampledDiffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) / max( dot( refC, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.02 ), 0.4, 1.4 );
    #ifdef USE_INSTANCING_COLOR
      vec3 paintBase = vColor.rgb;
    #else
      vec3 paintBase = paintColor;
    #endif
    diffuseColor.rgb = diffuse * paintBase * shade;
  }
}
#endif
`;

export class PaletteCarPaint extends THREE.MeshStandardMaterial {
  readonly isPaletteCarPaint = true;
  /** body colour (ignored for instanced meshes with an instance colour) */
  readonly paintColor = new THREE.Color(1, 1, 1);
  /** u0, v0, u1, v1 of the paint cell */
  readonly paintRect = new THREE.Vector4(0, 0, 0, 0);
  /** where the unshaded paint colour is sampled (left quarter of the cell), for the shading ratio */
  readonly paintRef = new THREE.Vector2(0, 0);

  constructor() {
    super();
    this.name = 'palette-car-paint';
    this.onBeforeCompile = (shader) => {
      shader.uniforms.paintRect = { value: this.paintRect };
      shader.uniforms.paintColor = { value: this.paintColor };
      shader.uniforms.paintRef = { value: this.paintRef };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${HEADER}`)
        .replace('#include <map_fragment>', `#include <map_fragment>\n${PAINT}`)
        .replace('#include <color_fragment>', ''); // instance colours are the paint colour, not a multiplier
    };
  }

  /** Sets the paint cell (grid coordinates). */
  setCell(cell: PaletteCell): this {
    const cols = cell.cols ?? 8, rows = cell.rows ?? 4;
    const e = 0.0005;
    this.paintRect.set(cell.col / cols + e, cell.row / rows + e, (cell.col + 1) / cols - e, (cell.row + 1) / rows - e);
    this.paintRef.set((cell.col + 0.25) / cols, (cell.row + 0.5) / rows);
    this.needsUpdate = false;
    return this;
  }

  setPaint(colour: THREE.ColorRepresentation): this {
    this.paintColor.set(colour);
    return this;
  }

  override copy(source: THREE.Material): this {
    super.copy(source);
    const s = source as Partial<PaletteCarPaint>;
    if (s.isPaletteCarPaint) {
      this.paintColor.copy(s.paintColor!);
      this.paintRect.copy(s.paintRect!);
      this.paintRef.copy(s.paintRef!);
    }
    return this;
  }

  override customProgramCacheKey(): string {
    return 'palette-car-paint';
  }
}
