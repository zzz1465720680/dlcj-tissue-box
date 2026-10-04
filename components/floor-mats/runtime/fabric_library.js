// External albedo tiles and procedural woven normals for the centre surface.
// UV rectangles select matching repeat phases without editing source pixels.
export const FABRIC_VARIANTS = Object.freeze({
 jacquard: {label:'灰色字母提花',file:'grey_jacquard.png',tile:[.036,.056],crop:[545/1254,248/1254,418/1254,638/1254],average:[.090959,.103774,.128457],motifs:[2,4],yarns:[64,96],roughness:.84},
 twill: {label:'深灰斜纹',file:'dark_twill.png',tile:[.032,.024],crop:[111/1254,111/1254,418/1254,314/1254],average:[.053442,.058840,.061700],motifs:[8,6],yarns:[128,96],roughness:.81},
 green: {label:'绿黑白千鸟格',file:'green_houndstooth.png',tile:[.0393,.0393],crop:[591/1254,257/1254,493/1254,518/1254],average:[.321936,.358011,.327304],motifs:[4,4],yarns:[64,64],roughness:.9}
});
const UV_TILE_METRES=.0393;

export function createWovenNormal(THREE,id,definition){
 const n=512,height=new Float32Array(n*n),bytes=new Uint8Array(n*n*4),tau=2*Math.PI;
 const [nx,ny]=definition.yarns;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const u=x/n,v=y/n;
  const warp=.5+.5*Math.cos(tau*u*nx),weft=.5+.5*Math.cos(tau*v*ny);
  const over=.5+.5*Math.cos(tau*(u*nx+v*ny)/4);
  const rib=id==='twill'?.000022*Math.pow(.5+.5*Math.cos(tau*(u*8+v*6)),1.4):0;
  height[y*n+x]=rib+.000016*(over*warp+(1-over)*weft);
 }
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const dx=(height[y*n+(x+1)%n]-height[y*n+(x+n-1)%n])*n/(2*definition.tile[0]);
  const dy=(height[((y+1)%n)*n+x]-height[((y+n-1)%n)*n+x])*n/(2*definition.tile[1]);
  const length=Math.hypot(dx,dy,1),i=(y*n+x)*4;
  bytes[i]=Math.round(127.5*(1-dx/length));bytes[i+1]=Math.round(127.5*(1-dy/length));
  bytes[i+2]=Math.round(127.5*(1+1/length));bytes[i+3]=255;
 }
 return new THREE.DataTexture(bytes,n,n,THREE.RGBAFormat,THREE.UnsignedByteType);
}

export function createFabricLibrary(THREE,{anisotropy=1,loadTexture,textureBaseUrl}={}){
 const loader=new THREE.TextureLoader(),cache=new Map(),snapshots=new WeakMap();
 const readTexture=loadTexture||((url)=>loader.loadAsync(url));
 function configure(texture,definition,color){
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.flipY=false;
  texture.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;
  texture.repeat.set(UV_TILE_METRES/definition.tile[0],UV_TILE_METRES/definition.tile[1]);
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=anisotropy;
  texture.userData.fabricLibraryOwned=true;texture.needsUpdate=true;return texture;
 }
 function capture(material){
  if(material.name!=='Mat_MainFabric')throw Error('面料只能用于中间区域');
  if(!snapshots.has(material))snapshots.set(material,{
   map:material.map,normalMap:material.normalMap,roughnessMap:material.roughnessMap,
   roughness:material.roughness,color:material.color.clone(),normalScale:material.normalScale.clone()
  });
 }
 async function prepare(id){
  if(id==='houndstooth'||id==='plain')return null;
  const definition=FABRIC_VARIANTS[id];if(!definition)throw Error('未知面料');
  if(!cache.has(id))cache.set(id,(async()=>{
   const url=textureBaseUrl?new URL(definition.file+'?v=fabric3',textureBaseUrl).href:new URL('./fabrics/'+definition.file+'?v=fabric3',import.meta.url).href;
   const map=configure(await readTexture(url),definition,true);
   const normalMap=configure(createWovenNormal(THREE,id,definition),definition,false);
   return {map,normalMap};
  })().catch(error=>{cache.delete(id);throw error;}));
  return cache.get(id);
 }
 function apply(material,id,asset){
  capture(material);const original=snapshots.get(material),definition=FABRIC_VARIANTS[id];
  if(definition){
   if(!asset)throw Error('面料贴图尚未载入');
   material.map=asset.map;material.normalMap=asset.normalMap;material.roughnessMap=null;
   material.color.set('#ffffff');material.roughness=definition.roughness;material.normalScale.set(.75,.75);
  }else{
   if(id!=='houndstooth'&&id!=='plain')throw Error('未知面料');
   material.map=id==='plain'?null:original.map;material.normalMap=original.normalMap;
   material.roughnessMap=original.roughnessMap;material.roughness=original.roughness;
   material.normalScale.copy(original.normalScale);material.color.copy(original.color);
   if(id==='plain')material.color.set('#687668');
  }
  material.needsUpdate=true;
  return definition?{crop:definition.crop,average:definition.average,motifs:definition.motifs,yarns:definition.yarns,custom:true}:
   {crop:[0,0,1,1],average:[0,0,0],motifs:[4,4],yarns:[32,32],custom:false};
 }
 return {capture,prepare,apply};
}
