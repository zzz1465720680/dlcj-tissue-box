import * as THREE from 'three';
import type {Artwork,Design,Part,Surface} from './design';
import {PARTS} from './design';
import {loadArt,paintArtwork} from './artwork';
import {applyPerforation} from './perforation';
import {meshIdentity,type ProductAssets} from './product-assets';

function sameArt(a:Artwork[],b:Artwork[]){
  if(a===b)return true;if(a.length!==b.length)return false;
  return a.every((item,i)=>{
    const other=b[i];
    if(item.id!==other.id||item.kind!==other.kind||item.src!==other.src||item.text!==other.text||item.x!==other.x||item.y!==other.y||item.scale!==other.scale||item.rotation!==other.rotation||item.color!==other.color||item.width!==other.width||item.erase!==other.erase)return false;
    if(item.points===other.points)return true;
    return (item.points?.length??0)===(other.points?.length??0)&&(item.points??[]).every((p,j)=>p[0]===other.points![j][0]&&p[1]===other.points![j][1]);
  });
}
function canvasTexture(width:number,height:number){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const texture=new THREE.CanvasTexture(canvas);texture.flipY=false;texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;return texture;
}
function setPerforated(material:THREE.MeshStandardMaterial,perforated:boolean){
  material.alphaTest=perforated?.5:0;
  if(perforated)applyPerforation(material);
  else{
    if(material.defines)delete material.defines.USE_UV2;
    material.onBeforeCompile=()=>{};material.customProgramCacheKey=()=> 'revision7-solid-v1';
  }
  material.needsUpdate=true;
}
function paintSurface(material:THREE.MeshPhysicalMaterial,surface:Surface){
  if(!surface.art.length){material.map?.dispose();material.map=null;material.color.set(surface.color);return;}
  material.color.set('#ffffff');material.map??=canvasTexture(1024,1024);
  const canvas=material.map.image as HTMLCanvasElement,ctx=canvas.getContext('2d')!;
  ctx.fillStyle=surface.color;ctx.fillRect(0,0,1024,1024);
  const overlay=document.createElement('canvas');overlay.width=overlay.height=1024;
  paintArtwork(overlay.getContext('2d')!,surface.art);ctx.drawImage(overlay,0,0);material.map.needsUpdate=true;
}
export async function prepareDesignImages(design:Design){
  const sources=new Set(Object.values(design.parts).flatMap(s=>s.art.flatMap(a=>a.src?[a.src]:[])));
  if(design.label.image)sources.add(design.label.image);
  const loaded=await Promise.all([...sources].map(async src=>[src,await loadArt(src)] as const));
  return new Map(loaded);
}

type PartMaterials={surface:THREE.MeshPhysicalMaterial;edge:THREE.MeshStandardMaterial;thread:THREE.MeshStandardMaterial;depth:THREE.MeshDepthMaterial;previous?:Surface;meshes:THREE.Mesh[]};
export type ProductRuntime={
  group:THREE.Group;pickables:THREE.Mesh[];parts:Record<Part,PartMaterials>;
  inside:THREE.MeshStandardMaterial;label:THREE.MeshStandardMaterial;labelMeshes:THREE.Mesh[];
  tissue:THREE.Mesh;previousLabel?:Design['label'];previousTissue:boolean;
  materialUpdates:number;artworkPaints:number;
};
function tissueMesh(){
  const position:number[]=[],uv:number[]=[],indices:number[]=[];const nx=40,ny=25;
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){const u=i/nx,v=j/ny;position.push((u-.5)*(.077+.015*v),.058+v*.043+.0018*Math.sin(u*16)*v,.0008+v*v*.012+.006*Math.sin(u*14+v*3)*v);uv.push(u,v);}
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i;indices.push(a,a+1,a+nx+1,a+1,a+nx+2,a+nx+1);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:'#f8f8f3',roughness:1,side:THREE.DoubleSide}));mesh.name='tissue';mesh.castShadow=true;mesh.visible=false;return mesh;
}
export function createProduct(assets:ProductAssets):ProductRuntime{
  const parts={} as Record<Part,PartMaterials>;
  for(const part of PARTS)parts[part]={
    surface:new THREE.MeshPhysicalMaterial({normalMap:assets.normal,roughnessMap:assets.roughness,metalness:0,ior:1.46,specularIntensity:.5,clearcoat:.035,clearcoatRoughness:.45,sheenRoughness:.85,side:THREE.DoubleSide}),
    edge:new THREE.MeshStandardMaterial({roughness:.36}),thread:new THREE.MeshStandardMaterial({roughness:.82}),
    depth:applyPerforation(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,alphaTest:.5,side:THREE.DoubleSide}),false),meshes:[],
  };
  const product:ProductRuntime={group:assets.template.clone(true),parts,pickables:[],inside:new THREE.MeshStandardMaterial({color:'#c6c0b5',roughness:.94,side:THREE.DoubleSide}),label:new THREE.MeshStandardMaterial({roughness:.95,side:THREE.DoubleSide}),labelMeshes:[],tissue:tissueMesh(),previousTissue:false,materialUpdates:0,artworkPaints:0};
  product.group.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const {part,role}=meshIdentity(object);object.userData.selectPart=part;object.castShadow=true;object.receiveShadow=true;
    if(part==='label'){object.material=product.label;product.labelMeshes.push(object);product.pickables.push(object);return;}
    const set=parts[part];
    object.material=role==='inside'?product.inside:role==='edge'?set.edge:role==='thread'?set.thread:set.surface;
    if(role==='inside'||role==='surface'){set.meshes.push(object);product.pickables.push(object);}
  });
  product.group.add(product.tissue);product.group.scale.setScalar(20);product.group.position.y=-.59;return product;
}

