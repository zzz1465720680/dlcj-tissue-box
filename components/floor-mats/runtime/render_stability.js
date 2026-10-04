// Screen-space filtering for the web preview; product geometry stays intact.
export function createStableRendering(THREE) {
 const displayScale={value:1},projectionScale={value:1};
 const configured=new WeakSet(),fabricUniforms=new WeakMap();
 const clothHeader=`
uniform float stableDisplayScale;
uniform vec4 stableFabricCrop;
uniform vec3 stableFabricAverage;
uniform vec2 stableFabricMotifs;
uniform vec2 stableFabricYarns;
uniform float stableFabricCustom;
float stableFootprint( vec2 uv ) {
 return max( length( dFdx( uv ) ), length( dFdy( uv ) ) ) * stableDisplayScale;
}
float stableCycles( vec2 uv, vec2 cycles ) {
 return max( length( dFdx( uv ) * cycles ), length( dFdy( uv ) * cycles ) ) * stableDisplayScale;
}
`;
 const mapChunk=THREE.ShaderChunk.map_fragment
  .replace('vec4 sampledDiffuseColor =',`vec2 stableSampleUv = fract( vMapUv ) * stableFabricCrop.zw + stableFabricCrop.xy;
 vec4 sampledDiffuseColor =`)
  .replace('texture2D( map, vMapUv )','textureGrad( map, stableSampleUv, dFdx( vMapUv ) * stableFabricCrop.zw * 1.57, dFdy( vMapUv ) * stableFabricCrop.zw * 1.57 )')
  .replace('diffuseColor *= sampledDiffuseColor;',`
 float stableMotifCycles = stableCycles( vMapUv, stableFabricMotifs );
 float stablePatternFade = smoothstep( 0.15, 0.40, stableMotifCycles );
 vec4 stableAverage = texture2D( map, vMapUv, 8.0 );
 stableAverage = mix( stableAverage, vec4( stableFabricAverage, 1.0 ), stableFabricCustom );
 sampledDiffuseColor = mix( sampledDiffuseColor, stableAverage, stablePatternFade );
 diffuseColor *= sampledDiffuseColor;
`);
 const normalChunk=THREE.ShaderChunk.normal_fragment_maps
  .replaceAll('texture2D( normalMap, vNormalMapUv )','texture2D( normalMap, vNormalMapUv, 0.85 )')
  .replace('mapN.xy *= normalScale;',`
 float stableYarnCycles = stableCycles( vNormalMapUv, stableFabricYarns );
 float stableRelief = 1.0 - smoothstep( 0.35, 1.0, stableYarnCycles );
 mapN.xy *= normalScale * stableRelief;
`);
 function material(m) {
  if(configured.has(m))return;
  configured.add(m);
  // Only the floor receives real-time shadows. The thin laminate and yarn
  // must not receive their own coarse shadow map, which produces dark slivers.
  m.shadowSide=THREE.FrontSide;
  for(const key of ['map','normalMap','roughnessMap']){
   const tex=m[key];if(!tex)continue;
   tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;
   if(!tex.isCompressedTexture)tex.generateMipmaps=true;
   tex.needsUpdate=true;
  }
  if(m.name==='Mat_MainFabric'){
   const uniforms={
    stableFabricCrop:{value:new THREE.Vector4(0,0,1,1)},stableFabricAverage:{value:new THREE.Vector3()},
    stableFabricMotifs:{value:new THREE.Vector2(4,4)},stableFabricYarns:{value:new THREE.Vector2(32,32)},
    stableFabricCustom:{value:0}
   };
   fabricUniforms.set(m,uniforms);
   m.onBeforeCompile=shader=>{
    shader.uniforms.stableDisplayScale=displayScale;
    Object.assign(shader.uniforms,uniforms);
    shader.fragmentShader=clothHeader+shader.fragmentShader
     .replace('#include <map_fragment>',mapChunk)
     .replace('#include <normal_fragment_maps>',normalChunk)
     .replace('#include <lights_physical_fragment>',`
 vec3 stableNormalDx = dFdx( normal );
 vec3 stableNormalDy = dFdy( normal );
 float stableNormalVariance = dot( stableNormalDx, stableNormalDx ) + dot( stableNormalDy, stableNormalDy );
 roughnessFactor = sqrt( min( 1.0, roughnessFactor * roughnessFactor + min( 0.15, 0.20 * stableNormalVariance ) ) );
 #include <lights_physical_fragment>
`);
   };
   m.customProgramCacheKey=()=> 'fabric-screen-filter-v2';
  }else if(m.name==='Mat_Stitch'||m.name==='Mat_Embroidery'){
   const diameter=m.name==='Mat_Stitch'?.00032:.00026;
   m.transparent=true;m.depthWrite=false;m.forceSinglePass=true;
   m.onBeforeCompile=shader=>{
    shader.uniforms.stableProjectionScale=projectionScale;
    shader.uniforms.stableThreadDiameter={value:diameter};
    shader.fragmentShader=`uniform float stableProjectionScale;\nuniform float stableThreadDiameter;\n`+shader.fragmentShader
     .replace('#include <alphatest_fragment>',`
 float stableThreadPixels = stableThreadDiameter * stableProjectionScale / max( vViewPosition.z, 0.02 );
 float stableThreadCoverage = smoothstep( 0.15, 0.65, stableThreadPixels );
 diffuseColor.a *= stableThreadCoverage;
 if( diffuseColor.a < 0.001 ) discard;
 #include <alphatest_fragment>
`);
   };
   m.customProgramCacheKey=()=>`yarn-screen-coverage-v1-${diameter}`;
  }
  m.needsUpdate=true;
 }
 return {
  material,
  fabric(m,profile){
   material(m);const uniforms=fabricUniforms.get(m);if(!uniforms)return;
   uniforms.stableFabricCrop.value.fromArray(profile.crop);uniforms.stableFabricAverage.value.fromArray(profile.average);
   uniforms.stableFabricMotifs.value.fromArray(profile.motifs);uniforms.stableFabricYarns.value.fromArray(profile.yarns);
   uniforms.stableFabricCustom.value=profile.custom?1:0;
  },
  mesh(ob){
   const tiny=/^(Stitch|Embroidery|Bottom_GripNubs)/.test(ob.name);
   ob.castShadow=!tiny;ob.receiveShadow=false;
   for(const m of Array.isArray(ob.material)?ob.material:[ob.material])material(m);
  },
  viewport({height,renderPixelRatio,displayPixelRatio,fov}){
   const pixelRatio=Math.max(displayPixelRatio,.5);
   displayScale.value=renderPixelRatio/pixelRatio;
   projectionScale.value=height*pixelRatio/(2*Math.tan(fov*Math.PI/360));
  }
 };
}
