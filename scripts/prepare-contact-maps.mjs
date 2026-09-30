import sharp from 'sharp';
import fs from 'node:fs/promises';
const input='G:/DLCJ/output/surface-refinement-20260929/occlusion';
const output='public/materials/contact-20260929';
await fs.mkdir(output,{recursive:true});
const report=[];
for(const part of ['body','corner0','corner1','corner2','corner3']){
  // These are linear shading data, so preserve values with lossless encoding.
  await sharp(input+'/'+part+'.png').removeAlpha().webp({lossless:true}).toFile(output+'/'+part+'.webp');
  const meta=await sharp(output+'/'+part+'.webp').metadata();
  report.push({part,width:meta.width,height:meta.height,bytes:(await fs.stat(output+'/'+part+'.webp')).size});
}
await fs.writeFile('G:/DLCJ/output/surface-refinement-20260929/web-assets.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
