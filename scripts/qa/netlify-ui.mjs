/** Focused React UI check against the Netlify adapter, synthetic merchant only. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {webcrypto} from 'node:crypto';
import {createNetlifyStore,hashMerchantPassword} from '../../server/netlify-store.mjs';

const repo=fileURLToPath(new URL('../..',import.meta.url)),requireRepo=createRequire(path.join(repo,'package.json'));
const requireQA=createRequire(path.join(process.env.STORE_UI_QA_DIR || repo,'package.json'));
const {JSDOM}=requireQA('jsdom'),{buildSync}=requireQA('esbuild');
const {PGlite}=await import(pathToFileURL(path.resolve(process.env.STORE_NETLIFY_QA_DIR || '.store-data/deployment-tools','node_modules/@electric-sql/pglite/dist/index.js')));
const folder=await mkdtemp(path.join(tmpdir(),'dlcj-netlify-ui-')),bundle=path.join(folder,'ui.cjs');
buildSync({stdin:{contents:"export {default as MerchantLogin} from './components/merchant-login';export {default as Admin} from './components/store-admin';export {default as Home} from './components/store-home';",resolveDir:repo,loader:'tsx'},bundle:true,platform:'node',format:'cjs',outfile:bundle,alias:{'@':repo,react:path.join(repo,'node_modules/react')},external:[path.join(repo,'node_modules/react'),path.join(repo,'node_modules/react/*')],jsx:'automatic'});
const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://store.example.test/',pretendToBeVisual:true});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,Node:dom.window.Node,DOMException:dom.window.DOMException,sessionStorage:dom.window.sessionStorage,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
const React=requireRepo('react'),{act}=React,{createRoot}=requireRepo('react-dom/client'),ui=requireRepo(bundle);
const pg=new PGlite();await pg.exec(await readFile(new URL('../../netlify/database/migrations/202610040001_merchant_pricing.sql',import.meta.url),'utf8'));
const db={query:(...args)=>pg.query(...args),connect:async()=>({query:(...args)=>pg.query(...args),release(){}})};
const origin='https://store.example.test',password='synthetic-merchant-password-only',env={STORE_PUBLIC_ORIGIN:origin,STORE_ADMIN_EMAIL:'merchant@example.test',STORE_ADMIN_PASSWORD_HASH:await hashMerchantPassword(password)};
const handler=createNetlifyStore({db,env});let cookie='',root,calls=[];
globalThis.fetch=async(url,init={})=>{calls.push(String(url));return handler(new Request(new URL(String(url),origin),{...init,headers:{...init.headers,...(cookie?{cookie}:{}),...(init.method==='POST'?{origin}:{})}}),{ip:'192.0.2.20'});};
const text=()=>document.body.textContent,$=selector=>document.querySelector(selector),flush=()=>act(async()=>{await new Promise(r=>setTimeout(r,30));});
async function until(condition){for(let i=0;i<120;i++){if(condition())return;await flush();}throw Error('UI state not reached: '+text().slice(-300));}
async function mount(Component){if(root)await act(async()=>root.unmount());calls=[];root=createRoot($('#root'));await act(async()=>root.render(React.createElement(Component)));await flush();}
async function input(selector,value){const el=$(selector);assert.ok(el);await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event('input',{bubbles:true}));});}
async function submit(){await act(async()=>{$('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));});await flush();}
try{
  await mount(ui.Admin);await until(()=>text().includes('请使用商家账号登录'));assert.ok($('a[href="/admin/login"]'));
  await mount(ui.MerchantLogin);await until(()=>$('#merchant-account'));await input('#merchant-account',env.STORE_ADMIN_EMAIL);await input('#merchant-password','incorrect-password');await submit();assert.equal($('button').disabled,true);await until(()=>text().includes('账号或密码不正确'));assert.equal($('button').disabled,false);
  const login=await handler(new Request(origin+'/api/store/auth/admin/login',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({email:env.STORE_ADMIN_EMAIL,password})}),{ip:'192.0.2.21'});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
  await mount(ui.Admin);await until(()=>$('#pricing-standard'));assert.equal($('#pricing-standard').value,'99');assert.ok(calls.every(url=>!/^\/api\/store\/admin\/(orders|designs|coupons)/.test(url)));
  await input('#pricing-standard','99.01');await input('#pricing-custom','159.01');await act(async()=>$('form input[type="checkbox"]').click());await submit();await until(()=>text().includes('商品价格已保存'));assert.equal((await pg.query('SELECT standard_fen FROM dlcj_pricing')).rows[0].standard_fen,9901);
  await mount(ui.Home);await until(()=>$('.sh-price')?.textContent.includes('99.01'));assert.match(text(),/159.01/);
  const restored=await globalThis.fetch('/api/store/admin/pricing',{method:'POST',body:JSON.stringify({standardFen:9900,customFen:15900,expectedVersion:2,operationKey:'synthetic-ui-restore-001'}),headers:{'Content-Type':'application/json'}});assert.equal(restored.status,200);
  await mount(ui.Admin);await until(()=>$('#pricing-standard'));assert.equal($('#pricing-standard').value,'99');assert.equal($('#pricing-custom').value,'159');
  console.log('Focused UI checks passed: guest routing, login pending/error, merchant-only pricing, saved prices shown on storefront, original prices restored.');
}finally{if(root)await act(async()=>root.unmount());dom.window.close();await pg.close();if(!path.resolve(folder).startsWith(path.join(path.resolve(tmpdir()),'dlcj-netlify-ui-')))throw Error('Unsafe cleanup');await rm(folder,{recursive:true,force:true});}
