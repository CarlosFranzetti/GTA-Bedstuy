import sys, os, numpy as np
from PIL import Image, ImageEnhance, ImageFilter
SRC, OUT = sys.argv[1], sys.argv[2]
rng = np.random.default_rng(1988)
def load(s, m): return Image.open(os.path.join(SRC, s, m + '.jpg')).convert('RGB' if m != 'rough' else 'L')
def arr(im): return np.asarray(im).astype(np.float32) / 255.0
def img(a): return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
def save(name, color, normal, rough):
    img(color).save(f'{OUT}/{name}_color.jpg', quality=80, optimize=True)
    img(normal).save(f'{OUT}/{name}_normal.jpg', quality=85, optimize=True)
    r = img(rough); r = r.convert('L').resize((512, 512)); r.save(f'{OUT}/{name}_rough.jpg', quality=75, optimize=True)
def tint(c, rgb, mix=1.0):
    t = c * np.array(rgb, dtype=np.float32)[None, None, :] / np.mean(c, axis=(0, 1))[None, None, :] * np.mean(c)
    return c * (1 - mix) + t * mix
def desat(c, k):
    g = c.mean(axis=2, keepdims=True); return c * (1 - k) + g * k
def contrast(c, k): return (c - 0.5) * k + 0.5
def height_to_normal(h, strength):
    gx = np.roll(h, -1, 1) - np.roll(h, 1, 1); gy = np.roll(h, -1, 0) - np.roll(h, 1, 0)
    n = np.stack([-gx * strength, gy * strength, np.ones_like(h)], axis=2)
    n /= np.linalg.norm(n, axis=2, keepdims=True); return n
def combine_normals(base, extra):
    b = base * 2 - 1; e = extra
    n = np.stack([b[..., 0] + e[..., 0], b[..., 1] + e[..., 1], b[..., 2] * e[..., 2]], axis=2)
    n /= np.linalg.norm(n, axis=2, keepdims=True); return n * 0.5 + 0.5
def ashlar_mask(size, courses, stagger=True, joint=0.012, depth=1.0):
    """height map (0 = joint recessed, 1 = block face) for stone courses with staggered vertical joints"""
    y, x = np.mgrid[0:size, 0:size] / size
    ch = 1.0 / courses
    fy = (y % ch) / ch
    h = np.ones((size, size), np.float32)
    jh = joint / ch
    h[(fy < jh) | (fy > 1 - jh)] = 0
    row = np.floor(y / ch).astype(int)
    bw = ch * 2.6  # block width in tile units
    off = np.where(row % 2 == 0, 0.0, bw / 2) if stagger else 0.0
    fx = ((x + off) % bw) / bw
    jw = joint / bw
    h[(fx < jw) | (fx > 1 - jw)] = 0
    return h
