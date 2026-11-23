// BASE seat: grid delta statistics of one shape (vertex counts, share of zero vectors, mid/far vertices that are hi vertices). node scripts/dev/base-gridstat.mjs wh_m
import { loadSources, buildShape, GRID_KEYS } from '../people-pipeline.mjs';
const { MeshoptSimplifier } = await import('meshoptimizer'); await MeshoptSimplifier.ready;
const src = loadSources();
const b = buildShape(src, MeshoptSimplifier, process.argv[2] ?? 'wh_m');
const hiSrc = new Set(b.lods.hi.mesh.src);
for (const [lod, L] of Object.entries(b.lods)) {
  const n = L.position.length / 3; let zero = 0, head = 0, headNZ = 0;
  for (const k of GRID_KEYS) { const sc = b.people.gridScale[k]; for (let i = 0; i < n; i++) { const q = [0,1,2].map((j) => Math.round(L.grid[k][i*3+j] / sc * 127)); if (q.every((x) => x === 0)) zero++; } }
  let inHi = 0; for (const v of L.mesh.src) if (hiSrc.has(v)) inHi++;
  console.log(lod, 'verts', n, 'zero vec share', (zero / n / 8).toFixed(3), 'src in hi', inHi, '/', L.mesh.src.length);
}
console.log(b.people.gridScale);
// PCA over the 8 grid fields of the hi level: how many components keep every vertex within 1 / 2 mm
{
  const L = b.lods.hi, n = L.position.length / 3, K = GRID_KEYS.length, M = n * 3;
  const C = Array.from({ length: K }, (_, a) => Array.from({ length: K }, (_, c) => { let s = 0; for (let i = 0; i < M; i++) s += L.grid[GRID_KEYS[a]][i] * L.grid[GRID_KEYS[c]][i]; return s; }));
  // Jacobi eigen
  const A = C.map((r) => r.slice()), V = Array.from({ length: K }, (_, i) => Array.from({ length: K }, (_, j) => +(i === j)));
  for (let sweep = 0; sweep < 60; sweep++) for (let p = 0; p < K; p++) for (let q = p + 1; q < K; q++) {
    if (Math.abs(A[p][q]) < 1e-15) continue; const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
    for (let k = 0; k < K; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
    for (let k = 0; k < K; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
    for (let k = 0; k < K; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
  }
  const ev = A.map((r, i) => [r[i], i]).sort((x, y) => y[0] - x[0]);
  console.log('eigen', ev.map((e) => e[0].toExponential(2)).join(' '));
  for (let r = 1; r <= K; r++) {
    let worst = 0;
    const basis = ev.slice(0, r).map(([, j]) => V.map((row) => row[j]));
    for (const [a, key] of GRID_KEYS.entries()) for (let i = 0; i < n; i++) {
      let e2 = 0; for (let d = 0; d < 3; d++) { let rec = 0; for (const bv of basis) { let comp = 0; for (let c = 0; c < K; c++) comp += bv[c] * L.grid[GRID_KEYS[c]][i * 3 + d]; rec += comp * bv[a]; } e2 += (rec - L.grid[key][i * 3 + d]) ** 2; }
      worst = Math.max(worst, Math.sqrt(e2));
    }
    console.log('components', r, 'worst error mm', (worst * 1000).toFixed(2));
  }
}
