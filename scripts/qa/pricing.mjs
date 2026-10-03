/** Actual React UI against an isolated loopback HTTP API and SQLite, with synthetic identities only. */
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {webcrypto, randomUUID} from 'node:crypto';
import {createStore} from '../../server/domain.mjs';
import {createStoreServer} from '../../server/http.mjs';
import {initialDesign} from '../../lib/design.ts';
import {INITIAL_PRICING} from '../../lib/pricing.ts';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const requireRepo = createRequire(path.join(repo, 'package.json'));
const requireQA = createRequire(path.join(process.env.STORE_UI_QA_DIR || repo, 'package.json'));
const {JSDOM} = requireQA('jsdom'), {buildSync} = requireQA('esbuild');
const tmp = mkdtempSync(path.join(tmpdir(), 'dlcj-pricing-ui-'));
const bundle = path.join(tmp, 'pricing.cjs');
buildSync({stdin: {contents: "export {default as Admin} from './components/store-admin'; export {default as Checkout} from './components/store-checkout'; export {default as Home} from './components/store-home'; export {default as PriceNote} from './components/customization-price-note'; export {buildInquiryText,buildInquiryJson,inquiryContentKey} from './lib/purchase';", resolveDir: repo, loader: 'tsx'}, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, alias: {'@': repo, react: path.join(repo,'node_modules/react')}, external: [path.join(repo,'node_modules/react'),path.join(repo,'node_modules/react/*')], jsx: 'automatic'});
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {url: 'http://pricing.example.test/', pretendToBeVisual: true});
Object.assign(globalThis, {window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, Node: dom.window.Node, DOMException: dom.window.DOMException, sessionStorage: dom.window.sessionStorage, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true});
Object.defineProperty(globalThis, 'navigator', {value: dom.window.navigator, configurable: true});
Object.defineProperty(globalThis, 'crypto', {value: webcrypto, configurable: true});
window.matchMedia = () => ({matches: true, addEventListener() {}, removeEventListener() {}});
const nativeFetch = globalThis.fetch;
const React = requireRepo('react'), {act} = React, {createRoot} = requireRepo('react-dom/client');
const ui = requireRepo(bundle);
const store = createStore();
const customer = store.registerVerifiedUser({phone: '13800000001'}).user;
store.registerVerifiedUser({phone: '13800000003'}); const admin = store.bootstrapAdmin({phone: '13800000003'});
const sent = [];
const app = createStoreServer({store, origin: 'http://pricing.example.test', secret: 'synthetic-ui-pricing-secret-do-not-use-live-12345', testMode: true, providers: {sms: {available: true, sendOtp: async value => sent.push(value)}, email: {available: false}}});
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
async function cookieFor(phone) {const challenge = await app.auth.requestOtp({phone, ip: '127.0.0.1'}); return app.auth.verifyOtp({phone, ip: '127.0.0.1', challengeId: challenge.challengeId, code: sent.at(-1).code}).cookie.split(';')[0];}
const customerCookie = await cookieFor('13800000001'), adminCookie = await cookieFor('13800000003');
let cookie = customerCookie, root, calls = [], intercept;
const passes = [];
const $ = selector => document.querySelector(selector);
const text = () => document.body.textContent;
const button = label => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === label);
globalThis.fetch = async (url, init = {}) => {
  const call = {url: String(url), method: init.method || 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : null}; calls.push(call);
  const execute = () => nativeFetch(base + call.url, {...init, headers: {...init.headers, cookie, ...(call.method !== 'GET' ? {origin: 'http://pricing.example.test'} : {})}});
  return intercept ? intercept(call, execute) : execute();
};
const flush = () => act(async () => {await new Promise(resolve => setTimeout(resolve, 25));});
async function until(condition) {for (let i=0;i<120;i++) {if(condition())return; await flush();} throw new Error('UI did not reach expected state: '+text().slice(-1200));}
async function mount(Component, url, asAdmin = false, interception = null) {
  if (root) await act(async () => root.unmount());
  cookie = asAdmin ? adminCookie : customerCookie; calls = []; intercept = interception;
  window.history.replaceState({}, '', url); root = createRoot($('#root'));
  await act(async () => root.render(React.createElement(Component))); await flush();
}
async function click(el) {assert.ok(el, 'button exists'); await act(async () => el.click()); await flush();}
async function input(id, value) {const el = $(id); assert.ok(el, id); const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype; await act(async () => {Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new window.Event('input',{bubbles:true}));});}
async function submit() {await act(async () => $('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}))); await flush();}
async function address() {for (const [id,value] of [['name','合成测试客户'],['phone','13800000001'],['province','测试省'],['city','测试市'],['district','测试区'],['detail','合成测试街道123号']]) await input('#checkout-'+id,value); await click([...document.querySelectorAll('input[type="checkbox"]')].at(-1));}
const update = values => store.adminUpdatePricing(admin.id, {standardFen: store.getPricing().standardFen, customFen: store.getPricing().customFen, expectedVersion: store.getPricing().version, operationKey: randomUUID(), ...values});
async function check(name, run) {await run(); passes.push(name); console.log('PASS '+name);}
try {
  await check('Storefront initially reads the unchanged 99/159 from the actual API', async () => {
    await mount(ui.Home, '/tissue-box'); await until(() => $('.sh-price').textContent.includes('99'));
    assert.match(text(), /159/); const url = new URL($('.sh-buy a').href); assert.equal(url.searchParams.get('pricingVersion'), '1'); assert.equal(url.searchParams.get('unitPriceFen'), '9900');
    assert.equal(store.getPricing().standardFen, INITIAL_PRICING.standardFen);
  });
  await check('Existing admin page edits prices with cents, records actor, and retains values after remount', async () => {
    await mount(ui.Admin, '/admin', true); await until(() => button('商品定价')); await click(button('商品定价')); await until(() => $('#pricing-standard'));
    assert.equal($('#pricing-standard').value,'99'); assert.equal($('#pricing-custom').value,'159');
    await input('#pricing-standard','109.01'); await input('#pricing-custom','169.99'); await click($('form input[type="checkbox"]')); await submit();
    await until(() => text().includes('商品价格已保存')); assert.equal(store.getPricing().standardFen,10901); assert.equal(store.getPricing().customFen,16999);
    assert.equal(store.listPricingAudit(admin.id)[0].actorId,admin.id);
    await mount(ui.Admin, '/admin', true); await until(() => button('商品定价')); await click(button('商品定价')); await until(() => $('#pricing-standard'));
    assert.equal($('#pricing-standard').value,'109.01'); assert.match(text(), /99.*109.01/);
  });
  await check('Refreshed storefront and inquiry exports show the database prices and quantity totals', async () => {
    await mount(ui.Home,'/tissue-box'); await until(() => $('.sh-price').textContent.includes('109.01')); assert.match(text(),/169.99/);
    const pricing=store.getPricing(), design=initialDesign(), draft={quantity:2,note:'合成备注'};
    assert.match(ui.buildInquiryText(design,draft,new Date(),pricing),/¥339.98/);
    assert.equal(JSON.parse(ui.buildInquiryJson(design,draft,new Date(),pricing)).request.goodsTotalFen,33998);
    assert.notEqual(ui.inquiryContentKey(design,'2','',INITIAL_PRICING),ui.inquiryContentKey(design,'2','',pricing));
    design.label={...design.label,enabled:true,text:'合成特殊工艺'};
    assert.equal(JSON.parse(ui.buildInquiryJson(design,draft,new Date(),pricing)).request.goodsTotalFen,null);
    assert.match(ui.buildInquiryText(design,draft,new Date(),pricing),/方案商品金额：特殊工艺单独报价/);
  });
  await check('Customer admin UI stays denied and the actual write API rejects forged actor and role', async () => {
    await mount(ui.Admin,'/admin'); await until(() => text().includes('当前账号没有商家管理权限')); assert.equal($('#pricing-standard'),null);
    const response=await globalThis.fetch('/api/store/admin/pricing',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({standardFen:1,customFen:1,expectedVersion:store.getPricing().version,operationKey:randomUUID(),role:'admin',userId:admin.id})});
    assert.equal(response.status,403); assert.equal(store.getPricing().standardFen,10901);
  });
  await check('Focus refresh explicitly announces a price revision even when the relevant price is unchanged', async () => {
    await mount(ui.Home,'/tissue-box'); await until(() => $('.sh-price').textContent.includes('109.01'));
    update({customFen:17000}); await act(async()=>window.dispatchEvent(new window.Event('focus'))); await until(() => text().includes('商品价格已更新'));
    assert.match(text(),/170/); update({customFen:16999});
  });
  await check('Entering the design studio with an older displayed custom price shows the change', async () => {
    await mount(ui.PriceNote,'/customize?pricingVersion=1&unitPriceFen=15900'); await until(() => text().includes('选款时的定制价格已变化'));
    assert.match(text(),/169.99/);
  });
  await check('Price change rejects the first order, keeps coupon free, clears confirmation and requires an explicit new submit', async () => {
    store.adminGrantCoupon(admin.id,{userId:customer.id,amountFen:500,expiresAt:'2099-12-30T00:00:00Z',reason:'合成测试',operationKey:randomUUID()});
    await mount(ui.Checkout,'/checkout?style=ivory'); await until(() => $('#checkout-name')); await address(); assert.equal(button('保存订单草稿').disabled,false);
    update({standardFen:11101}); await submit(); await until(() => text().includes('商品价格已变化'));
    assert.equal(store.listOrders(customer.id).length,0); assert.equal(store.listCoupons(customer.id)[0].reservedFen,0);
    assert.match($('.store-summary-list').textContent,/111.01/); assert.equal(button('保存订单草稿').disabled,true);
    assert.equal([...document.querySelectorAll('input[type="checkbox"]')].at(-1).checked,false);
    assert.equal(calls.filter(c=>c.url==='/api/store/orders').length,1,'no silent retry');
    await click([...document.querySelectorAll('input[type="checkbox"]')].at(-1)); await submit(); await until(() => text().includes('订单草稿已保存'));
    const order=store.listOrders(customer.id)[0]; assert.equal(order.goodsTotalFen,11101); assert.equal(order.discountFen,500);
    const payload=calls.filter(c=>c.url==='/api/store/orders').at(-1).body; assert.equal(payload.expectedPricingVersion,store.getPricing().version); assert.equal(payload.expectedUnitPriceFen,11101);
  });
  await check('A price change between choosing a product and arriving at checkout is visible', async () => {
    const seen=store.getPricing(); update({standardFen:12101});
    await mount(ui.Checkout,`/checkout?style=ivory&pricingVersion=${seen.version}&unitPriceFen=${seen.standardFen}`); await until(() => $('#checkout-name'));
    assert.match(text(),/选款时的价格已变化/); assert.match($('.store-summary-list').textContent,/121.01/); assert.equal(button('保存订单草稿').disabled,true);
  });
  await check('Custom checkout totals follow current custom price and special work is quote-only', async () => {
    const design=initialDesign(); const saved=store.saveDesign(customer.id,{design,operationKey:randomUUID()});
    await mount(ui.Checkout,'/checkout?design='+saved.id); await until(() => $('#checkout-name')); await input('#checkout-quantity','2'); assert.match($('.store-summary-list').textContent,/339.98/);
    design.label={...design.label,enabled:true,text:'合成特殊工艺'}; const special=store.saveDesign(customer.id,{design,operationKey:randomUUID()});
    await mount(ui.Checkout,'/checkout?design='+special.id); await until(() => $('#checkout-name')); assert.match(text(),/商家单独报价/); await address(); await submit(); await until(() => text().includes('订单草稿已保存'));
    const order=store.listOrders(customer.id).find(row=>row.designId===special.id); assert.equal(order.kind,'bespoke'); assert.equal(order.goodsTotalFen,null); assert.equal(order.discountFen,0);
  });
  await check('Stale admin edit requires re-confirmation and preserves the newer price', async () => {
    await mount(ui.Admin,'/admin',true); await until(() => button('商品定价')); await click(button('商品定价')); await until(() => $('#pricing-standard'));
    await input('#pricing-standard','125.01'); await click($('form input[type="checkbox"]')); update({standardFen:12201}); await submit(); await until(() => text().includes('商品价格已被更新'));
    assert.equal(store.getPricing().standardFen,12201); assert.equal(button('保存商品价格').disabled,true); assert.match(text(),/当前基础款 ¥122.01/);
  });
  await check('Invalid decimal/exponent input cannot reach the write API', async () => {
    await input('#pricing-standard','1e2'); await click($('form input[type="checkbox"]')); const count=calls.filter(c=>c.method==='POST').length; await submit();
    assert.match(text(),/最多两位小数/); assert.equal(calls.filter(c=>c.method==='POST').length,count);
  });
  await check('Lost admin response retries the same operation and records one change', async () => {
    await input('#pricing-standard','123.01'); await click($('form input[type="checkbox"]'));
    const before=store.listPricingAudit(admin.id).length; let lost=false;
    intercept=async(call,execute)=>{const response=await execute(); if(call.method==='POST'&&call.url==='/api/store/admin/pricing'&&!lost){lost=true;await response.text();throw new Error('Synthetic lost response after commit');} return response;};
    await submit(); await until(() => text().includes('暂时连接不上服务')); assert.equal(store.getPricing().standardFen,12301); assert.equal(store.listPricingAudit(admin.id).length,before+1);
    await submit(); await until(() => text().includes('商品价格已保存')); assert.equal(store.listPricingAudit(admin.id).length,before+1);
    const posts=calls.filter(c=>c.method==='POST'&&c.url==='/api/store/admin/pricing'); assert.equal(posts.at(-1).body.operationKey,posts.at(-2).body.operationKey);
  });
  await check('Unavailable public service shows no fabricated price and checkout cannot submit', async () => {
    await mount(ui.Home,'/tissue-box'); intercept=async(call,execute)=>call.url==='/api/store/pricing'?Response.json({error:'SERVICE_UNAVAILABLE',message:'合成服务故障'},{status:503}):execute();
    await act(async()=>window.dispatchEvent(new window.Event('focus'))); await until(() => text().includes('合成服务故障')); assert.match($('.sh-price').textContent,/待确认/);
    await mount(ui.Checkout,'/checkout?style=ivory',false,async(call,execute)=>call.url==='/api/store/pricing'?Response.json({error:'SERVICE_UNAVAILABLE',message:'合成服务故障'},{status:503}):execute());
    await until(() => text().includes('合成服务故障')); assert.equal($('#checkout-name'),null); assert.equal(button('保存订单草稿'),undefined);
  });
  assert.equal(document.querySelectorAll('a[href^="/pay"]').length,0); assert.equal(store.policy.paymentEnabled,false);
  const report={result:'PASS',passed:passes.length,tests:passes,limits:['React DOM against real loopback HTTP/SQLite with synthetic accounts. No production configuration, live SMS/email, payment, or customer data.', 'DOM checks do not verify pixel layout or WebGL.']};
  writeFileSync(process.env.STORE_PRICING_UI_REPORT || path.join(tmpdir(),'dlcj-pricing-ui-results.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({result:report.result,passed:report.passed}));
} finally {
  if(root)await act(async()=>root.unmount()); globalThis.fetch=nativeFetch; dom.window.close();
  app.server.closeAllConnections(); await new Promise(resolve=>app.server.close(resolve)); store.close();
  if(path.dirname(path.resolve(tmp))!==path.resolve(tmpdir()) || !path.basename(tmp).startsWith('dlcj-pricing-ui-')) throw new Error('Unexpected cleanup path');
  rmSync(tmp,{recursive:true,force:true});
}
