export type Part = 'body' | 'corner0' | 'corner1' | 'corner2' | 'corner3' | 'trim';
export type Material = 'grain' | 'smooth' | 'suede';
export type Artwork = {id:string;kind:'image'|'text'|'stroke';x:number;y:number;scale:number;rotation:number;src?:string;text?:string;color:string;points?:number[][];width?:number;erase?:boolean};
export type Surface = {color:string;material:Material;perforated:boolean;edge:string;thread:string;art:Artwork[]};
export type Design = {version:1;name:string;parts:Record<Part,Surface>;label:{enabled:boolean;color:string;ink:string;text:string;image?:string};};
export const PARTS:Part[]=['body','corner0','corner1','corner2','corner3','trim'];
export const PART_NAMES:Record<Part,string>={body:'主体皮料',corner0:'包角 01',corner1:'包角 02',corner2:'包角 03',corner3:'包角 04',trim:'抽纸口饰边'};
export const PALETTE=[{name:'珍珠白',hex:'#ecebe5'},{name:'曜石黑',hex:'#25292b'},{name:'岩石灰',hex:'#828786'},{name:'马鞍棕',hex:'#95694d'},{name:'焦糖橙',hex:'#d47939'},{name:'酒红',hex:'#802f3d'},{name:'松石绿',hex:'#416e63'},{name:'雾蓝',hex:'#87a9bc'},{name:'胭脂粉',hex:'#cf9b9d'},{name:'柠檬黄',hex:'#dfc457'},{name:'深海蓝',hex:'#344b65'},{name:'草木绿',hex:'#95b04f'}];
const surface=(color:string,perforated=false):Surface=>({color,material:'grain',perforated,edge:'#3e9dbe',thread:'#dfded5',art:[]});
export function initialDesign():Design{return {version:1,name:'白瓷 · 湖蓝',parts:{body:surface('#ecebe5'),corner0:surface('#ecebe5',true),corner1:surface('#ecebe5',true),corner2:surface('#ecebe5',true),corner3:surface('#ecebe5',true),trim:surface('#ecebe5',true)},label:{enabled:false,color:'#222c28',ink:'#eee9df',text:'DLCJ'}};}
export const PRESETS=[
  {id:'porcelain-blue',name:'白瓷 · 湖蓝'},
  {id:'black-coral',name:'曜石 · 珊瑚红'},
  {id:'forest-linen',name:'森林 · 亚麻'},
] as const;
export function preset(i:number):Design{
  const d=initialDesign();
  if(i===1){
    d.name=PRESETS[1].name;
    for(const p of PARTS){d.parts[p].color='#252d30';d.parts[p].edge='#eb5968';d.parts[p].thread='#596064';d.parts[p].perforated=p!=='body';}
    d.parts.body.color='#273137';d.parts.body.material='grain';d.parts.trim.thread='#b5767d';
    d.label.color='#252d30';d.label.ink='#d9d8d1';
  }
  if(i===2){
    d.name=PRESETS[2].name;
    for(const p of PARTS){d.parts[p].edge='#b39a71';d.parts[p].thread='#d4c7ad';}
    d.parts.body.color='#365d52';d.parts.body.perforated=false;
    for(const p of PARTS.filter(p=>p.startsWith('corner'))){d.parts[p].color='#d5cbb6';d.parts[p].perforated=true;}
    d.parts.trim.color='#365d52';d.parts.trim.thread='#9bbaa9';
    d.label={enabled:true,color:'#365d52',ink:'#e5d9bf',text:'DLCJ'};
  }
  return d;
}
export const cloneDesign=(d:Design):Design=>JSON.parse(JSON.stringify(d));



