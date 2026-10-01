// Run from the repository root. Playwright is a QA tool, not an application dependency.
// PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE_PATH may point to an existing test runtime.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const base = 'http://127.0.0.1:5173';
const out = 'checks/brand-floor-mats';
await fs.mkdir(out, { recursive: true });
const server = spawn(process.execPath, ['scripts/run-framework.mjs', 'dev', '--hostname', '127.0.0.1'], {
  env: { ...process.env, VINEXT_NO_DEV_LOCK: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
server.stdout.on('data', data => { log += data.toString(); });
server.stderr.on('data', data => { log += data.toString(); });
const checks = [];
const errors = [];
const record = name => { checks.push(name); console.log('PASS ' + name); };
const trackErrors = page => page.on('pageerror', error => errors.push(error.message));
const count = page => page.locator('.fm-count strong').innerText();
async function goto(page, path) {
  const response = await page.goto(base + path, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200, path);
  await page.locator('img').evaluateAll(images => Promise.all(images.filter(image => image.loading !== 'lazy').map(image => image.decode())));
}
async function waitCount(page, expected) {
  await page.waitForFunction(value => document.querySelector('.fm-count strong')?.textContent === value, expected);
}
let browser;
try {
  const started = Date.now();
  while (true) {
    try { if ((await fetch(base, { signal: AbortSignal.timeout(3000) })).ok) break; } catch {}
    if (server.exitCode !== null || Date.now() - started > 45000) throw new Error(log.slice(-3000));
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE_PATH ? {
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    } : {}),
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  trackErrors(page);
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await goto(page, '/');
  assert.equal(await page.locator('.dc-productCard[href="/mats"]').count(), 1);
  assert.equal(await page.locator('.dc-productCard[href="/tissue-box"]').count(), 1);
  assert(!((await page.locator('main').innerText()).includes('从纸巾盒到脚垫')));
  await page.screenshot({ path: out + '/brand-home-desktop.png', fullPage: true });
  record('母品牌首页与两个产品入口');

  requests.length = 0;
  await goto(page, '/mats');
  assert.equal(await page.locator('.fm-carousel img').count(), 1);
  assert.equal(await count(page), '01');
  assert.equal(new Set(requests.filter(url => /\/floor-mats\/[^/?]+\.webp(?:[?#]|$)/.test(url))).size, 2);
  assert(!requests.some(url => /\/models\/|\/api\/designs/.test(url)));
  await page.screenshot({ path: out + '/floor-mats-desktop.png', fullPage: true });
  await waitCount(page, '02');
  record('六秒自动切换、无缩略图、只加载首图和下一图、不加载工坊或方案接口');

  await page.getByRole('button', { name: '下一款脚垫', exact: true }).click();
  await waitCount(page, '03');
  assert.equal(await page.getByRole('button', { name: '播放轮播', exact: true }).count(), 1);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(6300);
  assert.equal(await count(page), '03');
  record('手动选款后持续暂停');
  await page.getByRole('button', { name: '播放轮播', exact: true }).click();
  await waitCount(page, '04');
  record('主动播放可恢复轮播');
  await goto(page, '/mats');
  await page.getByRole('button', { name: '上一款脚垫', exact: true }).click();
  await waitCount(page, '09');
  await page.locator('.fm-photoStage').press('ArrowRight');
  await waitCount(page, '01');
  for (let i = 0; i < 9; i++) {
    await page.locator('.fm-photo').evaluate(image => image.decode());
    await page.getByRole('button', { name: '下一款脚垫', exact: true }).click();
  }
  await waitCount(page, '01');
  record('首尾循环、键盘切换、九张图片均可解码');

  await goto(page, '/tissue-box');
  const initialStyle = await page.locator('.sc-galleryName h3').innerText();
  await page.getByRole('button', { name: '下一款', exact: true }).click();
  const selectedStyle = await page.locator('.sc-galleryName h3').innerText();
  assert.notEqual(selectedStyle, initialStyle);
  await page.getByRole('button', { name: '咨询这款', exact: true }).click();
  assert((await page.locator('.sc-stockInquiryHeading').innerText()).includes(selectedStyle));
  assert((await page.locator('.sc-stockInquiryHeading').innerText()).includes('99'));
  await page.locator('.sc-lang a[href="/tissue-box?lang=en"]').click();
  await page.waitForURL('**/tissue-box?lang=en');
  assert.equal(await page.locator('.sc-lang a[aria-current]').innerText(), 'EN');
  record('迁移后纸巾盒选款、咨询价格和英文入口');

  await goto(page, '/customize?preview=light');
  await page.getByRole('button', { name: '侧标', exact: true }).click();
  const labelSwitch = page.getByRole('switch', { name: '启用侧标', exact: true });
  if ((await labelSwitch.getAttribute('aria-checked')) !== 'true') await labelSwitch.click();
  await page.locator('#labelText').fill('草稿回归');
  await page.getByRole('link', { name: '纸巾盒展示', exact: true }).click();
  await page.waitForURL('**/tissue-box');
  const draft = await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('dlcj-drafts', 1);
    request.onsuccess = () => {
      const db = request.result;
      const value = db.transaction('drafts').objectStore('drafts').get('current');
      value.onsuccess = () => { resolve(value.result); db.close(); };
      value.onerror = () => reject(value.error);
    };
    request.onerror = () => reject(request.error);
  }));
  assert.equal(draft.label.text, '草稿回归');
  assert.equal(draft.version, 1);
  await goto(page, '/customize?preview=light');
  await page.getByRole('button', { name: '侧标', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#labelText')?.value === '草稿回归');
  record('工坊返回 /tissue-box 前保存草稿，再次进入可恢复');
  await goto(page, '/customize');
  await page.locator('.product-canvas[data-model-revision="9"][aria-busy="false"]').waitFor({ timeout: 60000 });
  assert.equal(await page.locator('.model-error').count(), 0);
  record('原 revision9 3D 工坊可加载');

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const phone = await mobile.newPage();
  trackErrors(phone);
  await goto(phone, '/mats');
  await phone.screenshot({ path: out + '/floor-mats-mobile.png', fullPage: true });
  const stage = await phone.locator('.fm-photoStage').boundingBox();
  const session = await mobile.newCDPSession(phone);
  const y = stage.y + stage.height / 2;
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: stage.x + stage.width * .8, y }] });
  for (const fraction of [.65, .5, .35, .2]) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: stage.x + stage.width * fraction, y }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await waitCount(phone, '02');
  for (const arrow of await phone.locator('.fm-arrow').all()) {
    const box = await arrow.boundingBox(); assert(box.width >= 44 && box.height >= 44);
  }
  record('手机原生滑动与至少44像素箭头触摸区域');
  await goto(phone, '/');
  await phone.screenshot({ path: out + '/brand-home-mobile.png', fullPage: true });

  const calm = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const quietPage = await calm.newPage();
  trackErrors(quietPage);
  await goto(quietPage, '/mats');
  assert.equal(await quietPage.getByRole('button', { name: '播放轮播', exact: true }).count(), 1);
  await quietPage.waitForTimeout(6300);
  assert.equal(await count(quietPage), '01');
  record('减少动态效果时关闭自动播放');

  for (const width of [320, 390, 820, 1440]) {
    const responsive = await browser.newContext({ viewport: { width, height: 900 } });
    const view = await responsive.newPage();
    trackErrors(view);
    for (const path of ['/', '/mats', '/tissue-box', '/?lang=en', '/mats?lang=en', '/tissue-box?lang=en']) {
      await goto(view, path);
      assert(!(await view.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), `${width}px: ${path}`);
    }
    await responsive.close();
  }
  record('320/390/820/1440像素、中英文三个栏目无横向溢出');

  await fs.mkdir('checks/revision7', { recursive: true });
  const roundtrip = spawnSync(process.execPath, ['scripts/verify-design-roundtrip.mjs'], { encoding: 'utf8' });
  assert.equal(roundtrip.status, 0, roundtrip.stdout + roundtrip.stderr);
  record('既有方案 schema、用户隔离与本地 R2 保存读取');
  assert.deepEqual(errors, []);
  record('全部页面无 JavaScript 异常');
  await fs.writeFile(out + '/browser-report.json', JSON.stringify({ checks, errors, scope: 'local runtime only; production is not changed' }, null, 2));
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
  await fs.writeFile(out + '/server.log', log);
}
