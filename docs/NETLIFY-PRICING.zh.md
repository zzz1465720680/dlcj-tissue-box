# Netlify 上线配置

此分支保留原商城、品牌首页、纸巾盒、脚垫和工坊页面，并增加 Netlify Functions + Netlify Database 的持久化改价适配。原 Node 24/SQLite 服务及其数据库不被转换、清空或覆盖。

本阶段启用公开价格读取和单一商家账号改价。顾客手机号登录、云端方案、订单、优惠券及云端作品集没有接通，相关入口明确提示暂未开通；工坊使用现有浏览器本机存储。支付与短信、邮件保持关闭。

## 配置与发布

- 现有项目 ID：`129b2122-fc00-4bd0-aff0-28d89c76e4ea`；网址保留 `https://dingli-tissue-box.netlify.app`。
- Netlify 根据 `@netlify/database` 和 `netlify/database/migrations` 配置持久 Postgres 与迁移。函数使用平台提供的 `NETLIFY_DB_URL`，不将数据库文件放在函数临时目录。
- 生产私有变量：`STORE_PUBLIC_ORIGIN` 为上述 HTTPS 网址；`STORE_ADMIN_EMAIL` 绑定经商家授权的单一邮箱，`STORE_ADMIN_USERNAME` 可指定独立登录名（省略时使用邮箱）；`STORE_ADMIN_PASSWORD_HASH` 为本机设置工具生成的密码验证摘要。变量均不使用 `VITE_` 前缀。
- 本机执行 `node scripts/netlify-admin-setup.mjs 已授权邮箱`，由运营者在本机页面设置独立网站密码。工具只写入被忽略的 `.store-data/netlify-admin.env`，不打印密码或摘要。不要把这个文件放入发布目录、源码仓库或聊天。
- 前端构建使用 `STORE_NETLIFY_PRICING=1`；Netlify 配置已包含此值。仅发布 `dist-netlify` 与打包的 `netlify/functions`。手动上传静态文件不能交付这里的后台。

管理员入口为 `/admin/login`，改价界面为 `/admin`。密码轮换会使原登录会话失效；登录尝试限流记录与会话保存在持久数据库中。价格使用整数分、版本校验、幂等操作号和同一事务内的修改记录。

发布后确认 `deployment-version.json` 的准确提交号和干净构建状态，再通过受控改价、匿名价格读取、新函数实例读库及恢复原价验收。后台 `/api/store/health` 的 `runtimeInstanceId` 可区分函数运行实例；价格不保存在实例内存中。

隔离检查：`node --test scripts/qa/netlify-pricing.test.mjs`（可选 PGlite 依赖目录由 `STORE_NETLIFY_QA_DIR` 指定）；界面检查为 `node scripts/qa/netlify-ui.mjs`，沿用现有 QA 的 `STORE_UI_QA_DIR`。检查只使用合成身份及新建的隔离数据库。
