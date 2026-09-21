import {z} from 'zod';
const color=z.string().regex(/^#[0-9a-fA-F]{6}$/);
const img=z.string().max(2500000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/);
const artwork=z.object({id:z.string().max(80),kind:z.enum(['image','text','stroke']),x:z.number().min(-1).max(2),y:z.number().min(-1).max(2),scale:z.number().min(.05).max(4),rotation:z.number().min(-180).max(180),src:img.optional(),text:z.string().max(80).optional(),color,points:z.array(z.tuple([z.number().min(-1).max(2),z.number().min(-1).max(2)])).max(6000).optional(),width:z.number().min(.001).max(.1).optional(),erase:z.boolean().optional()});
const surface=z.object({color,material:z.enum(['grain','smooth','suede']),perforated:z.boolean(),edge:color,thread:color,art:z.array(artwork).max(200)});
export const designSchema=z.object({version:z.literal(1),name:z.string().min(1).max(60),parts:z.object({body:surface,corner0:surface,corner1:surface,corner2:surface,corner3:surface,trim:surface}),label:z.object({enabled:z.boolean(),color,ink:color,text:z.string().max(12),image:img.optional()})});
