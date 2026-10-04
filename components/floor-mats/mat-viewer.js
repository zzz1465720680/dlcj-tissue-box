// Website adapter of the accepted set_preview.js; geometry and material libraries stay unchanged.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createStableRendering} from './runtime/render_stability.js';
import {createFabricLibrary,FABRIC_VARIANTS} from './runtime/fabric_library.js';

export async function createMatViewer(root) {
 if(!root.isConnected)return;
 const $=selector=>root.querySelector(selector),$$=selector=>[...root.querySelectorAll(selector)];
 const canvas=$('#fm3-view'),stage=canvas.parentElement,status=$('#fm3-status');
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
 renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio,1.5),2));renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=.82;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 const scene=new THREE.Scene();scene.background=new THREE.Color('#e8e9e2');
 const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),environment=pmrem.fromScene(room,.04);
 scene.environment=environment.texture;room.dispose();pmrem.dispose();scene.environmentIntensity=.38;
 const camera=new THREE.PerspectiveCamera(35,1,.02,20),controls=new OrbitControls(camera,canvas);
 const stableRendering=createStableRendering(THREE),fabricLibrary=createFabricLibrary(THREE,{
  anisotropy:renderer.capabilities.getMaxAnisotropy(),
  textureBaseUrl:new URL('/models/floor-mats/runtime/fabrics/',window.location.href).href
 });
 const fabricMaterials=new Set(),modelTextures=new WeakMap(),libraryTextures=new Set(),materials=new Map(),originals=new WeakMap();
 const colours={Mat_Edge:'#ffcc00',Mat_Accent:'#ffcc00',Mat_Stitch:'#f9e8b6',Mat_Embroidery:'#6c4621'};
 for(const name of Object.keys(colours))colours[name]=$(`[data-color="${name}"]`).value;
 controls.enableDamping=true;controls.minDistance=.07;controls.maxDistance=8;
 const key=new THREE.DirectionalLight('#fff6df',1.75);key.position.set(-.6,1.5,.4);key.castShadow=true;
 key.shadow.mapSize.set(2048,2048);key.shadow.bias=-.0002;scene.add(key,key.target);
 scene.add(new THREE.HemisphereLight('#fffef8','#70796e',.45));
 const fill=new THREE.DirectionalLight('#eef4ff',.5);fill.position.set(.9,.5,-.7);scene.add(fill);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:'#e0e3d9',roughness:.94}));
 floor.rotation.x=-Math.PI/2;floor.position.y=-.001;floor.receiveShadow=true;scene.add(floor);
 let product,configuration,models,loadSerial=0,fabricSerial=0,currentView='hero',disposed=false,request;
 const bounds=new THREE.Box3(),center=new THREE.Vector3(),size=new THREE.Vector3();
 const materialList=name=>[...(materials.get(name)||[])];
 function setColor(name,hex) {
  colours[name]=hex;for(const m of materialList(name))m.color.set(hex);
  const input=$(`[data-color="${name}"]`);if(input)input.value=hex;
  for(const b of $$(`[data-material="${name}"] button`))b.setAttribute('aria-pressed',String(b.dataset.hex.toLowerCase()===hex.toLowerCase()));
 }
 const options=[['明黄','#ffcc00'],['酒红','#a72c3c'],['墨黑','#252925'],['米白','#e9e0ca'],['焦糖','#946243'],['藏蓝','#293d53']];
 for(const group of $$('.fm3-swatches')) {
  group.replaceChildren();const name=group.dataset.material;
  const choices=name==='Mat_Stitch'?[['奶油白','#f9e8b6'],['金黄','#d3a51b'],['酒红','#a72c3c'],['墨黑','#252925'],['纯白','#ffffff']]:name==='Mat_Embroidery'?[['原图棕','#6c4621'],['墨黑','#252925'],['奶油白','#f9e8b6'],['金黄','#d3a51b']]:options;
  for(const [label,hex] of choices){const b=document.createElement('button');b.type='button';b.className='fm3-swatch';b.style.setProperty('--c',hex);b.dataset.hex=hex;b.title=label;b.setAttribute('aria-label',label);b.onclick=()=>setColor(name,hex);group.append(b);}
 }
 for(const input of $$('[data-color]'))input.oninput=()=>setColor(input.dataset.color,input.value);
 function view(name) {
  if(!product)return;currentView=name;floor.visible=name!=='bottom';
  if(['hero','top','bottom'].includes(name)) {
   const radius=Math.max(size.length()/2,.15),fit=radius/Math.sin(THREE.MathUtils.degToRad(17.5))*1.12/Math.min(camera.aspect,1);
   controls.target.copy(center);
   const direction=name==='top'?new THREE.Vector3(0,1,.001):name==='bottom'?new THREE.Vector3(.40,-.85,.70):new THREE.Vector3(.56,.74,.88);
   camera.position.copy(center).add(direction.normalize().multiplyScalar(fit));
  } else if(configuration.id==='01_driver') {
   const presets={long:[[-.220,.317,.110],[-.150,.007,.080]],upper:[[-.346,.227,-.103],[-.146,.007,-.063]],detail:[[-.377,.247,.413],[-.177,.007,.233]],notch:[[-.22,.28,-.42],[-.07,.007,-.20]]};
   const [position,target]=presets[name];camera.position.set(...position);controls.target.set(...target);
  } else {
   const feature=configuration.features[name==='detail'?'lower':name]||configuration.features.notch;if(!feature)return;
   const target=new THREE.Vector3(feature[0],.007,-feature[1]);controls.target.copy(target);camera.position.copy(target).add(new THREE.Vector3(-.10,.25,.12));
  }
  for(const b of $$('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===name));
  controls.update();
 }
 for(const b of $$('[data-view]'))b.onclick=()=>view(b.dataset.view);
 for(const b of $$('[data-zoom]'))b.onclick=()=>{if(!product)return;const offset=camera.position.clone().sub(controls.target),distance=THREE.MathUtils.clamp(offset.length()*(b.dataset.zoom==='in'?.8:1.25),controls.minDistance,controls.maxDistance);camera.position.copy(controls.target).add(offset.normalize().multiplyScalar(distance));controls.update();};
 async function fabricChange() {
  const serial=++fabricSerial,id=$('#fm3-fabric').value,target=product,targets=[...fabricMaterials];
  const message=$('#fm3-fabric-status'),label=FABRIC_VARIANTS[id]?.label||(id==='plain'?'素色织物':'黑白千鸟格');
  delete root.dataset.fabricError;if(!targets.length){message.textContent='模型载入后应用所选面料。';return;}
  root.dataset.fabricLoading='true';message.textContent=`正在应用${label}…`;
  try {
   const asset=await fabricLibrary.prepare(id);
   if(asset){for(const tex of [asset.map,asset.normalMap]){if(disposed)tex.dispose();else libraryTextures.add(tex);}}
   if(disposed||serial!==fabricSerial||target!==product)return;
   for(const m of targets)stableRendering.fabric(m,fabricLibrary.apply(m,id,asset));
   root.dataset.fabric=id;delete root.dataset.fabricLoading;message.textContent=`当前面料：${label}`;
  } catch {if(!disposed&&serial===fabricSerial&&target===product){root.dataset.fabricError='true';delete root.dataset.fabricLoading;message.textContent='面料载入失败，保留当前效果。请重试。';}}
 }
 function bottomChange() {
  if(!product)return;const grip=$('#fm3-bottom').value==='grip';
  product.traverse(ob=>{if(ob.name.startsWith('Bottom_GripNubs'))ob.visible=grip;});
  for(const m of materialList('Mat_Bottom')){m.normalMap=grip?originals.get(m).normalMap:null;m.roughness=grip?.88:.55;m.needsUpdate=true;}
 }
 $('#fm3-fabric').onchange=fabricChange;$('#fm3-fabric-retry').onclick=fabricChange;$('#fm3-bottom').onchange=bottomChange;
 $('#fm3-reset').onclick=()=>{for(const [name,hex] of Object.entries({Mat_Edge:'#ffcc00',Mat_Accent:'#ffcc00',Mat_Stitch:'#f9e8b6',Mat_Embroidery:'#6c4621'}))setColor(name,hex);$('#fm3-fabric').value='houndstooth';$('#fm3-bottom').value='grip';fabricChange();bottomChange();view('hero');};
 function disposeModel(group) {
  const mats=new Set(),textures=new Set(modelTextures.get(group)||[]);
  group.traverse(ob=>{if(ob.isMesh){ob.geometry.dispose();for(const m of Array.isArray(ob.material)?ob.material:[ob.material])mats.add(m);}});
  for(const m of mats){for(const value of Object.values(m))if(value?.isTexture&&!value.userData.fabricLibraryOwned)textures.add(value);m.dispose();}
  for(const tex of textures)tex.dispose();
 }
 const draco=new DRACOLoader();draco.setDecoderPath('/models/floor-mats/draco/');const loader=new GLTFLoader();loader.setDRACOLoader(draco);
 async function loadModel(id) {
  if(!models||disposed)return;
  const serial=++loadSerial,next=models.find(m=>m.id===id);++fabricSerial;request?.abort();request=new AbortController();
  status.textContent=`正在载入${next.title}…`;root.dataset.loaded='false';delete root.dataset.error;
  try {
   const response=await fetch(next.url,{signal:request.signal});if(!response.ok)throw Error('模型无法读取');
   const bytes=await response.arrayBuffer();if(disposed||serial!==loadSerial)return;
   const gltf=await loader.parseAsync(bytes,'/models/floor-mats/');
   if(disposed||serial!==loadSerial){disposeModel(gltf.scene);return;}
   if(product){scene.remove(product);disposeModel(product);}product=gltf.scene;configuration=next;scene.add(product);materials.clear();fabricMaterials.clear();
   const ownedTextures=new Set();modelTextures.set(product,ownedTextures);
   product.traverse(ob=>{if(ob.isMesh){stableRendering.mesh(ob);for(const m of Array.isArray(ob.material)?ob.material:[ob.material]){if(!materials.has(m.name))materials.set(m.name,new Set());materials.get(m.name).add(m);if(!originals.has(m))originals.set(m,{normalMap:m.normalMap});for(const value of Object.values(m))if(value?.isTexture)ownedTextures.add(value);for(const k of ['map','normalMap','roughnessMap'])if(m[k])m[k].anisotropy=renderer.capabilities.getMaxAnisotropy();if(m.name==='Mat_MainFabric'){fabricMaterials.add(m);fabricLibrary.capture(m);}}}});
   for(const [name,hex] of Object.entries(colours))setColor(name,hex);
   for(const [section,name] of [['accent','Mat_Accent'],['embroidery','Mat_Embroidery'],['edge','Mat_Edge'],['stitch','Mat_Stitch'],['bottom','Mat_Bottom']])$(`#fm3-${section}-section`).hidden=!materials.has(name);
   for(const b of $$('[data-view]'))b.hidden=next.id==='all'?!['hero','top','bottom'].includes(b.dataset.view):!materials.has('Mat_Accent')&&['long','upper','detail'].includes(b.dataset.view);
   $('[data-view="notch"]').textContent=next.id==='02_passenger'?'包边转角':next.id==='03_transverse'?'转角细节':'U 型开口';
   bounds.setFromObject(product);bounds.getCenter(center);bounds.getSize(size);await fabricChange();if(disposed||serial!==loadSerial)return;bottomChange();
   const span=Math.max(size.x,size.z,1)*.75;Object.assign(key.shadow.camera,{left:-span,right:span,top:span,bottom:-span,near:.1,far:8});key.shadow.camera.updateProjectionMatrix();key.target.position.copy(center);
   root.dataset.model=id;root.dataset.loaded='true';status.textContent=`已载入${next.title} · 可独立调整配色`;view('hero');
  } catch {if(!disposed&&serial===loadSerial){status.textContent='模型载入失败，请重试或继续查看实拍图。';root.dataset.error='true';root.dataset.loaded='false';}}
 }
 $('#fm3-model').onchange=()=>loadModel($('#fm3-model').value);
 function resize() {
  if(disposed||stage.clientWidth===0)return;
  renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio,1.5),2));renderer.setSize(stage.clientWidth,stage.clientHeight,false);
  camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();
  stableRendering.viewport({height:stage.clientHeight,renderPixelRatio:renderer.getPixelRatio(),displayPixelRatio:devicePixelRatio,fov:camera.fov});
  if(product&&['hero','top','bottom'].includes(currentView))view(currentView);
 }
 const observer=new ResizeObserver(resize);observer.observe(stage);resize();
 const contextLost=event=>{event.preventDefault();root.dataset.error='true';root.dataset.loaded='false';status.textContent='三维显示已暂停，请重试或查看实拍图。';};
 canvas.addEventListener('webglcontextlost',contextLost);
 fetch('/models/floor-mats/models.json').then(r=>{if(!r.ok)throw Error('模型列表暂不可用');return r.json();}).then(data=>{if(disposed)return;models=data;loadModel($('#fm3-model').value);}).catch(()=>{if(!disposed){status.textContent='模型列表载入失败，请重试。';root.dataset.error='true';}});
 renderer.setAnimationLoop(()=>{if(!disposed&&!document.hidden){controls.update();renderer.render(scene,camera);}});
 return {
  dispose(){if(disposed)return;disposed=true;++loadSerial;++fabricSerial;request?.abort();observer.disconnect();renderer.setAnimationLoop(null);canvas.removeEventListener('webglcontextlost',contextLost);controls.dispose();draco.dispose();if(product)disposeModel(product);for(const tex of libraryTextures)tex.dispose();environment.dispose();floor.geometry.dispose();floor.material.dispose();renderer.dispose();for(const el of $$('button,select,input')){if(!el.classList.contains('fm3-retry')){el.onclick=null;el.onchange=null;el.oninput=null;}}},
  inspect(){const geometry=[];product?.traverse(ob=>{if(ob.isMesh)geometry.push({name:ob.name,uuid:ob.geometry.uuid,positions:ob.geometry.getAttribute('position').count});});return {model:configuration?.id,fabric:root.dataset.fabric,view:currentView,camera:camera.position.toArray(),target:controls.target.toArray(),geometry,materials:[...materials].flatMap(([name,values])=>[...values].map(m=>({name,color:'#'+m.color.getHexString(),roughness:m.roughness,normalScale:m.normalScale.toArray(),map:m.map?.uuid,normalMap:m.normalMap?.uuid,roughnessMap:m.roughnessMap?.uuid,program:m.customProgramCacheKey()}))),three:THREE.REVISION};}
 };
}
