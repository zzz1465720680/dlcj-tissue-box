# 鼎立车眷 · 纸巾盒定制工坊

English overview: [README.md](README.md)

基于 Blender 重建模型、实物照片与展开裁片的 3D 定制网站。主体、四个包角、口沿可分别修改材质、颜色、固定规格打孔和图案；支持封边油、缝线及窄边布标。

## 品牌展示与页面入口

- `/`：鼎立车眷展示首页，包含白色撞色系列主视觉、整幅可点击的定制海报、细节与车内场景；电脑和手机分别排版。
- `/customize`：原有 3D 定制工坊。点击品牌或“产品展示”返回首页前保存当前草稿；再次进入时继续读取原来的 `dlcj-drafts` 数据。
- `/model-review`：原有模型校对页，返回按钮进入 `/customize`。
- 首页使用服务端内容与 WebP 图片，不挂载 3D 编辑器；模型在进入工坊后加载。按钮、导航和整幅海报均使用普通链接。
- 首页样式位于 `app/showcase.css`，统一使用 `sc-` 前缀，与工坊样式隔离。后续新品可在主导航与产品展示区增加独立内容。
- 新海报原图与实际生成提示词保存在 `G:\DLCJ\12_广告设计\纸巾盒网站展示_20260922`。`scripts/prepare-showcase-assets.mjs` 仅生成网页所需的尺寸与 WebP 压缩副本，不改变原图。
- 本轮检查记录：`checks/showcase-20260922/VALIDATION.md`。当前交付为本地版本，未更新线上网站。

## 使用

- 拖动产品旋转，点击部位选择；右侧切换材质、工艺、图案。
- 四角默认联动，可关闭联动后分别修改。
- 展开编辑支持 PNG/JPG/WebP、文字、画笔、橡皮与图层移除。
- 本机临时草稿使用 IndexedDB；正式方案登录后存储于 R2，按用户隔离。
- 可导出多角度 PNG 和包含原始图案及笔迹的 JSON，也可重新导入 JSON。

## 本地开发

Node.js 22.13+。安装依赖后运行 `npm run dev`，默认端口 5173。运行 `npm run build` 生成 Cloudflare Worker 及静态资源。`npx tsc --noEmit` 检查类型。

## 模型边界

当前模型以长 16 cm、宽 10.5 cm、高约 6 cm 为基准，在 Blender 中从连续主体裁片折合。四个包角各为连通网格。皮纹使用 40 mm 物理周期的 2048 法线与粗糙度贴图；孔径/间距使用固定展示尺度。搭接深度、厚度和微纹仍是实拍拟合。生产前必须用实测长宽高、纸样、真实材质色卡与标签尺寸校准；网页导出不作为裁切生产文件。

主体、皮纹和孔纹使用三组独立 UV；主体是同一张带缺口的皮料折合，窄边没有独立端盖。网页现加载 `public/models/revision7/tissuebox-r7.glb`，来自已确认、已保存的 revision7 场景。旧 `tissuebox-v2.glb` 和原始 `.blend` 均保留。`/model-review` 使用同一网页模型实时检查窄端、布标端头、连续弧边和顶部搭接，并明确标注 revision7 Blender 参考图。

## revision7 网页资产与本地验证

- 仅本地接入；未发布。原站点 `.openai/hosting.json`、登录、R2 绑定、权限及用户隔离逻辑不变。
- `ArtworkUV` → `uv`；`GrainUV` → `uv1`；`HoleUV` → `uv2`。GLB 保留 `Cut_pattern`，默认权重为 0（折合状态）。
- 圆孔采用 `lib/perforation.ts` 中的网页等效着色器：保留场景内 `PerforationMetricR4` 的三个分量为 `_WEB_METRIC`，恢复 glTF 翻转的 V 后计算固定 0.86 mm 孔径、2.4 mm 横向/2.1 mm 行间距及孔边凹陷。主体的可选打孔按保存的曲面和 HoleUV 求同一定义的度量。颜色、图案、打孔开关、线色、油边和布标分别可编辑。GLB 的占位材质需配合本项目渲染器；通用 GLB 查看器不代表最终网页材质效果。
- 从原场景求值现有厚度与曲线；无重建、无简化、无顶点量化。38 个产品对象，765,740 个三角面。排除地面、灯光、相机和空的旧辅助曲线，保留默认隐藏的布标。
- Meshopt **无损**压缩后约 18.2 MB，170 个缓冲区在 Three.js 解码后逐字节一致。原始 2K OpenGL 法线/粗糙度贴图和 40 mm 平铺周期沿用。
- 保存结构保持 `version: 1` 与 `body / corner0…3 / trim`。本机已有草稿正常恢复；测试前草稿备份在本地 `checks/revision7/original-browser-draft.json`。
- 电脑端在 1366×768、1440×960 验证，沿用原页面。模型静止时不持续重绘；导出保留视角、灯光及纸巾状态，并显示生成的 PNG 与再次下载入口。
- 完整验证说明：`checks/revision7/VALIDATION.md`。线上 ChatGPT 登录和远程 R2 本轮未发布联测；本地已有登录模拟与 Miniflare R2 已实际保存、读取和还原，双用户隔离用同一 API 路由验证。

重新制作网页资产时，仅运行本项目脚本（不执行历史模型生成脚本）：

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background 'G:\DLCJ\14_纸巾盒三维模型\revision7\exports\tissuebox_revision7.blend' --python "$PWD/scripts/export-revision7.py"
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python "$PWD/scripts/compress-glb-lossless.py"
node scripts/verify-revision7.mjs
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background 'G:\DLCJ\14_纸巾盒三维模型\revision7\exports\tissuebox_revision7.blend' --python "$PWD/scripts/audit-revision7-geometry.py"
```

这些脚本不会保存或覆盖 Blender 源文件。`checks/revision7` 保存本机校验数据及截图，不是公开网页资产。

站点默认私有；正式面向客户开放及绑定域名另行设置访问范围。


## 电脑端性能与新搭配（2026-09-22 后续更新）

定制入口为 `/customize`。默认第二款改为照片参考的「曜石 · 珊瑚红」，第三款为「森林 · 亚麻」，第一款白皮蓝边保留。缩略图在 `public/presets/`，由当前网页模型实拍生成，原参考照片保留。

渲染器现在复用材质和图案画布，纯色修改不生成整件贴图；同部位曲线合并提交，三角面、位置、法线、UV 与孔形数据不变。展开形态键继续保存在 GLB/Blender 中，折合展示不上传无效形态键纹理。拖动和旋转按像素预算渲染，停止后恢复清晰显示，静止及后台停止动画循环。PNG 导出保持固定分辨率。

运行 `node scripts/verify-render-optimization.mjs` 检查这一阶段的几何一致性、预设兼容和受保护文件。性能数据与回归记录保存在本地 `checks/revision7/performance-0922/PERFORMANCE.md`。开发模式可在定制入口追加 `?render-debug=1` 查看同场景旋转测量与资源统计；普通页面和生产模式不显示诊断工具。
