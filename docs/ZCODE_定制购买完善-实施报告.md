# 纸巾盒网站：选款定制与购买咨询流程 实施报告

日期：2026-09-24 · 执行者：ZCode · 对应任务书：`docs/ZCODE_定制购买完善任务.md`

第一阶段采用「无需登录的选款 / 定制 → 完整方案摘要 → 复制或下载需求 → 联系客服确认购买」。
本轮不接入支付、不写订单、不显示任何未确认的经营事实；复制与下载只把文件留在用户本机。

## 1. 修改清单

新增文件：

| 文件 | 作用 |
| --- | --- |
| `lib/merchant-config.ts` | 商家经营信息与客服渠道的**唯一配置入口**。默认 `contact.channels` 为空 → 网站不显示任何联系按钮、不显示示例号码；`facts.confirmed` / `facts.pending` 列出已确认与待确认信息；`purchaseMode` 目前为 `'contact'`。 |
| `lib/purchase.ts` | 方案摘要与需求文本的纯函数实现：`summarizeDesign`（6 个部位 + 侧标 + 图案计数）、`buildInquiryText`、`buildInquiryJson`（保留图片/笔迹原图，`sent:false`）、`parseQuantity`（正整数，1–999）、`designSignature`（摘要与设计绑定）、`inquiryFileName`。 |
| `components/consult-panel.tsx` | 「确认方案 · 咨询这款」面板：摘要、数量与备注、可复制文本、下载需求文字/方案 JSON/多角度 PNG、联系商家的下一步；未配置客服时给出诚实说明，不渲染死按钮。 |
| `docs/qa/purchase-flow-check.mjs` | 直接打包 `lib/*.ts` 真实源码运行的模块级检查（esbuild 打包，无镜像实现）。 |
| `docs/qa/*.png` | 本轮实际浏览器截图证据。 |

修改文件：

| 文件 | 改动 |
| --- | --- |
| `app/page.tsx` | 首屏加入明确的定制价值与下一步（`选一款推荐配色` → `#colorways`、`定制与购买流程` → `#how-to-buy`）；新增 `#colorways` 三款推荐配色卡（`/customize?preset=<id>`）、`#product-info`（可定制范围 / 已确认 / 待商家确认 / 摆放养护）、`#how-to-buy` 四步流程、`#faq` 七问；导航改为 车载纸巾盒 / 推荐配色 / 产品细节 / 购买流程；页脚区分免责与语言范围。首页**不引入 three.js**（无 3D 资源引用）。 |
| `lib/showcase-copy.ts` | 上述新板块的中英文文案；`heroDescription` 改为具体定制范围 + 下一步；英文页明确「定制工坊与方案摘要目前仅中文」。 |
| `app/showcase.css` | 新板块样式（配色卡、信息卡、四步、FAQ）与 900px / 600px 响应式规则。 |
| `app/globals.css` | 咨询面板与「静态参考图」样式、移动端对话框滚动与按钮整行规则。 |
| `components/studio.tsx` | ① 两个登录链接静态 href 的 `/customizecustomize` → `/signin-with-chatgpt?return_to=%2Fcustomize`；② 客户导航移除「模型校对」（内部页 `app/model-review` 未删除）；③ 顶栏与面板底部新增主入口「确认方案 · 咨询（这款）」，打开咨询面板；④ 首页预设通过 `?preset=` 进入时：**已有草稿先弹窗询问「保留我的设计 / 应用（可撤销）」**，无草稿才直接应用；⑤ 工坊内点预设同样先确认，应用走 `commit()` 因此可撤销/重做；⑥ 开发者口吻文案改为客户说明（实物参考弹窗、底部尺寸改为「建模参考尺寸 16 × 10.5 × 约 6 cm」）；⑦ 3D 未载入时导出弹窗提示仍可下载 JSON 或在咨询面板复制需求。 |
| `components/product-view.tsx` | 3D 未就绪时显示**明确标注的静态参考图**（`静态参考图 · 3D 加载中 / 3D 未载入`）；加载阶段文案改为真实阶段（准备 3D 预览 → 载入约 18 MB 模型 → 应用你的材质与配色），**不显示百分比**；失败时保留「重新载入」并说明仍可继续选款与导出方案。 |

## 2. 验证命令与结果

```bash
npx tsc --noEmit                      # 通过（无输出）
node docs/qa/purchase-flow-check.mjs  # ALL CHECKS PASSED（39 项）
npm run build                         # 通过：vinext/Cloudflare 构建完成，Routes: / /api/designs /customize /model-review
```

