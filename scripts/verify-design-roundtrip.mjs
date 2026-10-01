import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialDesign} from '../lib/design.ts';
import {designSchema} from '../lib/schema.ts';
import {createStore} from '../server/domain.mjs';

// Offline, isolated persistence check. Never starts a login bypass or sends SMS.
const store = createStore();
try {
  const first = store.registerVerifiedUser({phone:'+8613800000001'}).user;
  const other = store.registerVerifiedUser({phone:'+8613800000002'}).user;
  const design=initialDesign(); design.name='历史可编辑方案校验';
  design.parts.corner3.color='#87a9bc'; design.parts.body.material='suede';
  design.parts.body.art=[{id:'text',kind:'text',x:.45,y:.25,scale:.55,rotation:15,color:'#344b65',text:'历史方案'},
    {id:'stroke',kind:'stroke',x:0,y:0,scale:1,rotation:0,color:'#d47939',width:.01,points:[[.3,.3],[.6,.35]]},
    {id:'eraser',kind:'stroke',x:0,y:0,scale:1,rotation:0,color:'#000000',width:.02,points:[[.4,.28],[.4,.4]],erase:true}];
  assert.deepEqual(designSchema.parse(JSON.parse(JSON.stringify(design))),design);
  const saved=store.saveDesign(first.id,{design,operationKey:'roundtrip-fixture'});
  assert.deepEqual(store.getDesign(first.id,saved.id).design,design);
  assert.throws(()=>store.getDesign(other.id,saved.id),{status:404});
  assert.equal(store.listGallery().length,0);
  assert.match(readFileSync('app/api/designs/route.ts','utf8'),/status:410/);
  assert.doesNotMatch(readFileSync('app/chatgpt-auth.ts','utf8'),/headers\(|oai-authenticated-user-id/);
  console.log('PASS: editable historical design round-trip, per-user isolation, private by default, legacy header auth retired');
} finally {store.close();}
