import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createNetlifyStore,hashMerchantPassword} from '../../server/netlify-store.mjs';

const deps=resolve(process.env.STORE_NETLIFY_QA_DIR || '.store-data/deployment-tools');
const {PGlite}=await import(pathToFileURL(join(deps,'node_modules/@electric-sql/pglite/dist/index.js')));
const migration=await readFile(new URL('../../netlify/database/migrations/202610040001_merchant_pricing.sql',import.meta.url),'utf8');
const origin='https://store.example.test',password='synthetic-merchant-password-only';
const env={STORE_PUBLIC_ORIGIN:origin,STORE_ADMIN_EMAIL:'merchant@example.test',STORE_ADMIN_PASSWORD_HASH:await hashMerchantPassword(password)};
function pool(pg,{failAudit=false}={}) {
  let tail=Promise.resolve();
  return {query:async(...args)=>{await tail;return pg.query(...args);},connect:async()=>{
    const wait=tail;let release;tail=new Promise(r=>{release=r;});await wait;
    return {query:(sql,args)=>{if(failAudit && sql.startsWith('INSERT INTO dlcj_pricing_audit'))throw new Error('synthetic audit failure');return pg.query(sql,args);},release};
  }};
}
const send=(handler,path,{data,cookie,site=origin,ip='192.0.2.1'}={})=>handler(new Request(origin+'/api/store'+path,{method:data===undefined?'GET':'POST',headers:{...(data===undefined?{}:{'Content-Type':'application/json','Origin':site}),...(cookie?{Cookie:cookie}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})}),{ip});
async function login(handler,ip='192.0.2.1') {
  const response=await send(handler,'/auth/admin/login',{data:{email:env.STORE_ADMIN_EMAIL,password},ip});
  assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly; Secure; SameSite=Lax/);
  return cookie.split(';')[0];
}
test('Netlify pricing: durable save, audit, authorization, replay and restoration',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'dlcj-netlify-pricing-'));let pg;
  try {
    pg=new PGlite(folder);await pg.exec(migration);
    let handler=createNetlifyStore({db:pool(pg),env});
    const initial=(await (await send(handler,'/pricing')).json()).pricing;
    assert.deepEqual([initial.standardFen,initial.customFen,initial.version],[9900,15900,1]);
    assert.equal((await send(handler,'/admin/pricing',{data:{standardFen:1,customFen:1,expectedVersion:1,operationKey:'forged-role-request',role:'admin',userId:'admin'}})).status,401);
    assert.equal((await send(handler,'/admin/pricing',{cookie:'__Host-dlcj_merchant='+'a'.repeat(43)})).status,401);
    assert.equal((await send(handler,'/auth/admin/login',{site:'https://evil.example',data:{email:env.STORE_ADMIN_EMAIL,password}})).status,403);
    assert.equal((await send(handler,'/auth/admin/login',{data:{email:'stranger@example.test',password},ip:'192.0.2.2'})).status,401);
    const cookie=await login(handler);
    assert.equal((await (await send(handler,'/session',{cookie})).json()).user.role,'admin');
    const payload={standardFen:9901,customFen:15901,expectedVersion:1,operationKey:'controlled-price-change-001'};
    assert.equal((await send(handler,'/admin/pricing',{cookie,data:payload})).status,200);
    assert.equal((await send(handler,'/admin/pricing',{cookie,data:payload})).status,200);
    assert.equal((await send(handler,'/admin/pricing',{cookie,data:{...payload,customFen:1}})).status,409);
    const stale=await send(handler,'/admin/pricing',{cookie,data:{...payload,operationKey:'controlled-stale-write-001'}});
    assert.equal(stale.status,409);assert.equal((await stale.json()).error,'PRICE_CHANGED');
    assert.equal((await send(handler,'/admin/pricing',{cookie,data:{...payload,standardFen:1.5,expectedVersion:2,operationKey:'controlled-invalid-write-01'}})).status,422);
    const failing=createNetlifyStore({db:pool(pg,{failAudit:true}),env});
    assert.equal((await send(failing,'/admin/pricing',{cookie,data:{...payload,standardFen:1,expectedVersion:2,operationKey:'controlled-audit-failure-01'}})).status,503);
    const beforeRestart=(await (await send(handler,'/pricing')).json()).pricing;
    assert.deepEqual([beforeRestart.standardFen,beforeRestart.customFen,beforeRestart.version],[9901,15901,2]);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM dlcj_pricing_audit')).rows[0].n,1);
    await pg.close();pg=new PGlite(folder);handler=createNetlifyStore({db:pool(pg),env});
    assert.deepEqual((await (await send(handler,'/pricing')).json()).pricing,beforeRestart);
    assert.equal((await (await send(handler,'/session',{cookie})).json()).user.role,'admin');
    const audit=(await (await send(handler,'/admin/pricing',{cookie})).json()).audit;
    assert.equal(audit.length,1);assert.equal(audit[0].before.standardFen,9900);assert.equal(audit[0].after.standardFen,9901);
    const restore=await send(handler,'/admin/pricing',{cookie,data:{standardFen:initial.standardFen,customFen:initial.customFen,expectedVersion:2,operationKey:'controlled-price-restore-01'}});
    assert.equal(restore.status,200);
    await pg.close();pg=new PGlite(folder);handler=createNetlifyStore({db:pool(pg),env});
    const final=(await (await send(handler,'/pricing')).json()).pricing;
    assert.deepEqual([final.standardFen,final.customFen,final.version],[9900,15900,3]);
    assert.equal((await send(handler,'/orders',{cookie,data:{payment:true}})).status,503);
    assert.equal((await send(handler,'/auth/otp/request',{data:{phone:'+8613800000000'}})).status,503);
    assert.equal((await send(handler,'/auth/logout',{cookie,data:{}})).status,200);
    assert.equal((await send(handler,'/admin/pricing',{cookie})).status,401);
  } finally {await pg?.close();if(!resolve(folder).startsWith(join(resolve(tmpdir()),'dlcj-netlify-pricing-')))throw new Error('Unsafe temporary cleanup path');await rm(folder,{recursive:true,force:true});}
});
test('Netlify merchant login: persistent limits and credential rotation',async()=>{
  const pg=new PGlite();await pg.exec(migration);let clock=Date.now();
  try {
    const db=pool(pg),handler=createNetlifyStore({db,env,now:()=>clock});
    const cookie=await login(handler);
    const rotated=createNetlifyStore({db,env:{...env,STORE_ADMIN_PASSWORD_HASH:await hashMerchantPassword(password+'-rotated')}});
    assert.equal((await send(rotated,'/admin/pricing',{cookie})).status,401);
    clock+=8*60*60*1000+1000;
    assert.equal((await send(handler,'/admin/pricing',{cookie})).status,401);
    for(let i=0;i<6;i++)assert.equal((await send(handler,'/auth/admin/login',{data:{email:env.STORE_ADMIN_EMAIL,password:'incorrect'},ip:'192.0.2.10'})).status,401);
    const restarted=createNetlifyStore({db:pool(pg),env,now:()=>clock});
    const limited=await send(restarted,'/auth/admin/login',{data:{email:env.STORE_ADMIN_EMAIL,password},ip:'192.0.2.10'});
    assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);
    assert.equal((await send(handler,'/auth/admin/login',{data:{email:env.STORE_ADMIN_EMAIL,password},ip:'untrusted'})).status,503);
  } finally {await pg.close();}
});
