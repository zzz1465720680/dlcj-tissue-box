/** Read-only configuration validation. Does not open a database, bind a socket or contact providers. */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './http.mjs';
import { createProviders } from './providers.mjs';

export function checkProductionConfig(env = process.env) {
  const errors = []; const warnings = [];
  let config; let providers;
  try { config = loadConfig({ ...env, NODE_ENV: 'production' }); }
  catch (error) {
    const fields = [...new Set(String(error.message).match(/STORE_[A-Z_]+/g) || [])];
    errors.push({ code: 'SERVER_CONFIG_INVALID', fields, message: '检查 HTTPS 网站来源、私有数据库路径、密钥、监听地址与代理配置。' });
  }
  try { providers = createProviders(env); }
  catch (error) {
    const fields = [...new Set(String(error.message).match(/STORE_[A-Z_]+/g) || [])];
    errors.push({ code: 'PROVIDER_CONFIG_INVALID', fields, message: '检查已启用供应商所需的私有配置、收件地址与审核开关。' });
  }
  if (!providers?.sms.available) warnings.push('短信未启用，手机号登录不可用。');
  if (!providers?.email.available) warnings.push('邮件未启用，订单提醒将留在通知队列。');
  if (config?.trustedProxies.length) warnings.push('必须在实际入口验证代理替换客户端 IP 头；配置自检不能证明网络来源可信。');
  if (config?.ingress.mode === 'netlify-signed') warnings.push('Netlify 签名不包含请求正文或客户端 IP，不能替代会话、Origin、可信网络入口与真实限流验收。');
  return { valid: errors.length === 0, errors, warnings, checks: {
    productionConfiguration: Boolean(config), ingressMode: config?.ingress.mode ?? null,
    smsConfigured: Boolean(providers?.sms.available), emailConfigured: Boolean(providers?.email.available), paymentEnabled: false,
  }, scope: '仅验证配置格式；没有验证磁盘持久化、TLS/反向代理、供应商审核或真实送达。' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = checkProductionConfig();
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exitCode = result.valid ? 0 : 1;
}
