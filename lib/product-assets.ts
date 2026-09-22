import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Part} from './design';

export type ProductAssets={template:THREE.Group;normal:THREE.Texture;roughness:THREE.Texture};
export type ProductRole='surface'|'inside'|'edge'|'thread'|'label';
export function meshIdentity(mesh:THREE.Mesh):{part:Part|'label';role:ProductRole}{
  let node:THREE.Object3D|null=mesh;
  while(node&&!node.userData.role)node=node.parent;
  if(!node)throw new Error('Unmapped revision7 mesh: '+mesh.name);
  const inside=!Array.isArray(mesh.material)&&mesh.material.name==='inside_suede';
  return {part:node.userData.part,role:inside?'inside':node.userData.role};
}

/** Runtime-only, lossless preparation. The versioned GLB keeps Cut_pattern.
 * Do not upload unused zero-weight morph textures, or submit separate draw calls
 * for curves that share a part/material. No surface/normal/UV/index is simplified.
 */
export function prepareDisplayModel(root:THREE.Group){
  root.updateMatrixWorld(true);
  const staticGeometries=new Map<THREE.BufferGeometry,THREE.BufferGeometry>();
  const curves=new Map<string,{identity:ReturnType<typeof meshIdentity>;meshes:THREE.Mesh[]}>();
  const identityMatrix=new THREE.Matrix4();
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const identity=meshIdentity(object),source=object.geometry as THREE.BufferGeometry;
    if(identity.role==='surface'||identity.role==='inside'){
      for(const name of ['uv','uv1','uv2','_web_metric'])if(!source.getAttribute(name))throw new Error(`${object.name}: missing ${name}`);
      if(object.morphTargetInfluences?.some(value=>value!==0))throw new Error('Expected approved folded revision7');
    }
    if(Object.keys(source.morphAttributes).length){
      let geometry=staticGeometries.get(source);
      if(!geometry){
        geometry=new THREE.BufferGeometry();
        for(const [key,attribute] of Object.entries(source.attributes))geometry.setAttribute(key,attribute);
        geometry.setIndex(source.index);
        geometry.groups=source.groups.map(group=>({...group}));
        geometry.setDrawRange(source.drawRange.start,source.drawRange.count);
        geometry.computeBoundingBox();geometry.computeBoundingSphere();
        staticGeometries.set(source,geometry);
      }
      object.geometry=geometry;
      object.morphTargetInfluences=undefined;object.morphTargetDictionary=undefined;
    }else{source.computeBoundingBox();source.computeBoundingSphere();}
    if(identity.role==='edge'||identity.role==='thread'){
      // Current saved scene exports identity object transforms. Fall back to
      // separate meshes if a future asset does not, rather than rounding vertices.
      if(!object.matrixWorld.equals(identityMatrix))return;
      const key=identity.role+':'+identity.part;
      if(!curves.has(key))curves.set(key,{identity,meshes:[]});
      curves.get(key)!.meshes.push(object);
    }
  });
  for(const {identity,meshes} of curves.values()){
    if(meshes.length<2)continue;
    const geometry=mergeGeometries(meshes.map(mesh=>mesh.geometry),false);
    if(!geometry)continue;
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const merged=new THREE.Mesh(geometry,meshes[0].material);
    merged.name=`revision7_${identity.role}_${identity.part}`;
    merged.userData={...identity,revision:7,sourceNames:meshes.map(mesh=>mesh.userData.sourceName??mesh.name)};
    root.add(merged);for(const mesh of meshes)mesh.removeFromParent();
  }
  return root;
}

let promise:Promise<ProductAssets>|null=null;
export function loadProductAssets(){
  if(!promise){
    const loader=new THREE.TextureLoader();
    promise=Promise.all([
      import('three/addons/libs/meshopt_decoder.module.js').then(({MeshoptDecoder})=>new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('/models/revision7/tissuebox-r7.glb')),
      loader.loadAsync('/models/leather-normal.png'),loader.loadAsync('/models/leather-roughness.png'),
    ]).then(([g,normal,roughness])=>{
      for(const texture of [normal,roughness]){texture.flipY=false;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.colorSpace=THREE.NoColorSpace;texture.anisotropy=8;texture.channel=1;}
      const parts=new Set<string>();g.scene.traverse(o=>{if(o.userData.part)parts.add(o.userData.part);});
      for(const part of ['body','corner0','corner1','corner2','corner3','trim','label'])if(!parts.has(part))throw new Error('Missing revision7 part: '+part);
      return {template:prepareDisplayModel(g.scene),normal,roughness};
    }).catch(error=>{promise=null;throw error;});
  }
  return promise;
}
