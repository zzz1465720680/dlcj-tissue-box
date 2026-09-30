import * as THREE from 'three';

// A local presentation trial. Set false to return to the saved shape and camera.
export const SOFT_SHAPE_TRIAL_ENABLED=true;
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const smooth=(n:number)=>{const t=clamp(n);return t*t*(3-2*t);};
type Point=[number,number,number];

/** Millimetre-scale, continuous deformation shared by leather and its curves.
 * Bottom contact stays anchored. The input GLB and its flat pattern are untouched.
 */
export function softShapePoint(x:number,y:number,z:number,part:string):Point{
  const u=clamp(Math.abs(x)/.081),v=clamp((y-.0005)/.0597),w=clamp(Math.abs(z)/.054);
  const lengthCrown=Math.cos(u*Math.PI/2)**2,heightBelly=Math.sin(v*Math.PI)**2;
  let px=x+Math.sign(x)*.0011*u**4*heightBelly*(1-w**4);
  let py=y+.0028*lengthCrown*(1-w**4)*smooth((v-.30)/.65);
  let pz=z+Math.sign(z)*.0022*w**3*lengthCrown*heightBelly;
  if(part.startsWith('corner')){
    // A small outward seating adjustment reveals the existing cut edge while
    // moving the stitching and edge paint by the identical field.
    const nx=Math.sign(x)*(Math.abs(x)/.0805)**8;
    const ny=Math.sign(y-.0301)*(Math.abs(y-.0301)/.0301)**8;
    const nz=Math.sign(z)*(Math.abs(z)/.0537)**8;
    const gap=.00032*smooth((y-.001)/.008),length=Math.hypot(nx,ny,nz)||1;
    px+=gap*nx/length;py+=gap*ny/length;pz+=gap*nz/length;
  }
  return [px,py,pz];
}

function deformationMatrix(x:number,y:number,z:number,part:string,target:THREE.Matrix3){
  const e=.00001,columns=[];
  for(let axis=0;axis<3;axis++){
    const a:Point=[x,y,z],b:Point=[x,y,z];a[axis]+=e;b[axis]-=e;
    const p=softShapePoint(...a,part),q=softShapePoint(...b,part);
    columns.push(p.map((value,i)=>(value-q[i])/(2*e)));
  }
  return target.set(columns[0][0],columns[1][0],columns[2][0],columns[0][1],columns[1][1],columns[2][1],columns[0][2],columns[1][2],columns[2][2]);
}

function holeTangents(geometry:THREE.BufferGeometry){
  const position=geometry.getAttribute('position'),uv=geometry.getAttribute('uv2'),index=geometry.index;
  if(!uv||!index||!geometry.getAttribute('_web_metric'))return null;
  const du=new Float64Array(position.count*3),dv=new Float64Array(position.count*3);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3(),cross=new THREE.Vector3();
  for(let i=0;i<index.count;i+=3){
    const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];
    a.fromBufferAttribute(position,ids[0]);b.fromBufferAttribute(position,ids[1]);c.fromBufferAttribute(position,ids[2]);
    ab.subVectors(b,a);ac.subVectors(c,a);
    const ux=uv.getX(ids[1])-uv.getX(ids[0]),uy=uv.getX(ids[2])-uv.getX(ids[0]);
    // Match the restored Blender V used by the physical-hole shader.
    const vx=uv.getY(ids[0])-uv.getY(ids[1]),vy=uv.getY(ids[0])-uv.getY(ids[2]),det=ux*vy-uy*vx;
    if(Math.abs(det)<1e-12)continue;
    const weight=cross.crossVectors(ab,ac).length();
    for(let axis=0;axis<3;axis++){
      const tu=(ab.getComponent(axis)*vy-ac.getComponent(axis)*vx)/det*weight;
      const tv=(ac.getComponent(axis)*ux-ab.getComponent(axis)*uy)/det*weight;
      for(const id of ids){du[id*3+axis]+=tu;dv[id*3+axis]+=tv;}
    }
  }
  return {du,dv};
}

export function softenGeometry(source:THREE.BufferGeometry,part:string){
  const geometry=new THREE.BufferGeometry();
  // UVs and triangle topology remain shared, immutable data; only display
  // positions, normals and the physical-hole metric get new buffers.
  for(const [name,attribute] of Object.entries(source.attributes))geometry.setAttribute(name,attribute);
  geometry.setIndex(source.index);geometry.groups=source.groups.map(group=>({...group}));
  geometry.setDrawRange(source.drawRange.start,source.drawRange.count);
  const input=source.getAttribute('position'),normals=source.getAttribute('normal'),metric=source.getAttribute('_web_metric');
  const position=input.clone(),normal=normals?.clone(),updatedMetric=metric?.clone(),tangents=holeTangents(source);
  const jacobian=new THREE.Matrix3(),normalMatrix=new THREE.Matrix3(),n=new THREE.Vector3();
  const u=new THREE.Vector3(),v=new THREE.Vector3(),ut=new THREE.Vector3(),vt=new THREE.Vector3();
  for(let i=0;i<input.count;i++){
    const x=input.getX(i),y=input.getY(i),z=input.getZ(i);
    position.setXYZ(i,...softShapePoint(x,y,z,part));
    deformationMatrix(x,y,z,part,jacobian);
    if(normal){normalMatrix.copy(jacobian).invert().transpose();n.fromBufferAttribute(normals,i).applyMatrix3(normalMatrix).normalize();normal.setXYZ(i,n.x,n.y,n.z);}
    if(metric&&updatedMetric&&tangents){
      u.fromArray(tangents.du,i*3);v.fromArray(tangents.dv,i*3);
      if(u.lengthSq()>1e-24&&v.lengthSq()>1e-24){
        u.normalize();v.normalize();ut.copy(u).applyMatrix3(jacobian);vt.copy(v).applyMatrix3(jacobian);
        const g00=metric.getX(i),g01=metric.getY(i),g11=metric.getZ(i);
        const a=g00*ut.lengthSq(),b=g11*vt.lengthSq();
        const angleChange=ut.dot(vt)/(ut.length()*vt.length())-u.dot(v);
        const cosine=Math.max(-.9999,Math.min(.9999,g01/Math.sqrt(Math.max(1e-12,g00*g11))+angleChange));
        updatedMetric.setXYZ(i,a,cosine*Math.sqrt(Math.max(0,a*b)),b);
      }
    }
  }
  geometry.setAttribute('position',position);if(normal)geometry.setAttribute('normal',normal);if(updatedMetric)geometry.setAttribute('_web_metric',updatedMetric);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

const shapeCache=new WeakMap<THREE.Group,THREE.Group>();
export function createSoftShape(template:THREE.Group,partFor:(mesh:THREE.Mesh)=>string){
  const existing=shapeCache.get(template);if(existing)return existing;
  const shaped=template.clone(true),cache=new Map<THREE.BufferGeometry,Map<string,THREE.BufferGeometry>>();
  shaped.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const part=partFor(object),source=object.geometry;
    let variants=cache.get(source);if(!variants){variants=new Map();cache.set(source,variants);}
    let geometry=variants.get(part);if(!geometry){geometry=softenGeometry(source,part);variants.set(part,geometry);}
    object.geometry=geometry;
  });
  shapeCache.set(template,shaped);return shaped;
}
