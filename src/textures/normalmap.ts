/**
 * Height field -> tangent-space normal map.
 *
 * Layout: row 0 is the TOP image row (canvas order), `height` is row-major w*h in roughly [0,1].
 * Output is RGBA (w*h*4) in the same row order, OpenGL convention (G = +Y up in texture space), alpha 255.
 * Sampling wraps around at the edges so the result tiles seamlessly. Sobel kernel, normalised so that a height
 * ramp of one unit per pixel gives a slope of exactly `strength`.
 */
export function heightToNormal(height: Float32Array, w: number, h: number, strength: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const ym = ((y - 1 + h) % h) * w;
    const y0 = y * w;
    const yp = ((y + 1) % h) * w;
    for (let x = 0; x < w; x++) {
      const xm = (x - 1 + w) % w;
      const xp = (x + 1) % w;
      const tl = height[ym + xm], tc = height[ym + x], tr = height[ym + xp];
      const ml = height[y0 + xm], mr = height[y0 + xp];
      const bl = height[yp + xm], bc = height[yp + x], br = height[yp + xp];
      const dx = (tr + 2 * mr + br - (tl + 2 * ml + bl)) / 8;
      const dy = (bl + 2 * bc + br - (tl + 2 * tc + tr)) / 8; // grows toward image bottom = -v
      // n = normalize(-dh/du, -dh/dv, 1) with dh/dv = -dy
      let nx = -dx * strength;
      let ny = dy * strength;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      nx *= inv;
      ny *= inv;
      const nz = inv;
      const o = (y0 + x) * 4;
      out[o] = Math.round((nx * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Red channel of RGBA pixel data as a 0..1 height field. */
export function heightFromRgba(data: ArrayLike<number>, w: number, h: number): Float32Array {
  const hf = new Float32Array(w * h);
  for (let i = 0; i < hf.length; i++) hf[i] = data[i * 4] / 255;
  return hf;
}
