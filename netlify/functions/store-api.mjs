import pg from 'pg';
import {getConnectionString} from '@netlify/database';
import {createNetlifyStore} from '../../server/netlify-store.mjs';

let pool, handler;
export default async function storeApi(request, context) {
  try {
    pool ||= new pg.Pool({connectionString:getConnectionString(),max:2,idleTimeoutMillis:10000,allowExitOnIdle:true,connectionTimeoutMillis:10000,statement_timeout:10000,query_timeout:15000,idle_in_transaction_session_timeout:15000});
    handler ||= createNetlifyStore({db:pool});
    return await handler(request,context);
  } catch {
    return Response.json({error:'SERVICE_UNAVAILABLE',message:'服务暂时不可用，请稍后重试。'},{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
}
export const config = {path:'/api/store/*',rateLimit:{windowLimit:600,windowSize:60,aggregateBy:['ip','domain']}};