def noise(size, scale, seed):
    r = np.random.default_rng(seed)
    small = r.random((size // scale, size // scale)).astype(np.float32)
    return np.asarray(Image.fromarray((small * 255).astype(np.uint8)).resize((size, size), Image.BILINEAR)).astype(np.float32) / 255.0

brick_c, brick_n, brick_r = arr(load('brick', 'color')), arr(load('brick', 'normal')), arr(load('brick', 'rough'))
save('brick_red', brick_c, brick_n, brick_r)
save('brick_brown', contrast(tint(brick_c, (0.62, 0.45, 0.36)), 1.05) * 0.85, brick_n, brick_r)
paint_w = desat(brick_c, 0.85); paint_w = paint_w / paint_w.max() * 0.93 + 0.04
save('brick_white', paint_w, brick_n, np.clip(brick_r * 0.8 + 0.1, 0, 1))
paint_g = desat(brick_c, 0.9) * 0.78 + 0.08
save('brick_grey', paint_g, brick_n, np.clip(brick_r * 0.8 + 0.1, 0, 1))

con_c, con_n, con_r = arr(load('concrete', 'color')), arr(load('concrete', 'normal')), arr(load('concrete', 'rough'))
S = con_c.shape[0]
# brownstone: chocolate ashlar courses with sooty streaks
h = ashlar_mask(S, courses=6)
bs = tint(con_c, (0.56, 0.38, 0.28)) * 1.45
streak = noise(S, 8, 3) * 0.25
bs = bs * (0.55 + 0.45 * h[..., None]) * (1 - streak[..., None] * 0.5)
bs_n = combine_normals(con_n, height_to_normal(h, 3.0))
save('brownstone', contrast(bs, 1.1), bs_n, np.clip(con_r * 0.6 + 0.35, 0, 1))
# limestone: pale warm courses
h2 = ashlar_mask(S, courses=5, joint=0.008)
ls = tint(con_c, (0.86, 0.80, 0.68)) * 1.25
ls = ls * (0.8 + 0.2 * h2[..., None])
save('limestone', ls, combine_normals(con_n, height_to_normal(h2, 2.0)), np.clip(con_r * 0.5 + 0.4, 0, 1))
# sidewalk slabs: joints every half tile, subtle stains
j = np.ones((S, S), np.float32); y, x = np.mgrid[0:S, 0:S] / S
jw = 0.006
j[((y % 0.5) < jw) | ((y % 0.5) > 0.5 - jw) | ((x % 0.5) < jw) | ((x % 0.5) > 0.5 - jw)] = 0
sw = con_c * 1.05 * (0.6 + 0.4 * j[..., None]) * (1 - noise(S, 32, 5)[..., None] * 0.15)
save('sidewalk', sw, combine_normals(con_n, height_to_normal(j, 2.5)), con_r)
save('concrete', con_c * 0.85, con_n, con_r)

asp_c, asp_n, asp_r = arr(load('asphalt', 'color')), arr(load('asphalt', 'normal')), arr(load('asphalt', 'rough'))
save('asphalt', asp_c, asp_n, asp_r)
worn = contrast(asp_c, 0.85) * 1.35 + 0.03
worn = tint(worn, (0.5, 0.49, 0.46))
save('asphalt_worn', worn, asp_n, np.clip(asp_r * 1.05, 0, 1))
# roof: dark tar with gravel speckle
gr = noise(S, 2, 9)
roof = asp_c * 0.55 * (0.7 + 0.6 * gr[..., None]) + 0.02
save('roof', roof, combine_normals(asp_n, height_to_normal(gr, 1.2)), np.clip(asp_r * 1.1, 0, 1))

for s, name in [('metal', 'metal_plates'), ('paving', 'paving'), ('plaster', 'plaster')]:
    save(name, arr(load(s, 'color')), arr(load(s, 'normal')), arr(load(s, 'rough')))
print('done')

# ---- second mirror (amazingsammed/mini_textures, ambientCG CC0): run with a 3rd arg pointing at it
if len(sys.argv) > 3:
    M = sys.argv[3]
    def loadm(id_, m): return Image.open(os.path.join(M, f'{id_}_{m}.jpg')).convert('RGB' if m != 'roughness' else 'L')
    g_c, g_n, g_r = arr(loadm('Ground111', 'diffuse')), arr(loadm('Ground111', 'normal')), arr(loadm('Ground111', 'roughness'))
    dirt = tint(desat(g_c, 0.35), (0.42, 0.36, 0.30)) * 0.9          # brooklyn tree-pit dirt: browner, darker
    save('dirt', contrast(dirt, 1.05), g_n, np.clip(g_r * 0.9 + 0.1, 0, 1))
    b_c = arr(loadm('Bricks105', 'diffuse').resize((1024, 1024))); b_n = arr(loadm('Bricks105', 'normal').resize((1024, 1024))); b_r = arr(loadm('Bricks105', 'roughness').resize((1024, 1024)))
    tan = tint(b_c, (0.62, 0.48, 0.36)) * 0.95                        # iron-spot tan/brown brick
    save('brick_tan', contrast(tan, 1.08), b_n, b_r)
    print('mirror sets done')
