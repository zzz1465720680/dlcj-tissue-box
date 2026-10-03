/** Explicit, loopback-only pricing preview with a separate synthetic database. No live configuration. */
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createStore} from '../server/domain.mjs';
import {createStoreServer} from '../server/http.mjs';

if (process.env.NODE_ENV === 'production') throw new Error('Synthetic pricing preview cannot run in production.');
if (process.argv.length > 2) throw new Error('This isolated preview accepts no database or provider arguments.');
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const folder = join(repo, '.store-data', 'pricing-preview');
const filename = join(folder, 'store.sqlite'), markerPath = join(folder, 'synthetic-preview.json');
const marker = {kind: 'dlcj-pricing-preview-v1', synthetic: true};
if (existsSync(filename) && (!existsSync(markerPath) || JSON.stringify(JSON.parse(readFileSync(markerPath,'utf8'))) !== JSON.stringify(marker))) throw new Error('Existing database is not marked as this synthetic preview; refusing to open it.');
mkdirSync(folder, {recursive: true, mode: 0o700});
if (!existsSync(markerPath)) writeFileSync(markerPath,JSON.stringify(marker),{flag:'wx',mode:0o600});
const frontendPort = 5186, apiPort = 8796, origin = `http://127.0.0.1:${frontendPort}`;
const store = createStore({filename});
// Test-only identities are confined to the marked synthetic database.
const phones = new Set(['13800000001','13800000003']);
for (const phone of phones) store.registerVerifiedUser({phone});
if (store.findUserByPhone('13800000003').role !== 'admin') store.bootstrapAdmin({phone:'13800000003'});
const app = createStoreServer({store, origin, secret: randomBytes(32).toString('hex'), testMode: true, providers: {
  sms: {available: true, sendOtp: async ({phone,code}) => {
    if (!phones.has(phone.replace(/^\+86/,''))) throw new Error('Only synthetic preview identities are supported.');
    process.stdout.write(`\n[仅本地测试，不发送短信] ${phone} 验证码：${code}\n`);
  }}, email: {available: false},
}});
let frontend, stopping = false;
async function close() {
  if (stopping) return; stopping = true; frontend?.kill(); app.server.closeAllConnections();
  await new Promise(done => app.server.close(done)); store.close();
}
try {
  await new Promise((done, fail) => {app.server.once('error',fail);app.server.listen(apiPort,'127.0.0.1',done);});
  const env = {...process.env, NODE_ENV:'development'};
  for(const name of Object.keys(env)) if(name.startsWith('STORE_')) delete env[name];
  env.STORE_DEV_API_PORT = String(apiPort);
  env.STORE_LOCAL_PRICING_PREVIEW = '1';
  frontend = spawn(process.execPath,[join(repo,'node_modules','vite','bin','vite.js'),'--config',join(repo,'vite.netlify.config.ts'),'--host','127.0.0.1','--port',String(frontendPort),'--strictPort'],{cwd:repo,env,stdio:'inherit',windowsHide:true});
  frontend.on('error', error => {process.stderr.write(`Preview frontend failed: ${error.message}\n`);void close();process.exitCode=1;});
  frontend.on('exit', code => {void close();if(code)process.exitCode=code;});
  process.once('SIGINT',()=>void close()); process.once('SIGTERM',()=>void close());
  console.log(`\n隔离本地改价预览：${origin}/admin\n商品页：${origin}/tissue-box\n合成管理员：13800000003；合成顾客：13800000001。获取验证码后在此终端查看测试码。\n数据库：${filename}\n价格与审计在重启后保留；新库初始99/159。测试中改价只影响此隔离库。\n支付、真实短信和邮件关闭；生产服务没有接通。Ctrl+C停止。\n`);
} catch (error) {await close();throw error;}
