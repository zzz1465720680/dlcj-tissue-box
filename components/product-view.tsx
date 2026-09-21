'use client';
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Design,Part,Surface} from '@/lib/design';
import {loadArt,paintArtwork} from '@/lib/artwork';
export {loadArt,paintArtwork} from '@/lib/artwork';
export type ProductHandle={view:(name:string)=>void;zoom:(n:number)=>void;capture:()=>string;captureViews:(design?:Design)=>Promise<string[]>};
type Props={design:Design;selected:Part|string;onSelect:(p:Part|string)=>void;onReady?:(h:ProductHandle)=>void;showTissue:boolean;rotating:boolean};
type Assets={template:THREE.Group;normal:THREE.Texture;roughness:THREE.Texture;holes:THREE.Texture;rim:THREE.Texture};
let assetsPromise:Promise<Assets>|null=null;
function loadAssets(){
  if(!assetsPromise){const tl=new THREE.TextureLoader();assetsPromise=Promise.all([
    new GLTFLoader().loadAsync('/models/tissuebox-v2.glb'),
    tl.loadAsync('/models/leather-normal.png'),tl.loadAsync('/models/leather-roughness.png'),tl.loadAsync('/models/perforation-mask.png'),tl.loadAsync('/models/perforation-rim.png')
  ]).then(([g,n,r,h,rim])=>{for(const t of [n,r,h,rim]){t.flipY=false;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.NoColorSpace;t.anisotropy=8;}n.channel=r.channel=1;h.channel=rim.channel=2;return {template:g.scene,normal:n,roughness:r,holes:h,rim};}).catch(e=>{assetsPromise=null;throw e});}
  return assetsPromise;
}
function textureFor(s:Surface){
  const c=document.createElement('canvas');c.width=c.height=1024;const ctx=c.getContext('2d')!;ctx.fillStyle=s.color;ctx.fillRect(0,0,1024,1024);
  const art=document.createElement('canvas');art.width=art.height=1024;paintArtwork(art.getContext('2d')!,s.art);ctx.drawImage(art,0,0);
  const map=new THREE.CanvasTexture(c);map.flipY=false;map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;return map;
}
function partOf(name:string):Part{const corner=name.match(/corner([0-3])/);return corner?('corner'+corner[1]) as Part:name.includes('trim')?'trim':'body';}
function surfaceMaterial(s:Surface,assets:Assets){
  const material=new THREE.MeshPhysicalMaterial({map:textureFor(s),normalMap:assets.normal,
    normalScale:new THREE.Vector2(s.material==='smooth'?.18:s.material==='suede'?1.3:1.1,s.material==='smooth'?.18:s.material==='suede'?1.3:1.1),
    roughness:s.material==='grain'?1:s.material==='smooth'?.32:.9,roughnessMap:s.material==='grain'?assets.roughness:null,
    metalness:0,ior:1.46,specularIntensity:.5,clearcoat:s.material==='smooth'?.12:.035,clearcoatRoughness:.45,
    sheen:s.material==='suede'?.3:0,sheenRoughness:.85,
    alphaMap:s.perforated?assets.holes:null,alphaTest:s.perforated?.5:0,side:THREE.DoubleSide});
  if(s.perforated){material.onBeforeCompile=shader=>{
    shader.uniforms.uHoleRim={value:assets.rim};
    shader.fragmentShader='uniform sampler2D uHoleRim;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      float leatherH = texture2D(uHoleRim, vAlphaMapUv).r * 0.003;
      vec3 leatherSX = dFdx(-vViewPosition), leatherSY = dFdy(-vViewPosition);
      vec3 leatherR1 = cross(leatherSY, normal), leatherR2 = cross(normal, leatherSX);
      float leatherDet = dot(leatherSX, leatherR1);
      vec3 leatherGrad = sign(leatherDet) * (dFdx(leatherH)*leatherR1 + dFdy(leatherH)*leatherR2);
      normal = normalize(abs(leatherDet)*normal - leatherGrad);
    `);
  };material.customProgramCacheKey=()=> 'perforated-leather-rim-v1';}
  return material;
}
async function labelMaterial(d:Design){
  const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d')!;ctx.fillStyle=d.label.color;ctx.fillRect(0,0,512,256);
  if(d.label.image){const im=await loadArt(d.label.image);const scale=Math.min(450/im.width,200/im.height);ctx.drawImage(im,(512-im.width*scale)/2,(256-im.height*scale)/2,im.width*scale,im.height*scale);}
  else{ctx.fillStyle=d.label.ink;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 66px sans-serif';ctx.fillText(d.label.text,270,130,440);}
  const map=new THREE.CanvasTexture(c);map.flipY=false;map.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshStandardMaterial({map,roughness:.95,side:THREE.DoubleSide});
}
function tissueMesh(){
  const pos:number[]=[],uv:number[]=[],idx:number[]=[];const nx=40,ny=25;
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){const u=i/nx,v=j/ny;pos.push((u-.5)*(.077+.015*v),.058+v*.043+.0018*Math.sin(u*16)*v,.0008+v*v*.012+.006*Math.sin(u*14+v*3)*v);uv.push(u,v);}
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i;idx.push(a,a+1,a+nx+1,a+1,a+nx+2,a+nx+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
  const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:'#f8f8f3',roughness:1,side:THREE.DoubleSide}));m.name='tissue';m.castShadow=true;m.userData.ownedGeometry=true;return m;
}
async function makeProduct(d:Design,assets:Assets,showTissue:boolean){
  await Promise.all(Object.values(d.parts).flatMap(s=>s.art.filter(a=>a.src).map(a=>loadArt(a.src!))));
  const group=assets.template.clone(true);const mats=new Map<string,THREE.Material>();const label=await labelMaterial(d);
  group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;
    let node:THREE.Object3D|null=o;let name=o.name;
    while(node){if(node.userData.part){name=node.userData.part;break}node=node.parent;}
    const part=partOf(name);const original=Array.isArray(o.material)?o.material:[o.material];
    const materialFor=(old:THREE.Material)=>{
      if(name==='label')return label;
      if(old.name==='inside_suede'){if(!mats.has('inside'))mats.set('inside',new THREE.MeshStandardMaterial({color:'#c6c0b5',roughness:.94,side:THREE.DoubleSide}));return mats.get('inside')!;}
      const type=name.startsWith('edge_')?'edge':name.startsWith('thread_')?'thread':'surface';const key=type+part;
      if(!mats.has(key)){const s=d.parts[part];mats.set(key,type==='surface'?surfaceMaterial(s,assets):new THREE.MeshStandardMaterial({color:type==='edge'?s.edge:s.thread,roughness:type==='edge'?.36:.82}));}
      return mats.get(key)!;
    };
    o.material=Array.isArray(o.material)?original.map(materialFor):materialFor(original[0]);
    o.userData.selectPart=name==='label'?'label':part;o.castShadow=true;o.receiveShadow=true;
    if(name==='label')o.visible=d.label.enabled;
    if(d.parts[part].perforated&&!(name.startsWith('edge_')||name.startsWith('thread_'))&&name!=='label')o.customDepthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,alphaMap:assets.holes,alphaTest:.5});
  });
  if(showTissue)group.add(tissueMesh());group.scale.setScalar(20);group.position.y=-.59;
  return group;
}
function disposeProduct(g:THREE.Group){
  const materials=new Set<THREE.Material>();const maps=new Set<THREE.Texture>();
  g.traverse(o=>{if(o instanceof THREE.Mesh){if(o.userData.ownedGeometry)o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);if('map'in m&&m.map instanceof THREE.CanvasTexture)maps.add(m.map);}o.customDepthMaterial?.dispose();}});
  materials.forEach(m=>m.dispose());maps.forEach(m=>m.dispose());
}
type SceneState={scene:THREE.Scene;camera:THREE.PerspectiveCamera;renderer:THREE.WebGLRenderer;controls:OrbitControls;product:THREE.Group|null;assets:Assets;generation:number;};
export default function ProductView({design,selected,onSelect,onReady,showTissue,rotating}:Props){
  const host=useRef<HTMLDivElement>(null);const state=useRef<SceneState|null>(null);const latest=useRef({design,showTissue,rotating,onSelect,onReady});latest.current={design,showTissue,rotating,onSelect,onReady};
  const [error,setError]=useState(''),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
  useEffect(()=>{if(!host.current)return;let cancelled=false;let cleanup=()=>{};
    (async()=>{let renderer:THREE.WebGLRenderer;
      try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});}catch{setError('3D 显示无法启动，请开启浏览器硬件加速后重试。');setLoading(false);return;}
      renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.90;
      const el=host.current!;el.appendChild(renderer.domElement);const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(34,1,.02,80);camera.position.set(3.1,2.55,3.55);
      const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;controls.enablePan=false;controls.minDistance=2.8;controls.maxDistance=10;controls.autoRotateSpeed=.6;
      const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room,.04);scene.environment=env.texture;scene.environmentIntensity=.38;room.dispose();pmrem.dispose();
      scene.add(new THREE.HemisphereLight(0xffffff,0x929b9c,.28));
      const key=new THREE.DirectionalLight(0xfffcf5,1.05);key.position.set(-3,5,4);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-3;key.shadow.camera.right=3;key.shadow.camera.top=3;key.shadow.camera.bottom=-3;key.shadow.normalBias=.009;key.shadow.bias=-.00015;key.shadow.radius=5;scene.add(key);
      const fill=new THREE.DirectionalLight(0xddeaff,.25);fill.position.set(3,2,-2);scene.add(fill);
      const floor=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.ShadowMaterial({opacity:.09}));floor.rotation.x=-Math.PI/2;floor.position.y=-.603;floor.receiveShadow=true;scene.add(floor);
      const resize=()=>{if(!el.clientWidth||!el.clientHeight)return;renderer.setSize(el.clientWidth,el.clientHeight);camera.aspect=el.clientWidth/el.clientHeight;camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(el);resize();
      let start={x:0,y:0};const down=(e:PointerEvent)=>{start={x:e.clientX,y:e.clientY}};const up=(e:PointerEvent)=>{if(!state.current?.product||Math.hypot(e.clientX-start.x,e.clientY-start.y)>5)return;const r=renderer.domElement.getBoundingClientRect();const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);const hit=ray.intersectObjects(state.current.product.children,true).find(h=>h.object.visible&&h.object.userData.selectPart);if(hit)latest.current.onSelect(hit.object.userData.selectPart);};renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',up);
      renderer.setAnimationLoop(()=>{controls.autoRotate=latest.current.rotating;controls.update();renderer.render(scene,camera)});
      cleanup=()=>{renderer.setAnimationLoop(null);observer.disconnect();controls.dispose();if(state.current?.product)disposeProduct(state.current.product);env.dispose();floor.geometry.dispose();(floor.material as THREE.Material).dispose();renderer.dispose();renderer.domElement.remove();state.current=null;};
      try{const assets=await loadAssets();if(cancelled){cleanup();return;}
        const s:SceneState={scene,camera,controls,renderer,product:null,assets,generation:0};state.current=s;
        s.product=await makeProduct(latest.current.design,assets,latest.current.showTissue);if(cancelled){disposeProduct(s.product);cleanup();return;}scene.add(s.product);setLoading(false);setError('');
        const view=(name:string)=>{const poses:Record<string,[number,number,number]>={hero:[3.1,2.55,3.55],top:[0,5.8,.001],bottom:[0,-5.8,.001],long:[0,.18,4],short:[4.1,.18,0]};controls.enableDamping=false;
          if(name==='grain'){controls.minDistance=.65;camera.position.set(.20,.26,2.16);controls.target.set(0,0,1.04);key.position.set(-2.4,1.5,1.6);key.intensity=1.2;fill.intensity=.10;scene.environmentIntensity=.16;}
          else{controls.minDistance=2.8;camera.position.set(...(poses[name]??poses.hero));controls.target.set(0,0,0);key.position.set(-3,5,4);key.intensity=1.05;fill.intensity=.25;scene.environmentIntensity=.38;}
          controls.update();controls.enableDamping=true;renderer.render(scene,camera);};
        latest.current.onReady?.({view,zoom:n=>{camera.position.multiplyScalar(n);controls.update()},capture:()=>{renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png')},captureViews:async(d?:Design)=>{
          const oldPos=camera.position.clone(),oldTarget=controls.target.clone(),oldSize=renderer.getSize(new THREE.Vector2()),oldRatio=renderer.getPixelRatio(),oldAspect=camera.aspect,oldMin=controls.minDistance,original=s.product;let exported:THREE.Group|null=null;const result:string[]=[];
          try{if(d){exported=await makeProduct(d,assets,false);if(original)original.visible=false;scene.add(exported);}renderer.setPixelRatio(1);renderer.setSize(1100,850,false);camera.aspect=1100/850;camera.updateProjectionMatrix();
            for(const name of ['hero','top','long','short','bottom']){view(name);camera.position.multiplyScalar(1.14);controls.enableDamping=false;controls.update();renderer.render(scene,camera);result.push(renderer.domElement.toDataURL('image/png'));}return result;
          }finally{if(exported){scene.remove(exported);disposeProduct(exported);}if(original)original.visible=true;renderer.setPixelRatio(oldRatio);renderer.setSize(oldSize.x,oldSize.y,false);camera.aspect=oldAspect;camera.updateProjectionMatrix();camera.position.copy(oldPos);controls.minDistance=oldMin;controls.target.copy(oldTarget);controls.update();controls.enableDamping=true;}
        }});
      }catch(e){if(!cancelled){setError('模型未能载入，请检查网络后重试。');setLoading(false);}}
    })();return()=>{cancelled=true;cleanup()};
  },[retry]);
  useEffect(()=>{const s=state.current;if(!s)return;const generation=++s.generation;makeProduct(design,s.assets,showTissue).then(product=>{if(state.current!==s||generation!==s.generation){disposeProduct(product);return;}if(s.product){s.scene.remove(s.product);disposeProduct(s.product);}s.product=product;s.scene.add(product)}).catch(()=>setError('有一张图案未能载入，请重新添加。'));},[design,showTissue]);
  useEffect(()=>{state.current?.product?.traverse(o=>{if(o instanceof THREE.Mesh){for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshStandardMaterial){m.emissive.set('#365b66');m.emissiveIntensity=o.userData.selectPart===selected?.018:0;}}});},[selected]);
  return <div ref={host} className="product-canvas" aria-label="按实物裁片制作的纸巾盒 3D 模型">{loading&&<div className="model-loading">正在载入皮革模型…</div>}{error&&<div className="model-error">{error}<button className="button" onClick={()=>{setError('');setLoading(true);setRetry(v=>v+1)}}>重新载入</button></div>}</div>;
}



