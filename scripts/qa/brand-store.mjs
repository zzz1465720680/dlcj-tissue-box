// Exercise the actual static entry and new collection routes without a server or network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requireQA = createRequire(path.join(process.env.STORE_UI_QA_DIR || repo, 'package.json'));
const {JSDOM} = requireQA('jsdom');
const {buildSync} = requireQA('esbuild');
const tests = [];
function check(name, fn) {fn(); tests.push(name);}
const options = {bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', loader: {'.css': 'empty'}, alias: {'@': repo}, logLevel: 'silent'};
function bundle(preview, referralOnly = false) {
  const input = referralOnly ? {stdin: {contents: "import {createRoot} from 'react-dom/client'; import Capture from './components/store-referral-capture'; createRoot(document.getElementById('root')).render(<Capture/>);", resolveDir: repo, loader: 'tsx'}} : {entryPoints: [repo + '/netlify-browser/main.tsx']};
  return buildSync({...options, ...input, define: {__STORE_FRONTEND_PREVIEW__: String(preview), 'process.env.NODE_ENV': '"production"'}}).outputFiles[0].text;
}
const previewCode = bundle(true), standardCode = bundle(false), captureCode = bundle(false, true);
async function open(route, code = previewCode) {
  const dom = new JSDOM('<!doctype html><html><head><meta name="description" content=""></head><body><div id="root"></div></body></html>', {url: 'https://example.test' + route, pretendToBeVisual: true, runScripts: 'outside-only'});
  const {window} = dom;
  const intervals = new Map(); let timer = 0;
  window.setInterval = (fn, delay) => {intervals.set(++timer, {fn, delay}); return timer;};
  window.clearInterval = id => intervals.delete(id);
  window.matchMedia = () => ({matches: false, addEventListener() {}, removeEventListener() {}});
  window.IntersectionObserver = class {observe() {} disconnect() {}};
  window.HTMLElement.prototype.setPointerCapture = () => {};
  const requests = [];
  window.fetch = async (url, init) => {requests.push({url, init}); return new Response('{}', {headers: {'Content-Type': 'application/json'}});};
  window.eval(code);
  const settle = () => new Promise(resolve => setTimeout(resolve, 35));
  for (let count = 0; count < 60 && !window.document.querySelector('#root').firstChild && !requests.length; count++) await settle();
  await settle();
  return {dom, window, document: window.document, intervals, requests, settle};
}
for (const [route, selector, lang] of [['/', '.dc-homeHero', 'zh-CN'], ['/?lang=en', '.dc-homeHero', 'en'], ['/mats/', '.fm-carousel', 'zh-CN'], ['/mats?lang=en', '.fm-carousel', 'en'], ['/tissue-box/', '.sh-home', 'zh-CN'], ['/tissue-box?lang=en', '.sh-home', 'en']]) {
  const page = await open(route); const {document} = page;
  try {
    check('Static entry renders ' + route, () => {assert.ok(document.querySelector(selector)); assert.equal(document.documentElement.lang, lang); assert.ok(document.title); assert.ok(document.querySelector('meta[name="description"]').content);});
    check('Preview banner and zero service calls on ' + route, () => {assert.ok(document.querySelector('aside[aria-label="测试预览说明"]')); assert.equal(page.requests.length, 0);});
    if (selector === '.dc-homeHero') check('Brand product links retain language on ' + route, () => {const suffix = lang === 'en' ? '?lang=en' : ''; for (const target of ['/mats', '/tissue-box']) assert.ok(document.querySelector(`.dc-productCard[href="${target + suffix}"]`));});
    if (selector === '.sh-home') check('Collection links retain checkout and language on ' + route, () => {assert.equal(document.querySelector('.sh-buy a').getAttribute('href'), '/checkout?style=white-lime'); assert.equal(document.querySelector('.sh-language').getAttribute('href'), lang === 'en' ? '/tissue-box' : '/tissue-box?lang=en'); assert.equal(document.querySelector('.sh-nav a[aria-current="page"]').pathname, '/tissue-box');});
  } finally {page.dom.window.close();}
}
const mats = await open('/mats');
try {
  const {document, window, intervals, settle} = mats;
  check('Floor mats stay display-only with one responsive photo', () => {assert.equal(document.querySelectorAll('.fm-carousel img').length, 1); assert.equal(document.querySelectorAll('form, input, canvas, a[href^="/checkout"], a[href^="/customize"]').length, 0); for (const img of document.querySelectorAll('img')) assert.ok(fs.existsSync(path.join(repo, 'public', img.getAttribute('src'))));});
  check('Six-second floor-mat autoplay', () => assert.equal([...intervals.values()][0].delay, 6000));
  intervals.values().next().value.fn(); await settle();
  check('Autoplay changes floor-mat photo', () => assert.equal(document.querySelector('.fm-count strong').textContent, '02'));
  document.querySelector('.fm-arrow--next').click(); await settle();
  check('Manual navigation pauses autoplay', () => {assert.equal(document.querySelector('.fm-count strong').textContent, '03'); assert.equal(intervals.size, 0);});
  document.querySelector('.fm-photoStage').dispatchEvent(new window.KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true})); await settle();
  check('Floor-mat keyboard navigation remains available', () => assert.equal(document.querySelector('.fm-count strong').textContent, '02'));
} finally {mats.dom.window.close();}
for (const route of ['/checkout?style=white-lime', '/my', '/?ref=SYNTHETIC_PREVIEW']) {
  const page = await open(route);
  try {check('Preview cannot call store services on ' + route, () => {assert.equal(page.requests.length, 0); assert.equal(page.document.querySelectorAll('input, form').length, 0); if (!route.startsWith('/?')) assert.match(page.document.body.textContent, /此功能等待服务接入/);});} finally {page.dom.window.close();}
}
for (const [label, code] of [['static brand entry', standardCode], ['framework layout capture', captureCode]]) {
  const page = await open('/?lang=en&ref=SYNTHETIC_MERGE#collections', code);
  try {check('Referral survives new homepage via ' + label, () => {assert.equal(page.requests.length, 1); assert.equal(page.requests[0].url, '/api/store/referral/capture'); assert.equal(JSON.parse(page.requests[0].init.body).inviteCode, 'SYNTHETIC_MERGE'); assert.equal(page.window.sessionStorage.getItem('dlcj-referral-code'), 'SYNTHETIC_MERGE'); assert.equal(page.window.location.search, '?lang=en'); assert.equal(page.window.location.hash, '#collections');});} finally {page.dom.window.close();}
}
console.log(JSON.stringify({passed: tests.length, tests, limits: ['DOM checks, not browser layout or WebGL verification. Network is mocked.']}, null, 2));
