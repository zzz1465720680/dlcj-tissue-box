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
export function preset(i:number):Design{const d=initialDesign();if(i===1){d.name='曜石 · 橙线';for(const p of PARTS){d.parts[p].color='#25292b';d.parts[p].edge='#d47939';d.parts[p].thread='#b39b7b';}d.parts.body.perforated=true;for(const p of PARTS.filter(p=>p!=='body'))d.parts[p].perforated=false;d.label.color='#d47939';}if(i===2){d.name='雾蓝 · 白瓷';d.parts.body.color='#87a9bc';for(const p of PARTS)d.parts[p].edge='#4f819e';d.label.color='#4f819e';}return d;}
export const cloneDesign=(d:Design):Design=>JSON.parse(JSON.stringify(d));



