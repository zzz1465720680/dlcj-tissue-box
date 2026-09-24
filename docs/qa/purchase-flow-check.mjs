// 验证方案摘要 / 需求文本的真实逻辑（直接打包 lib 下的真实源码，不做镜像实现）。
// 运行：node docs/qa/purchase-flow-check.mjs
import {build} from 'esbuild';

async function load(entry) {
  const result = await build({entryPoints: [entry], bundle: true, format: 'esm', write: false, platform: 'node', logLevel: 'silent'});
  const code = result.outputFiles[0].text;
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}

const purchase = await load('lib/purchase.ts');
const design = await load('lib/design.ts');

const failures = [];
const check = (name, condition, extra = '') => {
  if (condition) console.log('PASS  ' + name);
  else { failures.push(name + (extra ? ' → ' + extra : '')); console.log('FAIL  ' + name + (extra ? ' → ' + extra : '')); }
};

// 1. 数量校验：有效正整数 + 上限
check('数量 1 通过', purchase.parseQuantity('1').ok === true);
check('数量 3 通过且为数字 3', purchase.parseQuantity('3').value === 3);
check('数量 0 拒绝', purchase.parseQuantity('0').ok === false);
check('数量 2.5 拒绝', purchase.parseQuantity('2.5').ok === false);
check('数量 abc 拒绝', purchase.parseQuantity('abc').ok === false);
check('空数量拒绝', purchase.parseQuantity('').ok === false);
check('数量 999 通过（上限内）', purchase.parseQuantity('999').ok === true);
check('数量 1000 拒绝（超上限）', purchase.parseQuantity('1000').ok === false);
check('备注上限为 300', purchase.NOTE_MAX === 300);

// 2. 摘要覆盖全部 6 个部位 + 侧标
const base = design.initialDesign();
const summary = purchase.summarizeDesign(base);
check('摘要列出 6 个部位', summary.parts.length === 6, String(summary.parts.length));
for (const part of design.PARTS) check('摘要包含部位 ' + part, summary.parts.some(row => row.part === part));
check('四个包角全部列出', summary.parts.filter(row => row.part.startsWith('corner')).length === 4);
check('侧标默认未启用', summary.label.enabled === false);

// 3. 需求文本内容与“未发送”声明
const text = purchase.buildInquiryText(base, {quantity: 2, note: '希望图案小一些'}, new Date('2026-09-24T10:30:00'));
check('文本包含数量', text.includes('数量：2 件'));
check('文本包含备注', text.includes('希望图案小一些'));
check('文本包含 6 个部位名', design.PARTS.every(part => text.includes(design.PART_NAMES[part])));
check('文本含打孔/封边/缝线', text.includes('打孔') && text.includes('封边油') && text.includes('缝线'));
check('文本声明尚未发送', text.includes('尚未发送'));
check('文本声明编号不是订单号', text.includes('不是商家订单号'));
check('文本提示需商家确认', text.includes('请商家确认'));
check('文本不出现“已下单/已支付/商家已收到”', !/已成功下单|支付成功|订单已提交|已提交订单|商家已收到你的|下单成功/.test(text));
check('文本不出现手机号样例', !/1[3-9]\d{9}/.test(text));

// 4. 摘要与设计绑定：改设计后签名与文本同步变化
const edited = design.cloneDesign(base);
edited.parts.body.color = '#25292b';
edited.label.enabled = true;
edited.label.text = 'DLCJ';
const editedText = purchase.buildInquiryText(edited, {quantity: 1, note: ''}, new Date('2026-09-24T10:30:00'));
check('改色后签名变化', purchase.designSignature(edited) !== purchase.designSignature(base));
check('改色后文本更新为主体新颜色', editedText.includes('#25292B'));
check('侧标启用后写入文本', editedText.includes('窄边布标：启用') && editedText.includes('DLCJ'));

// 5. 图案计数与“原图在 JSON 中”的说明
const withArt = design.cloneDesign(base);
withArt.parts.body.art = [
  {id: 'a1', kind: 'image', x: 0.5, y: 0.2, scale: 0.6, rotation: 0, color: '#263d33', src: 'data:image/png;base64,iVBORw0KGgo='},
  {id: 'a2', kind: 'text', x: 0.5, y: 0.3, scale: 0.5, rotation: 0, color: '#263d33', text: '小满'},
  {id: 'a3', kind: 'stroke', x: 0, y: 0, scale: 1, rotation: 0, color: '#263d33', points: [[0.1, 0.1], [0.2, 0.2]], width: 0.01},
];
const artText = purchase.buildInquiryText(withArt, {quantity: 1, note: ''}, new Date('2026-09-24T10:30:00'));
check('图案计数正确', artText.includes('图片 1 · 文字 1 · 笔迹 1'));
check('图案文字内容写入摘要', artText.includes('文字内容：小满'));
check('摘要说明原图在 JSON 而非文本中', artText.includes('本摘要不包含完整图案内容'));
const json = JSON.parse(purchase.buildInquiryJson(withArt, {quantity: 2, note: 'x'}, new Date('2026-09-24T10:30:00')));
check('JSON 标记 sent=false', json.sent === false);
check('JSON 保留图片原图数据', json.design.parts.body.art[0].src.startsWith('data:image/png'));
check('JSON 保留笔迹点', json.design.parts.body.art[2].points.length === 2);
check('JSON 含数量与备注', json.request.quantity === 2 && json.request.note === 'x');

// 6. 预设方案也能生成完整摘要
const presetText = purchase.buildInquiryText(design.preset(2), {quantity: 1, note: ''}, new Date('2026-09-24T10:30:00'));
check('预设 3 摘要包含亚麻/森林配色值', presetText.includes('森林 · 亚麻') || presetText.includes('#365D52'));
check('文件名可安全用于下载', /^[^\\/:*?"<>|]+\.json$/.test(purchase.inquiryFileName(base, new Date('2026-09-24T10:30:00'), 'json')));

// 7. Invalid quantities must not become purchasable JSON through a fallback.
for (const quantity of [0, 2.5, 1000, Number.NaN]) {
  for (const format of ['buildInquiryText', 'buildInquiryJson']) {
    let rejected = false;
    try { purchase[format](base, {quantity, note: ''}, new Date()); } catch { rejected = true; }
    check(`${format} rejects invalid quantity ${quantity}`, rejected);
  }
}
const copiedKey = purchase.inquiryContentKey(base, '3', '保留原配色');
check('数量变更使旧副本过期', copiedKey !== purchase.inquiryContentKey(base, '4', '保留原配色'));
check('备注变更使旧副本过期', copiedKey !== purchase.inquiryContentKey(base, '3', '更换缝线'));
check('设计变更使旧副本过期', copiedKey !== purchase.inquiryContentKey(edited, '3', '保留原配色'));

// 8. The actual shared clipboard helper must not report success without an API.
const clipboard = await load('lib/clipboard.ts');
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
try {
  Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {}});
  check('无剪贴板接口时不假报成功', await clipboard.copyText('验收') === false);
  Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {clipboard: {writeText: async () => { throw new Error('denied'); }}}});
  check('剪贴板权限拒绝时不假报成功', await clipboard.copyText('验收') === false);
  let copied = '';
  Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {clipboard: {writeText: async value => {copied = value;}}}});
  check('复制成功必须真实写入文本', await clipboard.copyText('验收') === true && copied === '验收');
} finally {
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else delete globalThis.navigator;
}

console.log('\n' + (failures.length ? 'FAILED: ' + failures.length : 'ALL CHECKS PASSED'));
process.exit(failures.length ? 1 : 0);
