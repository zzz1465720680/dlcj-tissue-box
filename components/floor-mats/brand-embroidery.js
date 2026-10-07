import * as THREE from 'three';
import {SVGLoader} from 'three/addons/loaders/SVGLoader.js';

let wordmark;
async function loadWordmark(){
 if(!wordmark)wordmark=new SVGLoader().loadAsync('/models/floor-mats/dingli-chejuan.svg').catch(error=>{wordmark=undefined;throw error;});
 return wordmark;
}

function threadNormal(){
 const width=128,data=new Uint8Array(width*width*4);
 for(let y=0;y<width;y++)for(let x=0;x<width;x++){
  const rib=Math.sin((x+y*.28)*Math.PI/8),i=(y*width+x)*4;
  data[i]=128+Math.round(rib*34);data[i+1]=128+Math.round(rib*10);data[i+2]=250;data[i+3]=255;
 }
 const texture=new THREE.DataTexture(data,width,width);
 texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
 texture.repeat.set(22,5);texture.magFilter=THREE.LinearFilter;
 texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;
 texture.needsUpdate=true;return texture;
}

// Attach raised lettering to the existing planar leather only. The approved
// GLBs, model partition, perimeter and stitches remain byte-for-byte intact.
export async function addBrandEmbroidery(product){
 const panels=[];
 product.traverse(object=>{
  if(object.isMesh&&(Array.isArray(object.material)?object.material:[object.material]).some(m=>m.name==='Mat_Accent'))panels.push(object);
 });
 if(!panels.length)return [];
 const svg=await loadWordmark(),result=[];
 for(const panel of panels){
  panel.geometry.computeBoundingBox();const box=panel.geometry.boundingBox;
  const driver=box.max.x<0;
  const shapes=svg.paths.flatMap(path=>SVGLoader.createShapes(path));
  const geometry=new THREE.ExtrudeGeometry(shapes,{depth:3,bevelEnabled:true,bevelSize:.75,bevelThickness:.5,bevelSegments:1,steps:1,curveSegments:7});
  geometry.computeBoundingBox();
  const text=geometry.boundingBox,size=text.getSize(new THREE.Vector3()),scale=(driver?.138:.110)/size.x;
  const uv=geometry.getAttribute('uv'),position=geometry.getAttribute('position');
  for(let i=0;i<uv.count;i++)uv.setXY(i,(position.getX(i)-text.min.x)/size.x,(position.getY(i)-text.min.y)/size.y);
  // SVG's downward Y axis becomes the panel's crosswise X axis; the text
  // baseline follows the long leather strip, with the raised face upwards.
  geometry.applyMatrix4(new THREE.Matrix4().set(
   0,-scale,0,(text.min.y+size.y/2)*scale,
   0,0,scale,0,
   scale,0,0,-(text.min.x+size.x/2)*scale,
   0,0,0,1
  ));
  // The SVG Y reflection also reverses winding. Keep front faces, side walls
  // and their normals consistent after placing the wordmark on the top face.
  if(geometry.index){
   const index=geometry.index;for(let i=0;i<index.count;i+=3){const b=index.getX(i+1);index.setX(i+1,index.getX(i+2));index.setX(i+2,b);}
  }else{
   for(const attribute of Object.values(geometry.attributes)){
    for(let i=0;i<attribute.count;i+=3)for(let component=0;component<attribute.itemSize;component++){
     const b=(i+1)*attribute.itemSize+component,c=(i+2)*attribute.itemSize+component,value=attribute.array[b];
     attribute.array[b]=attribute.array[c];attribute.array[c]=value;
    }
   }
  }
  geometry.computeVertexNormals();
  const material=new THREE.MeshPhysicalMaterial({name:'Mat_BrandEmbroidery',color:'#4b4b43',metalness:0,roughness:.84,specularIntensity:.3,sheen:.18,sheenColor:'#ded9cd',sheenRoughness:.85,normalMap:threadNormal(),normalScale:new THREE.Vector2(.22,.22)});
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='Embroidery_Dingli_Chejuan';mesh.castShadow=false;mesh.receiveShadow=false;
  mesh.position.set(driver?-.186:.241,box.max.y+.00009,driver?.100:.237);
  panel.add(mesh);result.push(mesh);
 }
 return result;
}
