import type * as THREE from 'three';

export type RenderReport = {
  frames:number; elapsedMs:number; fps:number; frameP50:number; frameP95:number;
  slowFrames:number; cpuP95:number; drawCalls:number; triangles:number;
  geometryCount:number; textureCount:number; programs:number;
  canvas:[number,number]; pixelRatio:number; devicePixelRatio:number; renderer:string;
};
const percentile=(data:number[],q:number)=>[...data].sort((a,b)=>a-b)[Math.floor((data.length-1)*q)]??0;
export function createRenderProfiler(renderer:THREE.WebGLRenderer){
  let renderedFrames=0;
  let run:{start:number;last:number;intervals:number[];cpu:number[];resolve:(v:RenderReport)=>void}|null=null;
  return {
    get renderedFrames(){return renderedFrames;},
    get active(){return !!run;},
    start(){return new Promise<RenderReport>(resolve=>{run={start:performance.now(),last:0,intervals:[],cpu:[],resolve};});},
    sample(cpu:number){
      renderedFrames++;
      if(!run)return;const now=performance.now();
      if(now-run.start<1000)return; // Shader/texture warm-up does not enter rotation timing.
      if(run.last){run.intervals.push(now-run.last);run.cpu.push(cpu);}run.last=now;
      if(now-run.start<7000)return;
      const {intervals,cpu:times,resolve}=run;run=null;
      const total=intervals.reduce((a,b)=>a+b,0),gl=renderer.getContext();
      const debug=gl.getExtension('WEBGL_debug_renderer_info');
      resolve({frames:intervals.length,elapsedMs:total,fps:intervals.length*1000/total,
        frameP50:percentile(intervals,.5),frameP95:percentile(intervals,.95),
        slowFrames:intervals.filter(t=>t>33.4).length,cpuP95:percentile(times,.95),
        drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
        geometryCount:renderer.info.memory.geometries,textureCount:renderer.info.memory.textures,
        programs:renderer.info.programs?.length??0,canvas:[renderer.domElement.width,renderer.domElement.height],
        pixelRatio:renderer.getPixelRatio(),devicePixelRatio:window.devicePixelRatio,
        renderer:debug?String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)):String(gl.getParameter(gl.RENDERER))});
    },
  };
}
