import {chromium} from 'file:///C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const base=process.env.REVISION9_PREVIEW_URL??'http://127.0.0.1:5174';
const out=new URL('../checks/revision9/',import.meta.url);
const output=name=>fileURLToPath(new URL(name,out));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const report={};
try{
  const context=await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:1,acceptDownloads:true});
  const page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>{if(r.url().includes('/models/revision9/'))requests.push(r.url());});
  await page.goto(base+'/customize?preset=ivory&render-debug=1',{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('.product-canvas[data-model-revision="9"][aria-busy="false"]').waitFor({timeout:120000});
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.model-error').count(),0);
  await page.screenshot({path:output('website-ivory.png')});
  await page.getByRole('button',{name:'四角',exact:true}).click();
  const hole=page.getByRole('switch',{name:'皮料打孔',exact:true});
  if(await hole.getAttribute('aria-checked')==='true')await hole.click();
  await page.waitForTimeout(350);
  await page.locator('.product-canvas').screenshot({path:output('website-holes-off.png')});
  await hole.click();assert.equal(await hole.getAttribute('aria-checked'),'true');
  await page.waitForTimeout(500);
  await page.locator('.product-canvas').screenshot({path:output('website-holes-on.png')});
  for(const material of ['光面皮革','绒面质感','细纹皮革']){
    await page.getByRole('button',{name:material,exact:true}).click();await page.waitForTimeout(200);
  }
  const resource=async()=>{
    await page.getByRole('button',{name:'读取渲染资源',exact:true}).click();
    return JSON.parse(await page.getByLabel('渲染资源统计').textContent());
  };
  const before=await resource();
  for(let i=0;i<3;i++){await hole.click();await page.waitForTimeout(150);await hole.click();await page.waitForTimeout(150);}
  const after=await resource();
  assert.equal(before.geometryCount,after.geometryCount);assert.equal(before.textureCount,after.textureCount);
  assert.deepEqual(before.materialIds,after.materialIds);
  const canvas=page.locator('.product-canvas canvas'),box=await canvas.boundingBox();
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.45);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.66,box.y+box.height*.56,{steps:14});await page.mouse.up();
  await page.waitForTimeout(1500);
  await page.getByRole('button',{name:'导出我的方案',exact:true}).click();
  const pending=page.waitForEvent('download',{timeout:90000});
  await page.getByRole('button',{name:'多角度效果图',exact:false}).click();
  const download=await pending;await download.saveAs(output('website-export.png'));
  await page.getByAltText('当前方案多角度效果图').waitFor({state:'visible'});
  await page.keyboard.press('Escape');
  assert(requests.some(u=>u.endsWith('tissuebox-r9.glb')));
  assert.equal(new Set(requests.filter(u=>u.endsWith('.rgba32f.bin'))).size,4);
  assert.deepEqual(errors,[]);
  report.desktop={revision:9,loadedAssets:[...new Set(requests)],before,after,errors,holesToggled:true,materialsSwitched:true,rotationChecked:true,exportDownloaded:true};
  await context.close();

  const review=await browser.newContext({viewport:{width:1440,height:960}});
  const p=await review.newPage();
  await p.goto(base+'/model-review',{waitUntil:'domcontentloaded',timeout:60000});
  await p.locator('.product-canvas[data-model-revision="9"][aria-busy="false"]').waitFor({timeout:120000});
  await p.getByRole('button',{name:'窄端',exact:true}).click();await p.waitForTimeout(600);
  await p.locator('.product-canvas').screenshot({path:output('website-short-end.png')});
  await p.getByRole('button',{name:'包角与弧边',exact:true}).click();await p.waitForTimeout(500);
  await p.locator('.product-canvas').screenshot({path:output('website-corner.png')});
  assert.equal(await p.locator('img[src^="/model-review/revision9/"]').count(),2);
  await review.close();

  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
  const mp=await mobile.newPage();
  await mp.goto(base+'/customize?preset=ivory',{waitUntil:'domcontentloaded',timeout:60000});
  await mp.locator('.product-canvas[data-model-revision="9"][aria-busy="false"]').waitFor({timeout:120000});
  await mp.screenshot({path:output('website-mobile.png'),fullPage:true});
  assert.equal(await mp.locator('.model-error').count(),0);
  report.mobile={width:390,revision:9,loaded:true};await mobile.close();
  report.passed=true;await fs.writeFile(new URL('browser-audit.json',out),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}catch(error){
  await fs.writeFile(new URL('browser-failure.json',out),JSON.stringify({message:String(error),stack:error.stack},null,2));
  throw error;
}finally{await browser.close();}
