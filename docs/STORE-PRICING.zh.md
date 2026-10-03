# 后台商品定价：本地交付记录

开始日期：2026-10-03；本地验收日期：2026-10-04。所有实现、检查及验收由主助手直接完成。2026-10-04 用户追加授权提交并同步改价功能分支到 GitHub，无需再次申请。没有合并主分支、部署、发送真实通知或操作真实客户数据。

## 代码基线与本地工作保留

- 远端：`https://github.com/zzz1465720680/dlcj-tissue-box.git`。
- 商城基线分支：`origin/codex/integrate-brand-store-20261001`。
- 完整基线 SHA：`0c6708c5959d94944683b9c750f68470f87f72e3`。已成功 fetch；交付前再次直接读取远端该分支，仍为此 SHA。
- 本次目录：`G:\DLCJ\03_网站与产品\纸巾盒网站_改价开发_20261003`。
- 本次分支：`codex/store-pricing-20261003`。后续同步使用同名独立 GitHub 功能分支，版本以该分支的 Git 提交记录为准；不改动 `main` 或商城集成分支。
- 原目录：`G:\DLCJ\03_网站与产品\纸巾盒网站_最新分支_20261001`，原分支 `codex/store-preflight-20261002`，HEAD `3b576ea021d4e7c596655f7f0ba08ffa6fe4a085`；其 5 个未推送提交完整保留，没有并入本次远端基线分支。
- 旧 Render 目录属于另一仓库，其未提交修改未动。没有 reset、clean、stash 或覆盖原工作区。
- 已读取 `docs/BRAND-STORE-INTEGRATION.md` 与 `docs/STORE-LAUNCH.zh.md`；目标仓库及其上级目录未找到 `AGENTS.md`。

## 实现结果

后台 `/admin` 增加“商品定价”页签，可以修改纸巾盒基础款与配色定制款。新数据库初始值仍为 **99 元与 159 元**；没有调整真实售价。输入限制为每件 0.01–10000 元、最多两位小数，服务端再次验证整数分及边界。

新增 SQLite 迁移 `003_pricing.sql`，用 `store_pricing` 保存两种商品单价、价格版本、更新时间和操作人。初始化只在配置不存在时执行，不覆盖已保存价格。管理员保存通过现有会话权限、Origin 验证、乐观版本与幂等操作号，价格和 `store_audit` 中的修改前后值、操作人、时间一起提交；审计失败会回滚改价。

公开接口 `GET /api/store/pricing` 返回当前价格，带 `no-store`，不返回管理员身份或修改记录。管理员读取/保存使用 `GET` / `POST /api/store/admin/pricing`。普通账号和伪造 `role`、`userId` 的请求都被服务端拒绝。

商品展示、购买说明、工坊价格提示、询价文字/JSON 中的方案金额、结算预览和服务端下单读取同一份服务端配置。静态 SEO 文案与部署元数据移除固定售价，避免后台改价后留下矛盾信息。浏览器不保存共享价格配置；原有设计草稿及幂等操作号的本机存储用途继续保留。

基础/配色定制订单必须携带用户核对的 `expectedPricingVersion` 和 `expectedUnitPriceFen`。服务器在建单事务内检查，过期返回 `409 PRICE_CHANGED`，缺失返回 `409 PRICE_CONFIRMATION_REQUIRED`；不创建订单、不预留券。商品页到结算页会携带看过的价格，价格变化会明确提示；提交失败后更新金额、取消原勾选，用户重新核对和勾选后才能再次提交。已经成功的订单重试仍返回原订单，不因后来改价而重复建单。

旧订单不被改价迁移或更新覆盖。固定价订单的单价、商品金额和价格版本另有数据库不可变保护。原有旧订单的新增价格版本字段为 `null`，原金额和设计快照不变。

优惠券仍按商品金额、可用余额和每单 30 元上限取最小值，不抵运费；低价商品抵扣后不会出现负数。邀请奖励规则保留。特殊图案、布标内容及刺绣等仍单独报价，不套配色定制总价；脚垫仅展示，支付保持关闭。

