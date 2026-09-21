// The normalized silhouettes use the same flat cut-piece coordinates as Blender.
export function patternOutline(part:string):number[][]{
  if(part==='body'){const a=.150273224,b=1-a,t1=.0525/.33,t2=.1125/.33,t3=.2175/.33,t4=.2775/.33;return [[0,0],[1,0],[1,t1],[b,t1],[b,t2],[1,t2],[1,t3],[b,t3],[b,t4],[1,t4],[1,1],[0,1],[0,t4],[a,t4],[a,t3],[0,t3],[0,t2],[a,t2],[a,t1],[0,t1]];}
  if(part==='trim')return [[0,.38],[1,.38],[1,.62],[0,.62]];
  const points:number[][]=[];const limits=(q:number)=>{const root=Math.sqrt(Math.max(0,Math.sin(Math.PI*q)));return [(.032-.013*Math.exp(-Math.pow((q-.5)/.20,2)))*root,-.029*root];};
  for(let i=0;i<=84;i++){const q=i/84;points.push([(limits(q)[0]+.03)/.065,q]);}
  const notchA=.25,notchB=.75;const qs=Array.from(new Set([...Array.from({length:85},(_,i)=>i/84),notchA,notchB])).sort((a,b)=>b-a);
  for(const q of qs){const outside=(limits(q)[1]+.03)/.065,inside=.03/.065;if(Math.abs(q-notchB)<1e-8)points.push([outside,q],[inside,q]);else if(Math.abs(q-notchA)<1e-8)points.push([inside,q],[outside,q]);else points.push([q>notchA&&q<notchB?inside:outside,q]);}
  return points;
}
