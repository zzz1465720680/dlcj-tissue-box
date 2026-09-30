import * as THREE from 'three';
import type {Part} from './design';

/** Revision9 fixed hole centers, exactly as saved in the approved blend.
 *
 * RGB is the hole center in BLENDER OBJECT METERS (Z-up), alpha marks a valid
 * entry; invalid pixels are transparent black. Row 0 of the file is jmin, so the
 * data is sampled with flipY=false and, together with `_WEB_SURFACE_POSITION`,
 * stays in the saved Blender coordinate space. The shader only ever compares the
 * attribute with these centers, so both must keep the same frame.
 */
export type FixedCenterAtlas={
  part:Part;texture:THREE.DataTexture;
  imin:number;jmin:number;width:number;height:number;valid:number;
};

type AtlasPart={file:string;width:number;height:number;imin:number;jmin:number;valid_pixels:number};
type AtlasManifest={parts:Record<string,AtlasPart>};

export const FIXED_CENTER_PARTS:Part[]=['corner0','corner1','corner2','corner3'];

/** Vertex stage of the saved r9 fixed-center group. */
export const fixedCenterVertexShader=/* glsl */`
attribute vec3 _web_surface_position;
varying vec2 vPhysicalHoleUv;
varying vec3 vFixedSurfacePosition;
`;

/** Fragment stage of the saved r9 fixed-center group.
 *
 * Port of the saved Blender node group without re-unwrapping HoleUV: nearest
 * row from the original chart, the three neighbouring rows with their own
 * floored-modulo column origin, and nine nearest-atlas candidates of which the
 * smallest formed-surface chord distance wins. A tap whose cell falls outside
 * the saved image, or whose alpha is invalid, stays a huge distance (Blender's
 * CLIP extension) instead of snapping to a valid neighbour center.
 */
export const fixedCenterFragmentShader=/* glsl */`
uniform sampler2D uFixedCenters;
uniform vec2 uFixedGridOrigin;
uniform vec2 uFixedGridSize;
varying vec2 vPhysicalHoleUv;
varying vec3 vFixedSurfacePosition;
vec4 fixedCenterSample(vec2 cell){
  if(cell.x<0.0||cell.x>1.0||cell.y<0.0||cell.y>1.0)return vec4(0.0);
  return texture2D(uFixedCenters,cell);
}
float fixedCenterDistance(vec2 holeUv){
  float row0=floor(holeUv.y*2.0);
  float minimum=1.0e20;
  for(int rowOffset=-1;rowOffset<=1;rowOffset++){
    float row=row0+float(rowOffset);
    float centerX=0.25+0.5*mod(row,2.0);
    float column0=floor(holeUv.x-centerX+0.5);
    float v=(row+0.5-uFixedGridOrigin.y)/uFixedGridSize.y;
    for(int columnOffset=-1;columnOffset<=1;columnOffset++){
      float u=(column0+float(columnOffset)+0.5-uFixedGridOrigin.x)/uFixedGridSize.x;
      vec4 center=fixedCenterSample(vec2(u,v));
      float distance=length(vFixedSurfacePosition-center.rgb)*1000.0+(1.0-center.a)*1000.0;
      minimum=min(minimum,distance);
    }
  }
  return minimum;
}
float holeDistance(){
  return fixedCenterDistance(vPhysicalHoleUv);
}
`;

/** Load the saved packed atlases once, next to the model. */
export async function loadFixedCenters(
  manifestPath='/models/revision9/fixed-centers.json',
  parts:Part[]=FIXED_CENTER_PARTS,
):Promise<Partial<Record<Part,FixedCenterAtlas>>>{
  const loader=new THREE.FileLoader();
  const manifest=await loader.setResponseType('json').loadAsync(manifestPath) as unknown as AtlasManifest;
  const base=manifestPath.slice(0,manifestPath.lastIndexOf('/')+1);
  const atlases:Partial<Record<Part,FixedCenterAtlas>>={};
  await Promise.all(parts.map(async part=>{
    const meta=manifest.parts?.[part];
    if(!meta)throw new Error('Missing revision9 fixed center atlas: '+part);
    const buffer=await new THREE.FileLoader().setResponseType('arraybuffer').loadAsync(base+meta.file) as ArrayBuffer;
    const expected=meta.width*meta.height*4*4;
    if(buffer.byteLength!==expected)throw new Error(`${part} fixed center atlas is ${buffer.byteLength} bytes, expected ${expected}`);
    const texture=new THREE.DataTexture(new Float32Array(buffer,0,expected/4),meta.width,meta.height,THREE.RGBAFormat,THREE.FloatType);
    texture.flipY=false;
    texture.generateMipmaps=false;
    texture.minFilter=THREE.NearestFilter;
    texture.magFilter=THREE.NearestFilter;
    texture.wrapS=THREE.ClampToEdgeWrapping;
    texture.wrapT=THREE.ClampToEdgeWrapping;
    texture.colorSpace=THREE.NoColorSpace;
    texture.needsUpdate=true;
    atlases[part]={part,texture,imin:meta.imin,jmin:meta.jmin,width:meta.width,height:meta.height,valid:meta.valid_pixels};
  }));
  return atlases;
}
