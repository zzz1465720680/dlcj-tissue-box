import * as THREE from 'three';
const configured=new WeakSet();

// Dye colours are a reference for a matte, pigmented leather surface. Keep
// neutral shades, while compressing the neon end of the custom colour picker.
export function leatherColor(hex) {
 const color=new THREE.Color(hex),hsl=color.getHSL({},THREE.SRGBColorSpace);
 const vivid=THREE.MathUtils.smoothstep(hsl.s,.25,1);
 return color.setHSL(hsl.h,hsl.s*(1-.50*vivid),hsl.l*(1-.28*vivid),THREE.SRGBColorSpace);
}

export function prepareLeather(material) {
 if(configured.has(material)||!['Mat_Accent','Mat_Edge'].includes(material.name))return;
 configured.add(material);
 material.metalness=0;material.roughness=1;
 material.specularIntensity=.38;material.clearcoat=0;
 // Preserve the accepted UVs, tangents and grain maps. Lift their roughness
 // range instead of reducing the scene exposure and darkening the fabric.
 const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
 material.onBeforeCompile=function(shader,renderer){
  compile.call(this,shader,renderer);
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
#ifdef USE_ROUGHNESSMAP
diffuseColor.rgb *= clamp(1.0 + (texture2D(roughnessMap, vRoughnessMapUv).g - 0.50) * 1.4, 0.90, 1.10);
#endif`).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
#ifdef USE_ROUGHNESSMAP
roughnessFactor = clamp(0.73 + (texelRoughness.g - 0.50) * 0.55, 0.64, 0.84);
#endif`);
 };
 material.customProgramCacheKey=()=>key+'-matte-leather-v1';
 material.needsUpdate=true;
}
