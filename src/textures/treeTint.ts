/**
 * Per-tree colour for the instanced street trees (ROADS). The four forms (streetTrees.ts TREE_FORMS) are told apart in the
 * vertex shader by the squash of their instance matrix (canopy y / x: honey locust 0.6, plane 0.86, pin oak 1.12, pear 1.35;
 * trunk x / y: plane 1.18 down to pear 0.76), so each species gets its own leaf and bark colour and every tree a small hash
 * shift of its own, with no instance attribute, no extra draw and no extra triangle. Mid-summer green only (seasonal neutral).
 */
import * as THREE from 'three';

export type TreeTintKind = 'leaves' | 'trunk';

export function patchTreeTint(m: THREE.MeshStandardMaterial, kind: TreeTintKind): void {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    if (!shader.vertexShader || !shader.fragmentShader) return;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTreeTint;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vTreeTint = vec3( 1.0 );
#ifdef USE_INSTANCING
{
  vec3 ax = instanceMatrix[0].xyz; vec3 ay = instanceMatrix[1].xyz;
  float tt = ${kind === 'leaves' ? 'length( ay ) / max( length( ax ), 1e-4 )' : 'length( ax ) / max( length( ay ), 1e-4 )'};
  float th = fract( sin( dot( instanceMatrix[3].xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
  float th2 = fract( th * 7.13 + 0.31 );
  ${kind === 'leaves' ? `
  // honey locust: light yellow-green; plane: mid green; pin oak: deep green; pear: dark glossy blue-green
  vec3 sp = tt < 0.73 ? vec3( 1.2, 1.15, 0.82 ) : ( tt < 0.99 ? vec3( 1.06, 1.1, 0.95 ) : ( tt < 1.24 ? vec3( 0.92, 1.02, 0.88 ) : vec3( 0.94, 1.08, 0.98 ) ) );
  // lit crown: the top of every cloud is lighter, the underside stays in shade
  sp *= 0.8 + 0.5 * smoothstep( -0.5, 0.85, transformed.y );
  vTreeTint = sp * ( 0.88 + 0.24 * th ) * mix( vec3( 1.06, 1.02, 0.88 ), vec3( 0.92, 1.0, 1.06 ), th2 );` : `
  // plane: pale mottled bark; honey locust: dark; oak: grey-brown; pear: smooth grey
  vec3 sp = tt > 1.07 ? vec3( 1.5, 1.45, 1.32 ) : ( tt > 0.86 ? vec3( 1.1, 1.06, 1.0 ) : ( tt > 0.8 ? vec3( 1.25, 1.18, 1.1 ) : vec3( 1.3, 1.3, 1.28 ) ) );
  vTreeTint = sp * ( 0.85 + 0.3 * th );`}
}
#endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTreeTint;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= vTreeTint;');
  };
  const prevKey = m.customProgramCacheKey;
  m.customProgramCacheKey = () => `${prevKey ? prevKey.call(m) : ''}|treetint1-${kind}`;
  m.needsUpdate = true;
}
