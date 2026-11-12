/**
 * Fewer blur levels for the phone tier's night sign bloom. three's UnrealBloomPass draws one bright-pass, a horizontal and a
 * vertical blur for each of its 5 levels, the composite and the copy to the frame: 13 full-screen draws. Phone's budget is 150
 * draws in total, so it keeps the 3 finest levels (9 draws, 4 fewer). The two widest halos (levels 4 and 5, the ones that spread a
 * sign's glow over a quarter of the screen) are dropped: their weight in the composite goes to zero and their sampler points at a
 * level that is rendered, so nothing reads a texture that was never drawn.
 */
export interface BloomTrimLike {
  nMips: number;
  bloomTintColors: Array<{ set(x: number, y: number, z: number): unknown }>;
  compositeMaterial: { uniforms: Record<string, { value: unknown }> };
  renderTargetsVertical: Array<{ texture: unknown; dispose(): void }>;
  renderTargetsHorizontal: Array<{ dispose(): void }>;
}

/** Levels the phone bloom keeps. */
export const PHONE_BLOOM_MIPS = 3;

/** Trims `bloom` to `keep` blur levels (call right after construction, before the first setSize). Returns false when the pass is not shaped as expected. */
export function trimBloomMips(bloom: BloomTrimLike, keep: number = PHONE_BLOOM_MIPS): boolean {
  const total = bloom.nMips;
  if (!(keep >= 1) || keep >= total || bloom.bloomTintColors?.length !== total || bloom.renderTargetsVertical?.length !== total) return false;
  for (let i = keep; i < total; i++) {
    bloom.bloomTintColors[i].set(0, 0, 0);
    const u = bloom.compositeMaterial.uniforms['blurTexture' + (i + 1)];
    if (u) u.value = bloom.renderTargetsVertical[keep - 1].texture;
    bloom.renderTargetsHorizontal[i].dispose();
    bloom.renderTargetsVertical[i].dispose();
  }
  // the dropped levels' energy goes to the widest kept one so the glow keeps its strength, not its reach
  bloom.bloomTintColors[keep - 1].set(1.35, 1.35, 1.35);
  bloom.nMips = keep;
  return true;
}
