import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const hash=b=>createHash('sha256').update(b).digest('hex');
function read(path){const b=fs.readFileSync(path),n=b.readUInt32LE(12);return {bytes:b,json:JSON.parse(b.subarray(20,20+n)),bin:b.subarray(28+n)};}
const raw=read('checks/revision9/tissuebox-r9-uncompressed.glb');
const packed=read('public/models/revision9/tissuebox-r9.glb');
const audit=JSON.parse(fs.readFileSync('checks/revision9/export-audit.json','utf8'));
const meta=JSON.parse(fs.readFileSync('public/models/revision9/fixed-centers.json','utf8'));
const original=JSON.parse(fs.readFileSync('G:/DLCJ/14_纸巾盒三维模型/revision9/checks/fixed-hole-centers.json','utf8'));
assert.equal(hash(fs.readFileSync(audit.source)),audit.source_sha256,'Blender source changed');
await MeshoptDecoder.ready;
for(let i=0;i<packed.json.bufferViews.length;i++){
  const v=packed.json.bufferViews[i],e=v.extensions.EXT_meshopt_compression;
  const output=new Uint8Array(v.byteLength);
  MeshoptDecoder.decodeGltfBuffer(output,e.count,e.byteStride,packed.bin.subarray(e.byteOffset,e.byteOffset+e.byteLength),e.mode,e.filter);
  const before=raw.json.bufferViews[i];
  assert.deepEqual(Buffer.from(output),raw.bin.subarray(before.byteOffset,before.byteOffset+before.byteLength),`bufferView ${i}`);
}
const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(packed.bytes.buffer.slice(packed.bytes.byteOffset,packed.bytes.byteOffset+packed.bytes.byteLength),'');
const parts=new Set(),roles={},surface=[];
gltf.scene.traverse(o=>{
  if(o.userData.part)parts.add(o.userData.part);
  if(o.userData.role)roles[o.userData.role]=(roles[o.userData.role]??0)+1;
  if(!o.isMesh)return;
  let node=o;while(node&&!node.userData.role)node=node.parent;
  assert(node,`unmapped mesh ${o.name}`);
  assert.equal(node.userData.revision,9);
  if(node.userData.role==='surface'){
    for(const a of ['uv','uv1','uv2','_web_metric','normal'])assert(o.geometry.getAttribute(a),`${o.name} ${a}`);
    assert(o.morphTargetDictionary.Cut_pattern!==undefined);
    assert(o.morphTargetInfluences.every(x=>x===0),`${o.name} must start folded`);
    const position=o.geometry.attributes.position;
    const fixed=o.geometry.getAttribute('_web_surface_position');
    if(node.userData.part.startsWith('corner')){
      assert(fixed,`${o.name} lacks saved outer skin positions`);
      // GLTF positions are Y-up, custom data must stay Blender Z-up. The top
      // shell therefore matches (x,z,-y), and the inner shell stays .55 mm away.
      let outer=0,inner=0;
      for(let i=0;i<position.count;i++){
        const dx=position.getX(i)-fixed.getX(i),dy=position.getY(i)-fixed.getZ(i),dz=position.getZ(i)+fixed.getY(i);
        const d=Math.hypot(dx,dy,dz);
        if(d<1e-7)outer++;else{assert(Math.abs(d-.00055)<1e-6,`${o.name} unexpected fixed coordinate frame or shell ${d}`);inner++;}
      }
      assert(outer>0&&inner>0,`${o.name} both skins must retain outer coordinates`);
    }
    surface.push({name:o.name,part:node.userData.part,vertices:position.count,triangles:o.geometry.index.count/3,fixedCenter:!!fixed});
  }
});
assert.deepEqual([...parts].sort(),['body','corner0','corner1','corner2','corner3','trim','label'].sort());
assert(!packed.json.images&&!packed.json.cameras&&!packed.json.lights);

const atlases={};let centerCount=0;
for(const [part,m] of Object.entries(meta.parts)){
  const bytes=fs.readFileSync('public/models/revision9/'+m.file);
  assert.equal(bytes.length,m.width*m.height*16);assert.equal(hash(bytes),m.sha256);
  const pixels=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
  let maxCenterErrorMm=0,checks=0;
  function distance(gltfUv,p){
    const uv=[gltfUv[0],1-gltfUv[1]],row0=Math.floor(2*uv[1]);let d=1e20;
    for(let a=-1;a<=1;a++){
      const row=row0+a,parity=row-2*Math.floor(row/2),cx=.25+.5*parity,col0=Math.floor(uv[0]-cx+.5);
      for(let b=-1;b<=1;b++){
        const col=col0+b,x=col-m.imin,y=row-m.jmin;
        let c=[0,0,0,0];
        if(x>=0&&x<m.width&&y>=0&&y<m.height)c=Array.from(pixels.subarray((y*m.width+x)*4,(y*m.width+x)*4+4));
        d=Math.min(d,Math.hypot(p[0]-c[0],p[1]-c[1],p[2]-c[2])*1000+(1-c[3])*1000);
      }
    }
    return d;
  }
  for(const c of original.objects[part].centers.filter(c=>c.inside)){
    const d=distance([c.uv[0],1-c.uv[1]],c.position_m);
    assert(d<.00002,`${part}: shifted hole center ${d} mm`);maxCenterErrorMm=Math.max(maxCenterErrorMm,d);checks++;
  }
  assert(distance([-100,101],[0,0,0])>=1000,'Outside atlas must not clamp to a valid hole');
  centerCount+=checks;atlases[part]={width:m.width,height:m.height,sourcePixelBytesExact:true,checkedCenters:checks,maxCenterErrorMm};
}
const report={revision:9,lossless_buffer_views_verified:packed.json.bufferViews.length,decoded_bytes_identical:true,
  loader:'Three GLTFLoader + MeshoptDecoder',parts:[...parts],roles,surface,atlases,totalCentersVerified:centerCount,
  sourceBlenderUnchanged:true,defaultFolded:true,rawBytes:raw.bytes.length,compressedBytes:packed.bytes.length,sha256:hash(packed.bytes),passed:true};
fs.writeFileSync('checks/revision9/web-asset-audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
