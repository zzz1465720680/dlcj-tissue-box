'use client';
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {Design,Part,preset} from '@/lib/design';
import {loadProductAssets,type ProductAssets} from '@/lib/product-assets';
import {createProduct,prepareDesignImages,updateProduct,highlightProduct,disposeProduct,type ProductRuntime} from '@/lib/product-materials';
import {createRenderProfiler,type RenderReport} from '@/lib/render-profiler';
export {loadArt,paintArtwork} from '@/lib/artwork';

type CaptureOptions={views?:string[];width?:number;height?:number;format?:'image/png'|'image/webp'};
export type ProductHandle={view:(name:string)=>void;zoom:(n:number)=>void;capture:()=>string;captureViews:(design?:Design,options?:CaptureOptions)=>Promise<string[]>};
type Props={design:Design;selected:Part|string;onSelect:(p:Part|string)=>void;onReady?:(h:ProductHandle)=>void;showTissue:boolean;rotating:boolean};
type SceneState={
  scene:THREE.Scene;camera:THREE.PerspectiveCamera;renderer:THREE.WebGLRenderer;controls:OrbitControls;
  product:ProductRuntime;assets:ProductAssets;generation:number;dirty:boolean;exporting:boolean;
  profiler:ReturnType<typeof createRenderProfiler>;invalidate:()=>void;pixelOverride:number|null;
};

