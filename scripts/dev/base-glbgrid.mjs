// BASE seat: read a shipped glb's grid attributes raw (gltf-transform) and compare with the pipeline. node scripts/dev/base-glbgrid.mjs wh_f
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const name = process.argv[2] ?? 'wh_f';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(`src/assets/models/people/${name}.glb`);
const people = doc.getRoot().listScenes()[0].getExtras().people;
for (const mesh of doc.getRoot().listMeshes()) {
  const prim = mesh.listPrimitives()[0];
  const names = prim.listSemantics();
  const g = prim.getAttribute('_G02'), p = prim.getAttribute('POSITION');
  console.log(mesh.getName(), names.join(','), g ? `${g.getComponentType()} norm ${g.getNormalized()} count ${g.getCount()} max ${Math.max(...g.getArray())}` : '', 'pos', p.getComponentType(), p.getNormalized());
}
console.log('scale', people.gridScale);
