import {Artwork} from './design';
const images=new Map<string,HTMLImageElement>();
const pending=new Map<string,Promise<HTMLImageElement>>();
export function loadArt(src:string):Promise<HTMLImageElement>{
  if(images.has(src))return Promise.resolve(images.get(src)!);
  if(pending.has(src))return pending.get(src)!;
  const promise=new Promise<HTMLImageElement>((resolve,reject)=>{const im=new Image();im.onload=()=>{images.set(src,im);pending.delete(src);resolve(im)};im.onerror=()=>{pending.delete(src);reject(new Error('图片无法读取'))};im.src=src;});pending.set(src,promise);return promise;
}
export function paintArtwork(ctx:CanvasRenderingContext2D,art:Artwork[],size=1024){
  for(const a of art){ctx.save();ctx.globalCompositeOperation=a.erase?'destination-out':'source-over';
    if(a.kind==='stroke'){ctx.beginPath();ctx.strokeStyle=a.color;ctx.lineWidth=(a.width??.008)*size;ctx.lineCap='round';ctx.lineJoin='round';(a.points??[]).forEach((p,i)=>i?ctx.lineTo(p[0]*size,p[1]*size):ctx.moveTo(p[0]*size,p[1]*size));ctx.stroke();}
    else{ctx.translate(a.x*size,a.y*size);ctx.rotate(a.rotation*Math.PI/180);
      if(a.kind==='text'){ctx.fillStyle=a.color;ctx.font=`500 ${a.scale*size*.14}px "Microsoft YaHei", sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(a.text??'',0,0);}
      else if(a.src&&images.has(a.src)){const im=images.get(a.src)!;const w=a.scale*size*.45;ctx.drawImage(im,-w/2,-w*im.height/im.width/2,w,w*im.height/im.width);}
    }ctx.restore();
  }
}
