import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {initialDesign} from '../lib/design.ts';
const compile=value=>ts.transpileModule(value,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const dataModule=value=>'data:text/javascript;base64,'+Buffer.from(value).toString('base64');
async function loadClient(preview){
  const helper=`const __STORE_FRONTEND_PREVIEW__=${preview};\n`+compile(readFileSync(new URL('../lib/frontend-preview.ts',import.meta.url),'utf8'));
  const source=compile(readFileSync(new URL('../lib/store-client.ts',import.meta.url),'utf8'));
  const pricing=compile(readFileSync(new URL('../lib/pricing.ts',import.meta.url),'utf8'));
  return import(dataModule(source.replace("'./frontend-preview'",JSON.stringify(dataModule(helper))).replace("'./pricing'",JSON.stringify(dataModule(pricing)))));
}
const client=await loadClient(false);
const oldFetch=globalThis.fetch;
const storage=new Map();
globalThis.sessionStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
globalThis.window={location:{origin:'https://store.example',href:'https://store.example/'},history:{replaceState(){}}};
const reply=(value,status=200)=>Response.json(value,{status});
test.after(()=>{globalThis.fetch=oldFetch;delete globalThis.sessionStorage;delete globalThis.window;});

test('frontend preview blocks store transport and referral capture before any network request',async()=>{
  const preview=await loadClient(true);let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('Unexpected request');};
  await assert.rejects(preview.storeRequest('/session'),{code:'FRONTEND_PREVIEW'});
  await assert.rejects(preview.storePost('/orders',{operationKey:'synthetic'}),{code:'FRONTEND_PREVIEW'});
  assert.equal(await preview.captureReferralFromUrl(),false);assert.equal(calls,0);
});

test('login return destinations reject external, protocol-relative, slash confusion and control characters',()=>{
  for(const raw of ['https://evil.test','//evil.test','/\\evil.test','/\r\nevil','javascript:alert(1)','/login?return_to=//evil'])assert.equal(client.safeReturnTo(raw),'/my');
  assert.equal(client.safeReturnTo('/customize?design=one#view'),'/customize?design=one#view');
});
test('design transport preserves local fetch and uses bounded private chunks and same-origin credentials',async()=>{
  const requests=[];
  globalThis.fetch=async(url,init)=>{requests.push({url,init});if(url.endsWith('/uploads'))return reply({uploadId:'test-upload',chunkSize:1_000_000});if(url.endsWith('/complete'))return reply({design:{id:'saved-id',createdAt:'2026-09-30'}});return reply({nextIndex:1});};
  const design=initialDesign();const original=JSON.stringify(design);
  const result=await client.designRequest('/api/designs',{method:'POST',body:original});assert.equal(result.status,200);assert.equal((await result.json()).id,'saved-id');assert.equal(JSON.stringify(design),original);
  assert.equal(requests.length,3);assert.equal(requests[0].init.credentials,'same-origin');assert.equal(requests[1].init.method,'PUT');assert(requests[1].init.body.byteLength<=1_000_000);assert(!requests.some(r=>r.url==='/api/designs'));
  const firstKey=JSON.parse(requests[0].init.body).operationKey;
  await client.designRequest('/api/designs',{method:'POST',body:original});assert.notEqual(JSON.parse(requests[3].init.body).operationKey,firstKey);
  assert.equal(JSON.parse(requests[3].init.body).kind,'design');
});
test('ambiguous design completion failure retains idempotency key and cloud version target',async()=>{
  const begin=[];let fail=true;
  globalThis.fetch=async(url,init)=>{if(url.endsWith('/uploads')){begin.push(JSON.parse(init.body));return reply({uploadId:'retry-upload',chunkSize:1_000_000});}if(url.endsWith('/complete')){if(fail){fail=false;throw new Error('connection lost after commit');}return reply({design:{id:'cloud-id',createdAt:'2026-09-30'}});}return reply({nextIndex:1});};
  const input=()=>({method:'POST',headers:{'X-Design-Id':'cloud-id'},body:JSON.stringify(initialDesign())});
  assert.equal((await client.designRequest('/api/designs',input())).status,503);
  assert.equal((await client.designRequest('/api/designs',input())).status,200);
  assert.equal(begin[0].operationKey,begin[1].operationKey);assert.equal(begin[1].id,'cloud-id');
  await client.designRequest('/api/designs',input());assert.notEqual(begin[1].operationKey,begin[2].operationKey);
});
test('transport rejects wrong target without any network transmission',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('unexpected');};
  assert.equal((await client.designRequest('https://elsewhere.test/api/designs')).status,400);assert.equal((await client.designRequest('/api/other')).status,400);assert.equal(calls,0);
});
test('unconfigured static host and login-required API return honest recoverable errors',async()=>{
  globalThis.fetch=async()=>new Response('<html>static page</html>',{headers:{'content-type':'text/html'}});
  await assert.rejects(client.storeRequest('/session'),{code:'SERVICE_UNAVAILABLE'});
  globalThis.fetch=async()=>reply({error:'AUTH_REQUIRED',message:'请先登录'},401);
  const response=await client.designRequest('/api/designs');assert.equal(response.status,401);assert.equal((await response.json()).error,'请先登录');
});
test('operations reuse keys only for identical bounded purpose and data',async()=>{
  const a=await client.stableOperationKey('order',{kind:'standard',quantity:1});
  assert.equal(await client.stableOperationKey('order',{kind:'standard',quantity:1}),a);
  assert.notEqual(await client.stableOperationKey('order',{kind:'standard',quantity:2}),a);
  assert.notEqual(await client.stableOperationKey('design',{kind:'standard',quantity:1}),a);
});

test('malformed upload chunk size fails safely without entering an upload loop',async()=>{
  for(const size of [0,-1,1.5,1_000_001]){
    let calls=0;globalThis.fetch=async()=>{calls++;return reply({uploadId:'broken',chunkSize:size});};
    await assert.rejects(client.uploadStoreDesign(initialDesign()),{code:'INVALID_UPLOAD_RESPONSE'});assert.equal(calls,1);
  }
});
test('oversize private design is rejected locally without transmission',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('must not send');};
  await assert.rejects(client.uploadStoreDesign({...initialDesign(),name:'x'.repeat(12_000_001)}),{code:'DESIGN_TOO_LARGE'});assert.equal(calls,0);
});