export default function ProductView({design,selected,onSelect,onReady,showTissue,rotating}:Props){
  const host=useRef<HTMLDivElement>(null),state=useRef<SceneState|null>(null),api=useRef<ProductHandle|null>(null);
  const latest=useRef({design,selected,showTissue,rotating,onSelect,onReady});
  latest.current={design,selected,showTissue,rotating,onSelect,onReady};
  const [error,setError]=useState(''),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
  const [debug,setDebug]=useState(false),[measuring,setMeasuring]=useState(false),[report,setReport]=useState<RenderReport|null>(null);
  const [thumbnails,setThumbnails]=useState<string[]>([]),[generating,setGenerating]=useState(false);
  const [resources,setResources]=useState<unknown>(null);
  useEffect(()=>setDebug(process.env.NODE_ENV==='development'&&new URLSearchParams(window.location.search).has('render-debug')),[]);

  useEffect(()=>{
    if(!host.current)return;
    let cancelled=false,cleaned=false,raf=0,dragging=false,lastFrame=0,lastQualityChange=0,motionCeiling=Math.min(window.devicePixelRatio,1.25),frameAverage=16.7;
    let own:SceneState|null=null,cleanup=()=>{};
    (async()=>{
      let renderer:THREE.WebGLRenderer;
      try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:false,powerPreference:'high-performance'});}
      catch{setError('3D 显示无法启动，请开启浏览器硬件加速后重试。');setLoading(false);return;}
      renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
      renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.90;
      const el=host.current!;el.appendChild(renderer.domElement);
      const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.02,80);camera.position.set(3.41,2.8,3.91);
      const controls=new OrbitControls(camera,renderer.domElement);
      controls.enableDamping=true;controls.dampingFactor=.08;controls.enablePan=false;controls.minDistance=2.8;controls.maxDistance=10;controls.autoRotateSpeed=.6;
      const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),environment=pmrem.fromScene(room,.04);
      scene.environment=environment.texture;scene.environmentIntensity=.38;room.dispose();pmrem.dispose();
      scene.add(new THREE.HemisphereLight(0xffffff,0x929b9c,.28));
      const key=new THREE.DirectionalLight(0xfffcf5,1.05);key.position.set(-3,5,4);key.castShadow=true;
      key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-3,right:3,top:3,bottom:-3,near:.1,far:12});
      key.shadow.normalBias=.001;key.shadow.bias=-.000005;key.shadow.radius=5;scene.add(key);
      const fill=new THREE.DirectionalLight(0xddeaff,.25);fill.position.set(3,2,-2);scene.add(fill);
      const floor=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.ShadowMaterial({opacity:.09}));
      floor.rotation.x=-Math.PI/2;floor.position.y=-.603;floor.receiveShadow=true;scene.add(floor);

      const requestFrame=()=>{if(!raf&&!cancelled&&!document.hidden)raf=requestAnimationFrame(animate);};
      const invalidate=()=>{if(own)own.dirty=true;requestFrame();};
      const pixelRatio=(moving:boolean)=>{
        if(own?.pixelOverride)return own.pixelOverride;
        const native=Math.min(window.devicePixelRatio,2);
        // Interaction uses a pixel budget; the full device resolution returns
        // immediately after damping settles. Geometry, holes and UVs stay exact.
        return moving?Math.min(native,motionCeiling,Math.max(.75,Math.sqrt(1350000/Math.max(1,el.clientWidth*el.clientHeight)))):native;
      };
      function animate(time:number){
        raf=0;const s=own;if(!s||cancelled||s.exporting)return;
        const elapsed=lastFrame?time-lastFrame:16.7;lastFrame=time;
        controls.autoRotate=latest.current.rotating||s.profiler.active;
        const changed=controls.update(Math.min(elapsed/1000,.1)),moving=dragging||controls.autoRotate||changed;
        if(moving&&elapsed<100){
          frameAverage=frameAverage*.9+elapsed*.1;
          if(frameAverage>26&&time-lastQualityChange>1500&&!s.pixelOverride){motionCeiling=Math.max(.75,motionCeiling*.85);lastQualityChange=time;}
        }else if(!moving){motionCeiling=Math.min(window.devicePixelRatio,1.25);frameAverage=16.7;}
        const ratio=pixelRatio(moving);
        if(Math.abs(renderer.getPixelRatio()-ratio)>.01){renderer.setPixelRatio(ratio);s.dirty=true;}
        if(changed||s.dirty||s.profiler.active){
          const started=performance.now();renderer.render(scene,camera);s.profiler.sample(performance.now()-started);s.dirty=false;
        }
        if(moving)requestFrame();
      }
      const frameFactor=(aspect:number)=>Math.max(1,1.3/aspect);
      const resize=()=>{
        if(!el.clientWidth||!el.clientHeight)return;
        const aspect=el.clientWidth/el.clientHeight;
        if(own&&controls.minDistance===2.8)camera.position.sub(controls.target).multiplyScalar(frameFactor(aspect)/frameFactor(camera.aspect)).add(controls.target);
        renderer.setSize(el.clientWidth,el.clientHeight);camera.aspect=aspect;camera.updateProjectionMatrix();invalidate();
      };
      const observer=new ResizeObserver(resize);observer.observe(el);resize();
      const startInteraction=()=>{dragging=true;invalidate();},endInteraction=()=>{dragging=false;invalidate();};
      controls.addEventListener('start',startInteraction);controls.addEventListener('end',endInteraction);controls.addEventListener('change',invalidate);
      const visibility=()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else{lastFrame=0;invalidate();}};
      document.addEventListener('visibilitychange',visibility);
      let start={x:0,y:0};
      const down=(event:PointerEvent)=>{start={x:event.clientX,y:event.clientY};};
      const up=(event:PointerEvent)=>{
        const s=own;if(!s||s.exporting||Math.hypot(event.clientX-start.x,event.clientY-start.y)>5)return;
        const rect=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
        // Curves map to the same part as their leather. Avoid testing 350k tiny
        // curve triangles before testing the visible leather/label surfaces.
        const hits=ray.intersectObjects(s.product.pickables.filter(mesh=>mesh.visible),false);
        if(hits[0])latest.current.onSelect(hits[0].object.userData.selectPart);
      };
      renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',up);
      cleanup=()=>{
        if(cleaned)return;cleaned=true;cancelAnimationFrame(raf);observer.disconnect();controls.dispose();
        document.removeEventListener('visibilitychange',visibility);
        renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointerup',up);
        if(own)disposeProduct(own.product);environment.dispose();floor.geometry.dispose();floor.material.dispose();key.shadow.map?.dispose();
        renderer.dispose();renderer.domElement.remove();if(state.current===own){state.current=null;api.current=null;}
      };
      try{
        const assets=await loadProductAssets();if(cancelled){cleanup();return;}
        const product=createProduct(assets);
        let shown=latest.current,images=await prepareDesignImages(shown.design);
        while(!cancelled&&(shown.design!==latest.current.design||shown.showTissue!==latest.current.showTissue)){shown=latest.current;images=await prepareDesignImages(shown.design);}
        if(cancelled){disposeProduct(product);cleanup();return;}
        updateProduct(product,shown.design,assets,shown.showTissue,images);highlightProduct(product,latest.current.selected);
        const s:SceneState={scene,camera,controls,renderer,product,assets,generation:0,dirty:true,exporting:false,profiler:createRenderProfiler(renderer),invalidate,pixelOverride:null};
        own=s;state.current=s;scene.add(product.group);
        const view=(name:string,draw=true)=>{
          const poses:Record<string,[number,number,number]>={hero:[3.41,2.8,3.91],top:[0,5.8,.001],bottom:[0,-5.8,.001],long:[0,.18,4.5],short:[4.1,.18,0]};
          controls.enableDamping=false;const oldKey=key.position.clone(),oldAuto=controls.autoRotate;controls.autoRotate=false;
          if(name==='grain'){
            controls.minDistance=.65;camera.position.set(.20,.26,2.16);controls.target.set(0,0,1.04);
            key.position.set(-2.4,1.5,1.6);key.intensity=1.2;fill.intensity=.10;scene.environmentIntensity=.16;
          }else{
            controls.minDistance=2.8;camera.position.set(...(poses[name]??poses.hero));controls.target.set(0,0,0);
            key.position.set(-3,5,4);key.intensity=1.05;fill.intensity=.25;scene.environmentIntensity=.38;
            if(name==='corner'||name==='tip'){
              const target=name==='tip'?new THREE.Vector3(1.54,.55,-.52):new THREE.Vector3(1.56,.13,-.42);
              controls.minDistance=.25;controls.target.copy(target);camera.position.copy(target).addScaledVector(new THREE.Vector3(.223,.133,-.079).normalize(),name==='tip'?.98:3.5);
            }
            if(name==='overlap'){controls.minDistance=.4;controls.target.set(0,.55,0);camera.position.set(2.5,2.5,.8);}
          }
          if(controls.minDistance===2.8)camera.position.sub(controls.target).multiplyScalar(frameFactor(camera.aspect)).add(controls.target);
          if(!oldKey.equals(key.position))renderer.shadowMap.needsUpdate=true;
          controls.update();controls.enableDamping=true;controls.autoRotate=oldAuto;
          if(draw)invalidate();
        };
        const handle:ProductHandle={
          view,
          zoom:n=>{camera.position.sub(controls.target).multiplyScalar(n).add(controls.target);controls.update();invalidate();},
          capture:()=>{
            const oldRatio=renderer.getPixelRatio();renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
            renderer.render(scene,camera);const png=renderer.domElement.toDataURL('image/png');renderer.setPixelRatio(oldRatio);invalidate();return png;
          },
          captureViews:async(designToExport?:Design,options:CaptureOptions={})=>{
            if(s.exporting)throw new Error('An export is already running');
            const old={position:camera.position.clone(),target:controls.target.clone(),size:renderer.getSize(new THREE.Vector2()),ratio:renderer.getPixelRatio(),aspect:camera.aspect,min:controls.minDistance,auto:controls.autoRotate,key:key.position.clone(),keyIntensity:key.intensity,fill:fill.intensity,environment:scene.environmentIntensity};
            let exported:ProductRuntime|null=null;const result:string[]=[];s.exporting=true;controls.autoRotate=false;
            try{
              if(designToExport){const images=await prepareDesignImages(designToExport);exported=createProduct(assets);updateProduct(exported,designToExport,assets,latest.current.showTissue,images);product.group.visible=false;scene.add(exported.group);}
              renderer.shadowMap.needsUpdate=true;renderer.setPixelRatio(1);
              const width=options.width??1100,height=options.height??850;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
              for(const name of options.views??['hero','top','long','short','bottom']){
                view(name,false);camera.position.sub(controls.target).multiplyScalar(1.14).add(controls.target);
                controls.enableDamping=false;controls.update();renderer.render(scene,camera);
                result.push(renderer.domElement.toDataURL(options.format??'image/png',.92));
              }
              return result;
            }finally{
              if(exported){scene.remove(exported.group);disposeProduct(exported);}product.group.visible=true;
              renderer.setPixelRatio(old.ratio);renderer.setSize(old.size.x,old.size.y,false);camera.aspect=old.aspect;camera.updateProjectionMatrix();
              camera.position.copy(old.position);controls.target.copy(old.target);controls.minDistance=old.min;
              key.position.copy(old.key);key.intensity=old.keyIntensity;fill.intensity=old.fill;scene.environmentIntensity=old.environment;
              controls.enableDamping=false;controls.update();controls.enableDamping=true;controls.autoRotate=old.auto;
              renderer.shadowMap.needsUpdate=true;s.exporting=false;invalidate();
            }
          },
        };
        api.current=handle;setLoading(false);setError('');latest.current.onReady?.(handle);invalidate();
      }catch(error){console.error('Revision7 model load failed',error);if(!cancelled){setError('模型未能载入，请检查网络后重试。');setLoading(false);}}
    })();
    return()=>{cancelled=true;cleanup();};
  },[retry]);

  useEffect(()=>{
    const s=state.current;if(!s)return;const generation=++s.generation;
    prepareDesignImages(design).then(images=>{
      if(state.current!==s||generation!==s.generation)return;
      const result=updateProduct(s.product,design,s.assets,showTissue,images);
      highlightProduct(s.product,latest.current.selected);
      if(result.shadows)s.renderer.shadowMap.needsUpdate=true;
      if(result.changed)s.invalidate();setError('');
    }).catch(()=>setError('有一张图案未能载入，请重新添加。'));
  },[design,showTissue]);
  useEffect(()=>{const s=state.current;if(s){highlightProduct(s.product,selected);s.invalidate();}},[selected]);
  useEffect(()=>{state.current?.invalidate();},[rotating]);
  return <div ref={host} className="product-canvas" data-model-revision="7" aria-label="revision7 纸巾盒 3D 模型" aria-busy={loading}>
    {loading&&<div className="model-loading">正在载入皮革模型…</div>}
    {error&&<div className="model-error">{error}<button className="button" onClick={()=>{setError('');setLoading(true);setRetry(v=>v+1);}}>重新载入</button></div>}
    {debug&&<div style={{position:'fixed',left:10,bottom:10,zIndex:90,maxWidth:440,maxHeight:300,overflow:'auto',background:'#fff',padding:12,border:'1px solid #999',fontSize:12}}>
      <button disabled={loading||measuring||generating} onClick={async()=>{
        const s=state.current;if(!s)return;setMeasuring(true);const old=s.camera.position.clone();const pending=s.profiler.start();s.invalidate();
        const result=await pending;s.controls.autoRotate=false;s.camera.position.copy(old);s.controls.enableDamping=false;s.controls.update();s.controls.enableDamping=true;s.invalidate();
        setReport(result);setMeasuring(false);
      }}>测量旋转性能</button>
      <label> 诊断像素倍率 <select aria-label="诊断像素倍率" defaultValue="device" onChange={e=>{const s=state.current;if(s){s.pixelOverride=e.target.value==='device'?null:Number(e.target.value);s.invalidate();}}}><option value="device">设备自动</option><option value="1">1</option><option value="1.5">1.5</option><option value="2">2</option></select></label>
      <pre aria-label="渲染性能测量结果">{measuring?'测量中…':report?JSON.stringify(report,null,2):'等待测量'}</pre>
      <button disabled={loading||measuring||generating} onClick={()=>{const s=state.current;if(s)setResources({liveFrames:s.profiler.renderedFrames,pixelRatio:s.renderer.getPixelRatio(),canvas:[s.renderer.domElement.width,s.renderer.domElement.height],geometryCount:s.renderer.info.memory.geometries,textureCount:s.renderer.info.memory.textures,materialUpdates:s.product.materialUpdates,artworkPaints:s.product.artworkPaints,materialIds:Object.fromEntries(Object.entries(s.product.parts).map(([part,value])=>[part,value.surface.uuid]))});}}>读取渲染资源</button>
      {resources!==null&&<pre aria-label="渲染资源统计">{JSON.stringify(resources,null,2)}</pre>}
      <button disabled={loading||generating||measuring} onClick={async()=>{if(!api.current)return;setGenerating(true);try{const images=[];for(let i=0;i<3;i++)images.push((await api.current.captureViews(preset(i),{views:['hero'],width:360,height:270,format:'image/webp'}))[0]);setThumbnails(images);}finally{setGenerating(false);}}}>生成搭配缩略图</button>
      {thumbnails.map((src,i)=><img key={i} src={src} alt={preset(i).name+'搭配缩略图'} style={{width:120,display:'inline-block'}}/>)}
    </div>}
  </div>;
}

