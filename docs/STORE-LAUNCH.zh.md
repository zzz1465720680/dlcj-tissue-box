# 纸巾盒商城上线准备与选择清单

核实日期：2026-10-01。状态：云端未发布开发稿；已获准将源码同步到GitHub功能分支；没有开通服务、发送真实短信/邮件、创建密钥、授予管理员或部署。支付仍暂停。

## 结论

现有版本可继续本地验收，不能称为生产已就绪。账号、订单、方案和材料照片均依赖持久化 API；现有关闭的网关适配器与可选阿里短信/DirectMail直连接口；直连仅通过本地模拟测试，尚未接入真实账号。详见 [通知适配器说明](STORE-PROVIDERS.md)。前端已有 Netlify 静态构建，后端必须使用单实例 Node 24、持久磁盘和独立备份，不能放进无持久磁盘的函数或免费容器。

已确认商家有个体工商户营业执照、尚无自有域名。腾讯的企业实名认证明确包含个体工商户；后续按该主体办理账号认证、短信资质/签名/模板审核，已有营业执照不等于短信已审核通过。测试可继续使用现有 Netlify 子域名，无需先买域名；正式商城和自己的通知发信地址建议使用自有域名。证件、密钥和密码只在服务商或安全配置入口处理，QQ 收件地址不能代替发信域名。[腾讯实名认证适用主体](https://cloud.tencent.com/document/product/378/3629)

## 域名与首年/续年预算

2026-10-01 06:53 UTC 在云浏览器实时核对腾讯云：普通 `.com` 首年 **83 元**、续费 **90 元/年**；`.cn` 首年 **33 元**、续费 **38 元/年**。价格不含白金词/保留词等特殊域名，最终以结算为准，不使用“首年0元、2年起注”等资格尚未核实的活动估算。[官方价格表](https://buy.cloud.tencent.com/domain/price?type=overview)

全拼候选 `dinglichejuan.com` 和 `dinglichejuan.cn` 当时均显示上述首年价和“立即加购”，可申请但未保留、未加购或注册，最终成功与否以注册结果为准。建议先选一个符合品牌的主域名即可；可在[官方查询页](https://buy.cloud.tencent.com/domain)输入 `dinglichejuan` 复查。注册成功后不支持修改/退款，账号及域名持有者实名信息应归商家主体。[购买须知](https://cloud.tencent.cn/document/product/242/18873)

按下述52元/月主机、官方12个月85折（新购/续费均适用）测算：主机 **530.40元/年**；配 `.com` 首年 **613.40元**、按当前续费价下一年 **620.40元**；配 `.cn` 首年 **563.40元**、下一年 **568.40元**。这是**主机+一个域名**，没有包含异机备份、流量超额、短信/邮件用量及可能的结算调整。若第一次另购腾讯1,000条短信包，加50元，`.com` 组合约 **663.40元**；短信包不是每年自动必须重复购买。[主机时长折扣](https://cloud.tencent.com/document/product/1207/73452)

**更低成本候选（补充）**：阿里云官方现列经济型ECS 2核2GB、3Mbps固定带宽、40GB持久云盘为99元/年，页面称新老同享、续费同价锁至2029年3月31日。该规格可保留现有Node+SQLite架构；账号购买资格、活动次数、地区库存和备份赠送期限尚未完成核对，不能据此承诺实际结算或2029年之后的续费价。只算主机加普通域名，`.cn` 首年132元、`.com` 首年182元；短信、备份等仍另计。此前663.40元方案不再作为当前推荐。[官方活动页](https://cn.aliyun.com/activity/ecs/99program?from_alibabacloud=)

以上仅供预算比较，不构成购买授权；先确认主体/备案/账号可用和完整结算费用，再购买。可以先不支出，继续完成本地及获准的预发布验收。

## 可行的最小架构

### A. 国内长期运营优先

- 单台中国内地 Linux 主机，Node 24 API 单进程，SQLite/WAL 与私有照片 BLOB 放独立私有目录，例如 `/var/lib/dlcj/store.sqlite`；静态目录与数据库目录完全分开
- 腾讯轻量国内通用型 2 核 / 2 GB / 60 GB SSD / 4 Mbps / 每月 300 GB 流量，官方刊例价 **52 元/月**。更小入门型 2 核 / 2 GB / 40 GB / 2 Mbps / 100 GB 为 **35 元/月**。52 元档是小流量试运营建议，不是已经压测出的容量保证，也不是完整上线总价。域名、超额流量、异机备份另计；购买时需核对实际地区库存、税费/优惠及结算总价。[官方价格](https://cloud.tencent.com/document/product/1207/73452)
- 国内公开网站需按供应商备案要求准备。通过腾讯轻量办理备案的服务器购买时长需不少于 3 个月，备案期间剩余有效期不少于 1 个月；不是只买一个月即可完成备案。腾讯对有字号个体户的备案主体选项为企业；无字号个体户须核对省管局要求，不能先承诺商城备案必过。后端域名的接入要求也应核实，不能仅因前端在 Netlify 就认定国内 API 免备案。[腾讯备案说明](https://cloud.tencent.com/document/product/243/73180)
- 前端可继续保留 Netlify，由同源 `/api/store/*` 反向代理到后端；或者经授权后把同一静态构建放在自有域名的 HTTPS 反向代理下。现阶段不改变线上网址。若未来换域名，旧站本机方案要先导出 JSON，不能跨域自动读取
- 建议腾讯短信或阿里短信二选一；订单提醒可选阿里邮件推送华东 1。区域是技术推荐，最终以主体、域名和数据存放要求为准

### B. 保留海外托管的备选

- Render 常驻服务最低档官方列价 **7 美元/月、512 MB**，持久盘 **0.25 美元/GB/月**；1 GB 磁盘的算术底价为 **7.25 美元/月**，不含超额、备份或税费。当前上传支持图片解码，512 MB 未做并发压力验证，不能当作稳定生产规格保证。[价格](https://render.com/pricing)
- 可选新加坡，当前官方区域列表没有中国内地。持久盘只能用于单实例；免费无持久盘实例不适合本项目。数据库应做一致性备份，不能只把平台磁盘快照当恢复方案。[区域](https://render.com/docs/regions) · [磁盘与备份限制](https://render.com/docs/disks)
- 腾讯官方 FAQ 允许境外服务器调用短信 API，但企业资质、签名、模板和真实送达验收仍不可省。阿里国内短信明确要求中国内地出口 IP，不能直接从 Render 新加坡调用。[腾讯境外调用](https://cloud.tencent.com/document/product/382/9558) · [阿里 IP 要求](https://help.aliyun.com/zh/sms/product-overview/faq)
- 海外数据存放、国内用户访问表现和跨境网络要单独确认；选项 B 不是自动采用的绕行方案

## +86 短信的真实门槛和价格

### 腾讯云

- 自 2025-09-18 起不再支持新增个人认证自用资质。个人账号价格表仍存在，不代表无企业资质也能申请生产短信；可升级企业认证或申请有真实授权的企业他用资质。[官方公告](https://cloud.tencent.com/announce/detail/2127)
- 自 2026-04-20 起签名支持公司、政府/机构或已注册商标；单有网站名称不足以保证通过。个体工商户有对应资质材料流程，最终由平台及运营商审核。[签名更新](https://cloud.tencent.com/announce/detail/2256) · [资质 FAQ](https://cloud.tencent.cn/document/product/382/108276)
- 自定义套餐最低 1,000 条，0.05 元/条，即 **50 元预付**；固定 10,000 条为 **470 元**。套餐 2 年有效，过期资源销毁。先审核可用再购买，不能将套餐购买等同于上线资格。[国内短信价格](https://cloud.tencent.com/document/product/382/36132)

### 阿里云

- 同样需要企业资质或合规企业他用授权；个人自用资质不能完成当前签名实名报备。国内验证码/通知按量前 10 万条为 **0.045 元/条（含税）**，即 1,000 条为 **45 元按实际量测算**；通用 1,000 条预付包为 **50 元**。这是两种计费方式，不能混为同一个套餐。[资质和 IP](https://help.aliyun.com/zh/sms/product-overview/faq) · [2026 调价](https://help.aliyun.com/zh/sms/product-overview/notice-on-price-adjustment-for-domestic-sms-services-2604)
- 企业主体、合规签名、验证码模板和运营商报备完成后再启用。发送请求受中国内地出口 IP 限制；报价不包含任何绕过该要求的代理服务

## 订单邮件

- **阿里 DirectMail**：按量 **2 元/1,000 封**；每个主账号免费额度是**总共 2,000 封，每天最多使用 200 封**，不是永久每天免费 200 封。开通后默认为按量，免费额或资源包用完后可能继续产生费用。[2026-08-31 官方计费](https://help.aliyun.com/zh/direct-mail/billing-methods)
- 必须有可验证的发信域名，建议使用独立发信子域名，避免动现有邮箱主域名的 MX。新建域名需验证 SPF、DKIM、DMARC、MX；境内程序建议华东 1，不同区域的发信配置不互通。[域名要求](https://help.aliyun.com/zh/direct-mail/user-guide/how-to-configure-sending-domain-names) · [区域选择](https://help.aliyun.com/zh/direct-mail/getting-started/simplified-procedure-of-sending-by-api-and-smtp)
- **Resend 备选**：免费每月 **3,000 封**、每天 **100 封**；Pro 为 **20 美元/月、50,000 封**。生产发信也要验证自有域名；QQ 地址可以是收件人，不能把 `qq.com` 当作自己的发信域名。[价格](https://resend.com/pricing) · [发信域名](https://resend.com/docs/dashboard/domains/introduction)
- 仅向服务器私有配置 `STORE_ORDER_EMAIL_TO` 指定的商家地址发最小化订单通知；没有真实邮箱默认值，未配置时不能启用投递。公开示例只使用 `orders@example.com`。通知：订单号、通用商品、金额、受保护后台链接。不发送顾客完整姓名、电话、地址或私有设计；任何供应商都须通过指定测试邮件实测收件箱/垃圾箱，不能保证 QQ 一定接收

## 这次已补齐：可验证的一致性备份

`server/backup.mjs` 使用 Node SQLite 在线备份 API，源库只读；每次创建独立 0700 目录、0600 备份与校验清单，不覆盖之前备份。备份包含已提交 WAL 数据、订单、方案、优惠券、通知队列和私有照片。校验包含 SHA-256、SQLite quick_check、外键检查及必要表检查。校验码用于发现损坏，不是防篡改签名。[Node SQLite 备份 API](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)

运维命令仅在授权主机的私有目录执行，示例中的目录须事先由运营者准备；此次只在合成测试库运行：

```sh
STORE_DB_PATH=/var/lib/dlcj/store.sqlite npm run store:backup -- --output-dir /var/backups/dlcj
npm run store:verify-backup -- --backup-dir /var/backups/dlcj/store-backup-实际目录
```

没有新增自动定时任务、异机上传或生产恢复命令。建议启用前决定可接受的数据丢失窗口，设置相应备份频率，并把验证后的备份加密保存到另一台主机/私有存储。只放在原磁盘上的副本无法应对整机丢失。备份含个人资料与会话数据，不能上传公开仓库或网站目录。

恢复演练：先校验；在隔离私有目录复制为新数据库，用关闭短信/邮件的测试配置打开，核对订单、方案、照片和优惠券；生产恢复必须先停 API 和通知 worker、另存原库及 WAL/SHM、批准后切换 `STORE_DB_PATH`，保留回退路径。恢复会丢失备份之后的变更，也可能重新带回已失效会话或待发通知，必须先撤销旧会话、核对队列，再单独批准恢复发送。不要把快照覆盖到运行中的数据库。

## 依赖安全复核及修复

本轮生产依赖审计最初发现1项critical及5项moderate依赖告警。已本地升级 `next` / `eslint-config-next` 为16.3.6，`fast-uri`为3.1.8，`baseline-browser-mapping`为2.11.26；清单、锁文件和实际安装一致，原有sharp覆盖配置保留。升级后 `npm audit --omit=dev` 结果为 **0项**；不把这个结果表述为没有未知漏洞或开发工具链也已全量审计。

Next告警仅影响把攻击者可控SVG内容/属性/样式交给Node版 `next/og` ImageResponse的应用。本项目应用代码检索未发现 `next/og` 或 `ImageResponse` 调用；当前Netlify静态站也不是该Node渲染接口，因此不能从依赖版本推断线上已经遭利用。此次仍按发布前安全维护完成补丁。[Next公告](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) · [fast-uri公告](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj) · [baseline公告](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv)

修复后重新通过：56项后端/安全/备份测试，119项DOM检查，TypeScript，Netlify及Vinext构建，新备份代码ESLint。全量源代码ESLint仍有17项原有错误；浏览器视觉、真实短信/邮件和生产持久盘验收仍未完成。

## 上线配置与验收顺序

1. 用户选择主机地区/预算、现有或新域名、供应商；使用已确认的个体工商户主体核实账号认证与短信审核流程。确认费用和服务条款后才创建/购买
2. 配置 Node 24；一个 API 进程；私有持久 `STORE_DB_PATH`；精确 HTTPS `STORE_PUBLIC_ORIGIN`；32 字节以上 `STORE_AUTH_SECRET` 由用户通过安全入口配置，绝不能写进 Vite/前端变量、源码或聊天
3. 保留 Netlify 时补上同源反向代理；尚未配置真实 API 目标。Netlify 支持 signed proxy（HS256 `x-nf-sign`），但当前 API 尚未实现其验签；不可只设置一个 rewrite 就宣布入口安全完成。须校验来源、替换客户端 IP 头、只信任确定的 ingress，真实 IP 限流、Cookie 和 Origin 行为通过预发布验收后再开放。[Netlify proxy](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/)
4. 选择所需适配器：阿里短信/DirectMail直连已有本地实现，其他厂商仍需网关开发；参见 STORE-PROVIDERS.md，联调超时、失败、幂等与配额；审核签名/模板与域名后，批准指定测试手机号/收件邮箱，再通过安全入口配置密钥和 `STORE_*_DELIVERY_APPROVED`
5. 真手机号完成 OTP 后，再由用户批准该账号为管理员；不把第一个注册用户自动提升。后台入口本身不能替代管理员授权
6. 福州发货：确认区域运费/包邮规则、售后与隐私条款；未确定地区继续逐单报价确认。支付继续保持关闭
7. 预发布检查：桌面/手机截图、真实浏览器返回/前进、OTP 失效/重发/限流、私有资料隔离、商家/顾客报价确认、通知失败恢复、备份恢复、重启数据保留和存储报警
8. 单独批准仓库推送、发布以及真实服务启用；发布后核对线上版本和测试结果。此次无上述生产动作

当前本地浏览器被套接字权限和回环导航限制阻挡，未重试被拒路线，DOM 回归不冒充真实浏览器验收。此清单随云端开发稿保存。当前线上仍为旧版。
