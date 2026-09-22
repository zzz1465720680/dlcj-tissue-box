import * as THREE from 'three';

// The saved revision7 node group, ported without re-unwrapping HoleUV.
// glTF flips V; restore Blender's chart before evaluating its metric (g00,g01,g11).
// Keep these display dimensions fixed, independent of artwork and grain UVs.
export const holeShader = /* glsl */`
varying vec2 vPhysicalHoleUv;
varying vec3 vPhysicalHoleMetric;
float metricDistance(vec2 center) {
  vec2 d = (fract(vPhysicalHoleUv + 0.5 - center) - 0.5) * vec2(2.4, 4.2);
  return sqrt(max(vPhysicalHoleMetric.x*d.x*d.x +
    2.0*vPhysicalHoleMetric.y*d.x*d.y + vPhysicalHoleMetric.z*d.y*d.y, 0.0));
}
float holeDistance() {
  return min(metricDistance(vec2(0.25)), metricDistance(vec2(0.75)));
}
`;

export function applyPerforation<T extends THREE.Material>(material:T, rim=true):T {
  // Declare uv2 even in the shadow shader, which has no image alpha map.
  const configurable=material as T & {defines?:Record<string,unknown>};
  configurable.defines = {
    ...configurable.defines, USE_UV2: '',
  };
  material.onBeforeCompile = shader => {
    shader.vertexShader = `attribute vec3 _web_metric;
varying vec2 vPhysicalHoleUv;
varying vec3 vPhysicalHoleMetric;
` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
vPhysicalHoleUv = vec2(uv2.x, 1.0 - uv2.y);
vPhysicalHoleMetric = _web_metric;`);
    shader.fragmentShader = holeShader + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
float physicalHoleEdge = holeDistance() - 0.43;
float holeAA = max(fwidth(physicalHoleEdge), 0.023);
// Evaluate derivatives before alpha discard so all fragment quad lanes contribute.
float rimSlope = 1.1 * physicalHoleEdge / (0.13 * 0.13) * exp(-pow(physicalHoleEdge / 0.13, 2.0)) * 0.00234;
vec2 rimGradient = rimSlope * vec2(dFdx(physicalHoleEdge), dFdy(physicalHoleEdge));
diffuseColor.a *= smoothstep(-holeAA * 0.5, holeAA * 0.5, physicalHoleEdge);
#include <alphatest_fragment>`);
    if (rim) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
#include <normal_fragment_maps>
// Blender Bump: distance .00018 m, strength .65; product is displayed at 20x.
vec3 leatherSX = dFdx(-vViewPosition), leatherSY = dFdy(-vViewPosition);
vec3 leatherR1 = cross(leatherSY, normal), leatherR2 = cross(normal, leatherSX);
float leatherDet = dot(leatherSX, leatherR1);
vec3 leatherGrad = sign(leatherDet) * (rimGradient.x*leatherR1 + rimGradient.y*leatherR2);
normal = normalize(abs(leatherDet)*normal - leatherGrad);`);
  };
  material.customProgramCacheKey = () => `revision7-physical-holes-${rim ? 'surface' : 'depth'}-2`;
  return material;
}