/** Update only changed uniforms/canvases; keep meshes, GPU programs and textures. */
export function updateProduct(product:ProductRuntime,design:Design,assets:ProductAssets,showTissue:boolean,images:Map<string,HTMLImageElement>){
  let changed=false,shadows=false;
  for(const part of PARTS){
    const set=product.parts[part],next=design.parts[part],old=set.previous,material=set.surface;
    const artChanged=!old||!sameArt(old.art,next.art),paintChanged=!old||old.color!==next.color||artChanged;
    const featuresChanged=!old||old.material!==next.material||old.perforated!==next.perforated||!!old.art.length!==!!next.art.length;
    if(paintChanged){paintSurface(material,next);if(next.art.length)product.artworkPaints++;changed=true;}
    if(!old||old.material!==next.material){
      const strength=next.material==='smooth'?.18:next.material==='suede'?1.3:1.1;
      material.normalScale.set(strength,strength);material.roughness=next.material==='grain'?1:next.material==='smooth'?.32:.9;
      material.roughnessMap=next.material==='grain'?assets.roughness:null;material.clearcoat=next.material==='smooth'?.12:.035;material.sheen=next.material==='suede'?.3:0;changed=true;
    }
    if(!old||old.perforated!==next.perforated){
      setPerforated(material,next.perforated);
      for(const mesh of set.meshes)mesh.customDepthMaterial=next.perforated?set.depth:undefined;
      if(part==='body')setPerforated(product.inside,next.perforated);
      shadows=true;changed=true;
    }
    if(featuresChanged)material.needsUpdate=true;
    if(!old||old.edge!==next.edge){set.edge.color.set(next.edge);changed=true;}
    if(!old||old.thread!==next.thread){set.thread.color.set(next.thread);changed=true;}
    if(paintChanged||featuresChanged||old?.edge!==next.edge||old?.thread!==next.thread)product.materialUpdates++;
    set.previous=next;
  }
  const previous=product.previousLabel,label=design.label;
  if(!previous||previous.enabled!==label.enabled){for(const mesh of product.labelMeshes)mesh.visible=label.enabled;changed=true;shadows=true;}
  if(label.enabled&&(!product.label.map||!previous||previous.color!==label.color||previous.ink!==label.ink||previous.text!==label.text||previous.image!==label.image)){
    product.label.map??=canvasTexture(512,256);
    const canvas=product.label.map.image as HTMLCanvasElement,ctx=canvas.getContext('2d')!;
    ctx.fillStyle=label.color;ctx.fillRect(0,0,512,256);
    if(label.image){const im=images.get(label.image)!;const scale=Math.min(450/im.width,200/im.height);ctx.drawImage(im,(512-im.width*scale)/2,(256-im.height*scale)/2,im.width*scale,im.height*scale);}
    else{ctx.fillStyle=label.ink;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 66px sans-serif';ctx.fillText(label.text,270,130,440);}
    product.label.map.needsUpdate=true;product.label.needsUpdate=true;changed=true;
  }
  product.previousLabel=label;
  if(showTissue!==product.previousTissue){product.tissue.visible=showTissue;product.previousTissue=showTissue;changed=true;shadows=true;}
  return {changed,shadows};
}
export function highlightProduct(product:ProductRuntime,selected:string){
  for(const part of PARTS)for(const material of [product.parts[part].surface,product.parts[part].edge,product.parts[part].thread,...(part==='body'?[product.inside]:[])]){material.emissive.set('#365b66');material.emissiveIntensity=part===selected?.018:0;}
  product.label.emissive.set('#365b66');product.label.emissiveIntensity=selected==='label'?.018:0;
}
export function disposeProduct(product:ProductRuntime){
  const materials=[...Object.values(product.parts).flatMap(p=>[p.surface,p.edge,p.thread,p.depth]),product.inside,product.label,product.tissue.material as THREE.Material];
  for(const material of materials){if('map'in material&&material.map instanceof THREE.CanvasTexture)material.map.dispose();material.dispose();}
  product.tissue.geometry.dispose();
}