普通服务不可达时显示价格待确认/错误和重试入口，结算无法提交。原有“前端测试预览”模式继续阻止账号及订单请求，只明确展示初始参考价。

## 隔离验证结果

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| 后端与 HTTP | 93/93 通过 | 原有 79 项加 14 项定价测试；使用内存或新建临时 SQLite、合成账号和通知适配器 |
| 原有界面回归 | 146/146 通过 | 商品页 26、工坊 34、账号/订单/后台 60、品牌/静态路由 26；网络为合成响应 |
| 新增定价界面与 API 联测 | 13/13 通过 | 实际 React DOM 连接真实回环 HTTP 服务和 SQLite，使用合成账号；价格数据和下单结果由服务端计算 |
| 历史设计文件往返 | 通过 | 可编辑内容、用户隔离及私有默认行为保留 |
| TypeScript | 通过 | `npm run typecheck` |
| Netlify 正式与前端测试构建 | 均通过 | 未发布；正式元数据只声明服务端价格来源，测试构建明确标记参考价格 |
| Vinext 构建 | 通过 | 未发布；有原有路由静态分类提示 |
| 全量源码 lint | 15 个错误、25 个警告 | 与远端原源码比较：35 个变更源码文件中的 9 个错误前后完全相同，其余错误在未改文件，无新增错误；另外检查 10 个新增/近期修改的关键文件，0 错误、0 警告 |
| 本机开发预览 | 通过 HTTP 验证 | 后台页面 200、价格接口初始 99/159、浏览器入口与依赖脚本均为 200 / JavaScript，私有数据库与标记文件访问为 403 |
| 测试启动器生产保护 | 通过 | `NODE_ENV=production` 时拒绝启动，退出码 1 |

新增验证覆盖管理员改价、普通用户拒绝、金额非法/精度与边界、并发旧版本、审计失败回滚、幂等重试、刷新重新读取、数据库/HTTP 服务重启持久化、一致性备份、前后端金额一致、原订单不变、优惠券限额及失败不占券、特殊工艺报价、价格变化提示与重新勾选、服务不可用时不伪造价格。

Windows 上原有基线 79 项中 3 项失败，原因分别是 SQLite 关闭前删除临时目录、以 POSIX 权限位断言 Windows ACL、无特权创建符号链接。本次修正测试清理顺序、保留 Linux 权限断言，并用 Windows junction 验证私有路径拒绝且只删除链接本身。没有跳过原有业务或权限断言；Windows 悬空符号链接及 Linux 文件权限仍需相应平台验收。

本机开发预览忽略构建输出和私有数据文件的监视，避免 Windows 构建同时发生时触发 EBUSY；私有 `.store-data` 禁止由前端开发服务器读取，依赖缓存放在独立且被 Git 忽略的 `checks/pricing-vite-cache`。

## 本地预览方法

在本次开发目录中双击 `start-pricing-preview.cmd`，保留打开的终端窗口。也可以在 PowerShell 执行：

```powershell
Set-Location -LiteralPath 'G:\DLCJ\03_网站与产品\纸巾盒网站_改价开发_20261003'
node scripts/local-pricing-preview.mjs
```

然后打开：

- 后台：`http://127.0.0.1:5186/admin`
- 商品页：`http://127.0.0.1:5186/tissue-box`
- 价格读取：`http://127.0.0.1:5186/api/store/pricing`

合成管理员手机号 **13800000003**；合成顾客 **13800000001**。点击获取验证码后，在启动终端查看测试码，再填回登录页面。不会发送真实短信。管理员登录后进入“商品定价”，修改数值、勾选确认再保存；刷新商品页即可核对价格。

预览固定监听回环前端 5186、API 8796，使用专用 `.store-data/pricing-preview/store.sqlite` 和合成标记文件，不使用环境中的生产数据库/通知配置，不访问原有 8788 服务。页面显示本地合成测试标识，只接受上述两个测试登录号码，支付和真实短信/邮件关闭。请只使用合成资料。

