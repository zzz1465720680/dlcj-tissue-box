import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {prepareDisplayModel,meshIdentity} from '../lib/product-assets.ts';

// A temporary, uncompressed copy lets the baker read the exact approved mesh.
// This does not modify any vertex, normal, UV, index or source model file.
globalThis.FileReader??=class{
  readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}
};
const sourcePath='public/models/revision7/tissuebox-r7.glb';
const bytes=await fs.readFile(sourcePath),sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
prepareDisplayModel(gltf.scene);
gltf.scene.traverse(object=>{if(object.isMesh)Object.assign(object.userData,meshIdentity(object));});
const raw=Buffer.from(await new GLTFExporter().parseAsync(gltf.scene,{binary:true,onlyVisible:false}));
const out='G:/DLCJ/output/surface-refinement-20260929';
await fs.writeFile(out+'/bake-input.glb',raw);
await fs.writeFile(out+'/bake-source.json',JSON.stringify({source:sourcePath,sha256:sha(bytes),rawBytes:raw.length},null,2));
if(sha(await fs.readFile(sourcePath))!==sha(bytes))throw new Error('Source changed');
console.log('Read-only bake input prepared. Original model hash: '+sha(bytes));
