import * as THREE from 'three';
import {HorizontalBlurShader} from 'three/addons/shaders/HorizontalBlurShader.js';
import {VerticalBlurShader} from 'three/addons/shaders/VerticalBlurShader.js';

/** A cached, soft footprint. Its blur never touches the leather's self shadows.
 * Based on Three.js's contact-shadow technique; refresh only for shape changes.
 */
export function createContactShadow(scene:THREE.Scene,renderer:THREE.WebGLRenderer){
  const group=new THREE.Group();group.position.y=-.608;scene.add(group);
  const texture=new THREE.WebGLRenderTarget(512,512),scratch=new THREE.WebGLRenderTarget(512,512);
  texture.texture.generateMipmaps=scratch.texture.generateMipmaps=false;
  const geometry=new THREE.PlaneGeometry(5.2,3.9).rotateX(Math.PI/2);
  const material=new THREE.MeshBasicMaterial({map:texture.texture,transparent:true,opacity:.30,depthWrite:false,toneMapped:false});
  const floor=new THREE.Mesh(geometry,material);floor.scale.y=-1;floor.renderOrder=1;group.add(floor);
  const camera=new THREE.OrthographicCamera(-2.6,2.6,1.95,-1.95,0,2.5);
  camera.rotation.x=Math.PI/2;group.add(camera);
  const depth=new THREE.MeshDepthMaterial({side:THREE.DoubleSide});
  depth.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace(
      'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
      'gl_FragColor = vec4( vec3( 0.0 ), pow(1.0 - fragCoordZ, 2.0) );',
    );
  };
  depth.customProgramCacheKey=()=> 'product-contact-depth-v1';
  const horizontal=new THREE.ShaderMaterial(HorizontalBlurShader),vertical=new THREE.ShaderMaterial(VerticalBlurShader);
  horizontal.depthTest=vertical.depthTest=false;
  const blurPlane=new THREE.Mesh(geometry,horizontal);blurPlane.visible=false;group.add(blurPlane);
  const blur=(amount:number)=>{
    blurPlane.visible=true;blurPlane.material=horizontal;
    horizontal.uniforms.tDiffuse.value=texture.texture;horizontal.uniforms.h.value=amount/256;
    renderer.setRenderTarget(scratch);renderer.render(blurPlane,camera);
    blurPlane.material=vertical;
    vertical.uniforms.tDiffuse.value=scratch.texture;vertical.uniforms.v.value=amount/256;
    renderer.setRenderTarget(texture);renderer.render(blurPlane,camera);blurPlane.visible=false;
  };
  return {
    update(){
      const target=renderer.getRenderTarget(),color=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();
      const background=scene.background,override=scene.overrideMaterial,shadows=renderer.shadowMap.enabled;
      try{
        floor.visible=false;scene.background=null;scene.overrideMaterial=depth;renderer.shadowMap.enabled=false;
        renderer.setClearColor(0x000000,0);renderer.setRenderTarget(texture);renderer.render(scene,camera);
        scene.overrideMaterial=null;blur(3.5);blur(1.4);
      }finally{
        blurPlane.visible=false;floor.visible=true;scene.background=background;scene.overrideMaterial=override;
        renderer.shadowMap.enabled=shadows;renderer.setClearColor(color,alpha);renderer.setRenderTarget(target);
      }
    },
    dispose(){group.removeFromParent();texture.dispose();scratch.dispose();geometry.dispose();material.dispose();depth.dispose();horizontal.dispose();vertical.dispose();},
  };
}
