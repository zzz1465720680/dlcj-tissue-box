import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {z} from 'zod';

function compiled(file){return ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;}
const designModule=await import('data:text/javascript;base64,'+Buffer.from(compiled('lib/design.ts')).toString('base64'));
const schemaSource=compiled('lib/schema.ts').replace(/import .*?from 'zod';/, '').replace('export const designSchema','const designSchema');
const schema=new Function('z',schemaSource+'; return designSchema;')(z);
const design=designModule.initialDesign();
design.name='revision7 本地保存校验';
design.parts.corner3.color='#87a9bc';design.parts.corner3.perforated=false;
design.parts.body.art=[{id:'legacy-text',kind:'text',x:.45,y:.25,scale:.55,rotation:15,color:'#344b65',text:'REVISION 7'},
  {id:'legacy-stroke',kind:'stroke',x:0,y:0,scale:1,rotation:0,color:'#d47939',width:.01,points:[[.3,.3],[.6,.35]]},
  {id:'legacy-eraser',kind:'stroke',x:0,y:0,scale:1,rotation:0,color:'#000000',width:.02,points:[[.4,.28],[.4,.4]],erase:true}];
design.label.enabled=true;design.label.text='R7';
assert.deepEqual(schema.parse(JSON.parse(JSON.stringify(design))),design);
const records=new Map();let user=null;
const bucket={
  async put(key,text,options){records.set(key,{text,customMetadata:options.customMetadata,uploaded:new Date()});},
  async get(key){const o=records.get(key);return o?{json:async()=>JSON.parse(o.text)}:null;},
  async list({prefix}){return {objects:[...records].filter(([k])=>k.startsWith(prefix)).map(([key,value])=>({key,...value}))};},
};
const routeCode=compiled('app/api/designs/route.ts').replace(/^import .*;$/gm,'').replace(/export /g,'');
const route=new Function('env','getChatGPTUser','designSchema',routeCode+';return {GET,POST};')({BUCKET:bucket},async()=>user,schema);
const origin='http://localhost:5173';const request=(data,headers={})=>new Request(origin+'/api/designs',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...headers},body:JSON.stringify(data)});
assert.equal((await route.POST(request(design))).status,401);
user={userId:'r7-test/user-a'};
const saved=await (await route.POST(request(design))).json();assert(saved.id);
assert(records.has('designs/r7-test%2Fuser-a/'+saved.id+'.json'));
assert.deepEqual((await (await route.GET(new Request(origin+'/api/designs?id='+saved.id))).json()).design,design);
user={userId:'r7-test/user-b'};
assert.equal((await route.GET(new Request(origin+'/api/designs?id='+saved.id))).status,404);
assert.deepEqual((await (await route.GET(new Request(origin+'/api/designs'))).json()).designs,[]);
assert.equal((await route.POST(request(design,{Origin:'https://different.example'}))).status,403);
assert.equal((await route.POST(request({...design,version:2}))).status,400);
assert.equal((await route.GET(new Request(origin+'/api/designs?id=../other'))).status,400);

// Real local Vinext + Miniflare R2 path, using the project's existing local login.
const anonymous=await fetch(origin+'/api/designs');assert.equal(anonymous.status,401);
const forged=await fetch(origin+'/api/designs',{headers:{'oai-authenticated-user-id':'forged','oai-authenticated-user-email':'forged@example.test'}});assert.equal(forged.status,401);
const signIn=await fetch(origin+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});
assert.equal(signIn.status,302);
const cookie=signIn.headers.get('set-cookie').split(';')[0];
const response=await fetch(origin+'/api/designs',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie},body:JSON.stringify(design)});
assert.equal(response.status,200,await response.clone().text());const localSaved=await response.json();
const loaded=await fetch(origin+'/api/designs?id='+localSaved.id,{headers:{Cookie:cookie}});
assert.deepEqual((await loaded.json()).design,design);
const library=await (await fetch(origin+'/api/designs',{headers:{Cookie:cookie}})).json();
assert(library.designs.some(d=>d.id===localSaved.id));
const report={version1_schema_unchanged:true,all_part_ids_preserved:true,editable_art_roundtrip:true,
  two_user_isolation:'same route functions, isolated R2 test double: passed',
  local_runtime_r2_roundtrip:true,anonymous_rejected:true,forged_identity_headers_rejected:true,
  invalid_version_rejected:true,cross_origin_rejected:true,local_test_design_id:localSaved.id,
  production_auth_and_remote_r2:'unchanged; not exercised against production (local-only task)'};
fs.writeFileSync('checks/revision7/design-roundtrip.json',JSON.stringify(report,null,2));
fs.writeFileSync('checks/revision7/editable-test-design.json',JSON.stringify({design},null,2));
console.log(JSON.stringify(report,null,2));
