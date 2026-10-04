/** Local operator form: never served by the website, never logs the password or hash. */
import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {hashMerchantPassword} from '../server/netlify-store.mjs';

if (process.env.NODE_ENV === 'production') throw new Error('This operator tool runs locally only.');
const email = String(process.argv[2] || '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254) throw new Error('Supply the authorized merchant email locally.');
const folder=resolve('.store-data'),filename=resolve(folder,'netlify-admin.env');
if (existsSync(filename)) throw new Error('Private administrator settings already exist; refusing to overwrite.');
const token=randomBytes(32).toString('base64url'),nonce=randomBytes(16).toString('base64url');
const escape=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let origin='',saving=false,saved=false;
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>设置网站商家密码</title><style>body{max-width:620px;margin:50px auto;padding:24px;font:17px/1.7 system-ui;background:#faf7f2;color:#382d28}label{display:block;margin-top:20px}input{box-sizing:border-box;width:100%;font:inherit;padding:12px;border:1px solid #aa9b8b;border-radius:8px}button{margin-top:24px;padding:12px 20px;font:inherit;background:#5b4635;color:white;border:0;border-radius:8px}#result{white-space:pre-wrap}</style><h1>设置网站商家密码</h1><p>此页面只在你的电脑上运行。请为鼎立车眷网站设置一个独立密码。</p><form><label>管理员邮箱<input type="email" value="${escape(email)}" readonly autocomplete="username"></label><label>网站商家密码<input name="password" type="password" minlength="16" maxlength="128" required autocomplete="new-password"></label><label>再次输入密码<input name="confirmation" type="password" minlength="16" maxlength="128" required autocomplete="new-password"></label><p>至少 16 个字符。请自行保存此密码。</p><button>保存商家登录设置</button></form><p id="result" role="status"></p><script nonce="${nonce}">document.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,result=document.querySelector('#result'),button=form.querySelector('button');if(form.password.value!==form.confirmation.value){result.textContent='两次密码不一致。';return;}button.disabled=true;result.textContent='正在保存…';try{const response=await fetch('/save',{method:'POST',headers:{'Content-Type':'application/json','X-Setup-Token':${JSON.stringify(token)}},body:JSON.stringify({password:form.password.value})});if(!response.ok)throw new Error('保存未完成，请检查密码长度或稍后重试。');form.reset();form.hidden=true;result.textContent='商家登录设置已保存在本机私有配置中。\\n密码不会显示在聊天、源码或部署包里。现在可以回到 Codex 继续发布。';}catch(error){result.textContent=error.message;button.disabled=false;}});</script></html>`;
const app=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'`);
  if(req.headers.host!==new URL(origin).host){res.writeHead(403);res.end();return;}
  if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
  if(req.method!=='POST'||req.url!=='/save'||req.headers.origin!==origin||req.headers['content-type']!=='application/json'){res.writeHead(403);res.end();return;}
  const supplied=String(req.headers['x-setup-token']||'');
  if(supplied.length!==token.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(token))||saving||saved){res.writeHead(403);res.end();return;}
  saving=true;
  try{
    const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>2048)throw new Error();chunks.push(chunk);}
    const {password}=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const passwordHash=await hashMerchantPassword(password);
    mkdirSync(folder,{recursive:true,mode:0o700});
    writeFileSync(filename,`STORE_ADMIN_EMAIL=${email}\nSTORE_ADMIN_PASSWORD_HASH=${passwordHash}\n`,{flag:'wx',mode:0o600});
    saved=true;res.setHeader('Content-Type','application/json');res.end('{"saved":true}');
    process.stdout.write('Private administrator configuration saved. No password or hash is printed.\n');
  }catch{res.writeHead(422);res.end();}finally{saving=false;}
});
app.listen(0,'127.0.0.1',()=>{origin=`http://127.0.0.1:${app.address().port}`;process.stdout.write(`Open locally: ${origin}\n`);});
