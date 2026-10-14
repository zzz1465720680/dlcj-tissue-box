import pg from 'pg';
import {getConnectionString} from '@netlify/database';
import {createNetlifyDesigns} from '../../server/netlify-designs.mjs';

let pool, handler;
export default async function designsApi(request, context) {
  try {
    pool ||= new pg.Pool({connectionString:getConnectionString(),max:2,idleTimeoutMillis:10000,allowExitOnIdle:true,connectionTimeoutMillis:10000,statement_timeout:10000,query_timeout:15000});
    handler ||= createNetlifyDesigns({db:pool});
    return await handler(request, context);
  } catch {
    return Response.json({error:'云端保存暂时不可用，设计已保留在本机。'},{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
}
export const config = {path:'/api/designs',rateLimit:{windowLimit:60,windowSize:60,aggregateBy:['ip','domain']}};
