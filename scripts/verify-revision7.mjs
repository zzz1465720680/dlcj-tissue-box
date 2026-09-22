import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

function read(path){const b=fs.readFileSync(path),n=b.readUInt32LE(12);return {bytes:b,json:JSON.parse(b.subarray(20,20+n)),bin:b.subarray(28+n)};}
const raw=read('checks/revision7/tissuebox-r7-uncompressed.glb');
const packed=read('public/models/revision7/tissuebox-r7.glb');
await MeshoptDecoder.ready;
for(let i=0;i<packed.json.bufferViews.length;i++){
  const v=packed.json.bufferViews[i],e=v.extensions.EXT_meshopt_compression;
  const output=new Uint8Array(v.byteLength);
  MeshoptDecoder.decodeGltfBuffer(output,e.count,e.byteStride,packed.bin.subarray(e.byteOffset,e.byteOffset+e.byteLength),e.mode,e.filter);
  const original=raw.json.bufferViews[i];
  assert.deepEqual(Buffer.from(output),raw.bin.subarray(original.byteOffset,original.byteOffset+original.byteLength),`bufferView ${i}`);
}
const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(packed.bytes.buffer.slice(packed.bytes.byteOffset,packed.bytes.byteOffset+packed.bytes.byteLength),'');
const parts=new Set(),roles={},surface=[];
gltf.scene.traverse(o=>{
  if(o.userData.part)parts.add(o.userData.part);
  if(o.userData.role)roles[o.userData.role]=(roles[o.userData.role]??0)+1;
  if(!o.isMesh)return;
  let node=o;while(node&&!node.userData.role)node=node.parent;
  assert(node,`unmapped mesh ${o.name}`);
  if(node.userData.role==='surface'){
    for(const a of ['uv','uv1','uv2','_web_metric'])assert(o.geometry.getAttribute(a),`${o.name} ${a}`);
    assert(o.morphTargetDictionary.Cut_pattern!==undefined);
    assert(o.morphTargetInfluences.every(x=>x===0),`${o.name} must start folded`);
    surface.push({name:o.name,part:node.userData.part,vertices:o.geometry.attributes.position.count,triangles:o.geometry.index.count/3});
  }
});
assert.deepEqual([...parts].sort(),['body','corner0','corner1','corner2','corner3','trim','label'].sort());
assert(!packed.json.cameras&&!packed.json.lights&&!packed.json.images);
assert(packed.json.materials.some(m=>m.name==='inside_suede'));
const audit=JSON.parse(fs.readFileSync('checks/revision7/export-audit.json','utf8'));
for(const [file,hash] of Object.entries(audit.protected_files))assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash,`protected ${file}`);
const report={lossless_buffer_views_verified:packed.json.bufferViews.length,decoded_bytes_identical:true,loader:'Three.js GLTFLoader + MeshoptDecoder',parts:[...parts],roles,surface,
  default_folded:true,protected_files_unchanged:true,raw_bytes:raw.bytes.length,compressed_bytes:packed.bytes.length,sha256:createHash('sha256').update(packed.bytes).digest('hex')};
fs.writeFileSync('checks/revision7/web-asset-audit.json',JSON.stringify(report,null,2));
Object.assign(audit,{uncompressed_asset_bytes:raw.bytes.length,uncompressed_asset_sha256:createHash('sha256').update(raw.bytes).digest('hex'),asset_bytes:packed.bytes.length,asset_sha256:report.sha256,lossless_compression_verified:true});
fs.writeFileSync('checks/revision7/export-audit.json',JSON.stringify(audit,null,2));
const manifestPath='public/models/revision7/manifest.json',manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
Object.assign(manifest,{asset_bytes:packed.bytes.length,asset_sha256:report.sha256,compression:'EXT_meshopt_compression, lossless, NONE filter; decoded bytes verified'});
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
console.log(JSON.stringify(report,null,2));
