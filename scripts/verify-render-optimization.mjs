import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {prepareDisplayModel,meshIdentity} from '../lib/product-assets.ts';
import {initialDesign,preset,PARTS} from '../lib/design.ts';
import {designSchema} from '../lib/schema.ts';

const file='public/models/revision7/tissuebox-r7.glb',bytes=fs.readFileSync(file);
const hash=b=>createHash('sha256').update(b).digest('hex');
const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
function inspect(root){
  const groups=new Map();let meshes=0,triangles=0,morphs=0;
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;meshes++;const {part,role}=meshIdentity(mesh),key=part+':'+role;
    if(!groups.has(key))groups.set(key,new Map());
    const records=groups.get(key),geometry=mesh.geometry,index=geometry.index;
    triangles+=index.count/3;morphs+=geometry.morphAttributes.position?.length??0;
    for(const name of Object.keys(geometry.attributes).sort()){
      if(!records.has(name))records.set(name,createHash('sha256'));
      const attr=geometry.getAttribute(name),expanded=new Float32Array(index.count*attr.itemSize);
      for(let i=0;i<index.count;i++)for(let j=0;j<attr.itemSize;j++)expanded[i*attr.itemSize+j]=attr.array[index.getX(i)*attr.itemSize+j];
      records.get(name).update(new Uint8Array(expanded.buffer));
    }
  });
  return {meshes,triangles,morphs,attributes:Object.fromEntries([...groups].map(([key,records])=>[key,Object.fromEntries([...records].map(([name,digest])=>[name,digest.digest('hex')]))]))};
}
const before=inspect(gltf.scene);prepareDisplayModel(gltf.scene);const after=inspect(gltf.scene);
assert.equal(before.triangles,after.triangles);
assert.deepEqual(before.attributes,after.attributes,'Expanded triangle positions, normals and every UV/metric must match');
assert.equal(after.morphs,0);assert(after.meshes<before.meshes);
assert.equal(hash(fs.readFileSync(file)),hash(bytes));
const sourceAudit=JSON.parse(fs.readFileSync('checks/revision7/export-audit.json','utf8'));
for(const [path,digest] of Object.entries(sourceAudit.protected_files)){
  if(path.endsWith('lib\\design.ts'))continue; // User explicitly requested changing presets in this task.
  assert.equal(hash(fs.readFileSync(path)),digest,path);
}
for(let i=0;i<3;i++)assert.deepEqual(designSchema.parse(preset(i)),preset(i));
assert.deepEqual(preset(0),initialDesign());
const photo=preset(1),forest=preset(2);
assert.equal(photo.parts.body.perforated,false);assert.equal(photo.parts.body.material,'grain');
for(const part of PARTS.filter(p=>p!=='body'))assert.equal(photo.parts[part].perforated,true);
assert.equal(forest.parts.body.color,'#365d52');
const report={passed:true,before:{meshes:before.meshes,triangles:before.triangles,morphMeshes:before.morphs},after:{meshes:after.meshes,triangles:after.triangles,morphMeshes:after.morphs},triangleAttributeHashesIdentical:true,glbSha256:hash(bytes),sourceAndHostingUnchanged:true,presetVersion1Compatible:true,baselineUnchanged:true,presets:[photo.name,forest.name]};
fs.writeFileSync('checks/revision7/performance-0922/runtime-parity.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