在终端按 Ctrl+C 停止；重新运行同一脚本后价格及审计保留，测试会话可能需要重新登录。本次验收预览进程已结束，目前可按以上方法自行启动；专用测试库当前仍为初始 **99/159**。

本机要求 Node 24。当前 `node_modules` 复用原工作区相同锁文件的既有安装链接；包清单和锁文件未改变。可选 QA 依赖单独放在本工作区 `.store-data/qa-deps`，未加入生产依赖。

复验命令：

```powershell
npm.cmd run test:store
$env:STORE_UI_QA_DIR = Join-Path (Get-Location) '.store-data\qa-deps'
npm.cmd run test:ui
node scripts/qa/pricing.mjs
npm.cmd run test:design-roundtrip
npm.cmd run typecheck
npm.cmd run build:netlify
npm.cmd run build:netlify -- --mode frontend-preview
npm.cmd run build
```

## 未完成事项和边界

- 生产配置检查未通过：`STORE_PUBLIC_ORIGIN`、`STORE_AUTH_SECRET`、`STORE_DB_PATH` 尚未配置；真实短信、邮件和生产管理员身份没有接入。上述测试服务不能作为生产已经接通的证明。
- 本轮浏览器控制工具在初次打开后台后超时，恢复检查显示无可用浏览器。没有完成真实浏览器刷新/截图、手机布局或 WebGL 外观验收。React DOM/API 联测和 HTTP 检查不等于像素或手机实测。
- 保留远端基线已有 15 项 lint 错误，主要涉及原工坊生命周期/引用及既有组件；本次没有扩大为工坊重构。
- 构建仍有既有大资源块提示；没有在本轮改动 3D、模型素材或拆包策略。
- 本地交付后，用户于 2026-10-04 授权 Git 提交与功能分支推送，提交说明包含 `[skip netlify]`。主分支与商城集成分支不合并、不推送；没有上线。需要生产配置、浏览器/手机验收及独立发布流程后再考虑上线。

## 修改文件清单

### 数据库、业务规则与 API

- `server/migrations/003_pricing.sql`：新增持久定价及旧固定价订单保护。
- `server/domain.mjs`：定价读取/管理员修改/审计，事务内价格核对和订单金额快照。
- `server/http.mjs`：公开及后台价格路由，白名单传递价格确认，返回变化提示。
- `lib/pricing.ts`：唯一初始默认价、配置类型、金额解析及价格文案/确认工具。
- `lib/store-client.ts`：价格读取及错误中的当前价格解析。

### 后台和商品/设计/订单展示

- `components/store-pricing-admin.tsx`
- `components/store-pricing-note.tsx`
- `hooks/use-store-pricing.ts`
- `components/store-admin.tsx`
- `components/store-checkout.tsx`
- `components/store-home.tsx`
- `components/stock-gallery.tsx`
- `components/customization-price-note.tsx`
- `components/consult-panel.tsx`
- `components/studio.tsx`
- `lib/purchase.ts`
- `lib/merchant-config.ts`
- `lib/showcase-copy.ts`
- `app/store.css`

### 本地运行及静态构建

- `scripts/local-pricing-preview.mjs`
- `start-pricing-preview.cmd`
- `lib/frontend-preview.ts`
- `netlify-browser/main.tsx`
- `vite.netlify.config.ts`

### 验证与交付

- `server/pricing.test.mjs`
- `scripts/qa/pricing.mjs`
- `server/domain.test.mjs`
- `server/http.test.mjs`
- `server/security-review.test.mjs`
- `server/client.test.mjs`
- `server/aliyun-providers.test.mjs`
- `server/auth.test.mjs`
- `server/backup.test.mjs`
- `server/ingress.test.mjs`
- `scripts/qa/homepage.mjs`
- `scripts/qa/studio.mjs`
- `scripts/qa/store-ui.mjs`
- `scripts/qa/brand-store.mjs`
- `docs/STORE-PRICING.zh.md`

本地详细测试日志、报告及数据库保留在被 Git 忽略的 `.store-data`；不得加入源代码仓库或生产静态站点。
