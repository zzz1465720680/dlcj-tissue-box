import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {MeshoptEncoder} from 'meshoptimizer/encoder';
import {prepareDisplayModel,meshIdentity} from '../lib/product-assets.ts';
import {createSoftShape} from '../lib/soft-shape-trial.ts';

// Exporter uses FileReader for Blobs even when an asset has no embedded images.
globalThis.FileReader??=class{
  readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}
};
const originalPath='public/models/revision7/tissuebox-r7.glb';
const source=await fs.readFile(originalPath),sha=data=>createHash('sha256').update(data).digest('hex');
const {scene}=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength),'');
prepareDisplayModel(scene);
const trial=createSoftShape(scene,mesh=>meshIdentity(mesh).part);
trial.userData.presentation='soft-shape-trial-20260928';
const raw=Buffer.from(await new GLTFExporter().parseAsync(trial,{binary:true,onlyVisible:false}));
await fs.mkdir('checks/shape-trial-20260928',{recursive:true});
await fs.writeFile('checks/shape-trial-20260928/trial-uncompressed.glb',raw);
const jsonSize=raw.readUInt32LE(12),doc=JSON.parse(raw.subarray(20,20+jsonSize)),bin=raw.subarray(28+jsonSize);
assert(!doc.images?.length);
await MeshoptEncoder.ready;await MeshoptDecoder.ready;
const indices=new Set(doc.meshes.flatMap(m=>m.primitives.map(p=>p.indices)));
const accessorForView=new Map(doc.accessors.map((accessor,id)=>[accessor.bufferView,{accessor,id}]));
const chunks=[];let offset=0,virtual=0;
for(const view of doc.bufferViews){
  const {accessor,id}=accessorForView.get(doc.bufferViews.indexOf(view));
  const data=bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength),stride=data.byteLength/accessor.count;
  assert.equal(accessor.byteOffset??0,0);assert(Number.isInteger(stride));
  const mode=indices.has(id)?'INDICES':'ATTRIBUTES';
  const packed=MeshoptEncoder.encodeGltfBuffer(data,accessor.count,stride,mode,0);
  const decoded=new Uint8Array(data.length);MeshoptDecoder.decodeGltfBuffer(decoded,accessor.count,stride,packed,mode,'NONE');
  assert.deepEqual(Buffer.from(decoded),data,'Lossless encode verification failed');
  view.buffer=1;view.byteOffset=virtual;
  view.extensions={EXT_meshopt_compression:{buffer:0,byteOffset:offset,byteLength:packed.length,byteStride:stride,count:accessor.count,mode,filter:'NONE'}};
  const padding=Buffer.alloc((4-packed.length%4)%4);chunks.push(packed,padding);offset+=packed.length+padding.length;
  virtual=(virtual+data.length+3)&~3;
}
doc.buffers=[{byteLength:offset},{byteLength:virtual,extensions:{EXT_meshopt_compression:{fallback:true}}}];
for(const field of ['extensionsUsed','extensionsRequired'])doc[field]=[...new Set([...(doc[field]??[]),'EXT_meshopt_compression'])];
const json=Buffer.from(JSON.stringify(doc)),jsonPadded=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),packedBin=Buffer.concat(chunks);
const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jsonPadded.length+packedBin.length,8);header.writeUInt32LE(jsonPadded.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(packedBin.length,0);binHeader.writeUInt32LE(0x004e4942,4);
const output=Buffer.concat([header,jsonPadded,binHeader,packedBin]);
const checked=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(output.buffer.slice(output.byteOffset,output.byteOffset+output.byteLength),'');
prepareDisplayModel(checked.scene);
const parts=new Set();checked.scene.traverse(o=>{if(o.isMesh)parts.add(meshIdentity(o).part);});
assert.deepEqual([...parts].sort(),['body','corner0','corner1','corner2','corner3','label','trim']);
assert.equal(sha(await fs.readFile(originalPath)),sha(source));
await fs.mkdir('public/models/presentation-trial',{recursive:true});
await fs.writeFile('public/models/presentation-trial/tissuebox-soft.glb',output);
const report={source:originalPath,sourceSha256:sha(source),output:'public/models/presentation-trial/tissuebox-soft.glb',outputSha256:sha(output),rawBytes:raw.length,packedBytes:output.length,allBufferViewsLossless:true,parts:[...parts],originalUnchanged:true};
await fs.writeFile('checks/shape-trial-20260928/asset-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