模块级检查覆盖：数量 1 / 3 / 999 通过，0 / 2.5 / abc / 空 / 1000 拒绝；摘要含全部 6 个部位与 4 个包角；
需求文本含数量、备注、6 个部位名、打孔/封边/缝线、图案计数与图案文字；文本含「尚未发送」「不是商家订单号」，
且不含「下单成功 / 支付成功 / 订单已提交」等假成功字样，不含手机号样例；改设计后签名与文本同步变化；
JSON 中 `sent:false` 且保留图片 dataURL 与笔迹点。

实际网页检查（`npm run dev` → http://localhost:5173）：

| 检查 | 结果 |
| --- | --- |
| `curl /`（中文首页） | 200；含 推荐配色 / 选一款推荐配色 / `preset=porcelain-blue` / 待商家确认 / 为什么没有下单按钮 / `#how-to-buy` / FAQ；**不含** `model-review`、`customizecustomize`、three |
| `curl /?lang=en` | 200；含 Pick a colourway / How customizing works / To be confirmed by the maker / Why is there no checkout button / Preset example images / Chinese only |
| `curl /customize` | 200；含「确认方案 · 咨询这款」「建模参考尺寸」「静态参考图」；**不含**「模型校对」「customizecustomize」 |
| 浏览器打开 `/customize?preset=porcelain-blue`（本机存在旧草稿） | 弹出「要应用这个推荐配色吗？」，按钮为「保留我现在的设计 / 应用「白瓷 · 湖蓝」（可撤销）」——旧草稿未被静默替换（截图 `docs/qa/studio-desktop-20260924.png`） |
| 点击「应用」→ 点击顶栏「确认方案 · 咨询」 | 咨询面板打开：标题、说明、`本地方案编号 DLCJ-F129EA`、摘要高亮 5 行、主体/包角 01/包角 02… 逐部位列出材质、颜色、打孔、封边、缝线、图案计数（截图 `docs/qa/studio-consult-20260924.png`） |

未做/未测（如实说明）：未在移动端真机或 390px 视口下截图核对；咨询面板下半部分（数量、复制、下载、
联系商家）只在代码层与模块级检查中验证，未在浏览器里滚到底逐个点击；慢网络与模型加载失败路径只做了代码实现，
未用限速复现；英文页只核对了 SSR 文案，未逐屏视觉核对。以上均无「已实测」的声称。

## 3. 本地预览

```bash
npm run dev            # http://localhost:5173/ ，首页中文；/?lang=en 英文
npm run build && npm start   # 生产构建预览
```

## 4. 商家待补资料（填好后自动生效，无需改页面）

编辑 `lib/merchant-config.ts`：

1. `contact.channels`：填入真实微信 / 电话 / 链接 / 邮箱（`{id,kind,label,value,hint}`）。填了才会出现按钮，
   例如 `{id:'wechat',kind:'wechat',label:'微信咨询',value:'<真实微信号>',hint:'添加时请备注：纸巾盒定制'}`。
2. `contact.pendingNote`：未配置客服时的对外说明，可按实际渠道改写。
3. `facts.confirmed` / `facts.pending`：确认成品实测尺寸、抽纸适配、价格与加价规则、起订量、交期、运费、
   配送范围、付款方式、售后规则后，把条目从 `pending` 移到 `confirmed`，并同步首页 `lib/showcase-copy.ts` 的
   `info.confirmed` / `info.pending` 与 FAQ。
4. 首页「待商家确认」文案、FAQ 与四步流程中的价格 / 交期 / 售后表述，都依赖商家提供真实信息后改写；
   在此之前网站不会显示价格、不会显示下单按钮，也不支持在线支付。
5. 若第二阶段改为网站在线收款：需先接入并验证真实支付与订单服务（`db/schema.ts` 目前没有订单表），
   并把 `purchaseMode` 从 `'contact'` 改掉后再开放入口。

## 5. 未完成 / 后续建议

- 咨询面板未做「数量阶梯价 / 多方案对比」；如需可在此基础上扩展。
- 首页配色卡使用的是 `public/presets/*.webp`（360×270 预设渲染缩略图），已明确标注为预设示例图；
  若后续产出更高分辨率素材，替换同名文件即可。
- 事件漏斗（进入定制 / 选预设 / 完成方案 / 点击联系）本轮未接入统计服务，未写埋点，避免冒充已有数据。
- 英文定制工坊未实现，英文页已明确告知定制与方案摘要目前仅中文。
