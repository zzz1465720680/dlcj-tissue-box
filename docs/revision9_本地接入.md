# revision9 本地网站接入（2026-09-29）

网站现在使用 `public/models/revision9/tissuebox-r9.glb`，来源为用户确认的 `14_纸巾盒三维模型/revision9/exports/tissuebox_revision9.blend`。原 Blender 源文件和 revision7 网站资产保留。

## 已启用

- revision8 的平顺包边、分离切边法线和修正端头。
- revision9 的 0.22 mm 四角外露针脚；初始白皮蓝边、白瓷青柠和奶油白搭配使用清晰的暖灰色包角线。已有草稿与用户自选线色照常保留。
- 四个包角使用原孔中心图和保存的成型表面位置，在网页中计算统一 0.86 mm 孔径。皮面、内层和阴影使用同一孔纹逻辑。主体与口沿保留原有孔纹算法。
- `/customize` 与 `/model-review` 共用新版模型，模型校对页的 Blender 参考图也已更新。

已有首页、皮革材质表现、接触阴影、图案编辑、设计数据格式、草稿、登录和存储逻辑保持原有行为。本次为指定本地项目接入，没有发布线上。

## 数据与验证

- Blender SHA-256：`e49b7ffe6edeb043efaf8a2abe237158db26d68eb3c6313e4a4b969fbd3351bc`。
- GLB SHA-256：`6fdcd93a1af14c00360d865548987ef200c9b1a810f5bddd5f9f9d7887561050`。
- GLB 大小 21,195,912 字节；182 个压缩缓冲区经 Three.js 解码后与未压缩导出逐字节一致。
- 2412 个内部孔中心已逐一对照；最大图像存储精度误差小于 0.000005 mm，与 Blender 保持一致。
- 保存的成型位置属性继续使用 Blender 坐标系，与中心图直接比较；图案、皮纹、孔纹 UV 分开保留，glTF 的 V 翻转在孔纹计算中还原。
- TypeScript 检查和生产构建通过。电脑、手机实际加载通过；连续打孔切换、材质切换、旋转、PNG 导出通过，无页面或着色器错误。连续切换前后几何/纹理数量和材质对象保持一致。

记录位于 `checks/revision9/`：`web-asset-audit.json`、`browser-audit.json`、导出审计及实际截图。接入前的相关本地文件保存在 `checks/revision9/before/`。

## 延续的模型限制

采用用户选定的保留孔位、统一孔径方案。少数急弯孔仍有曲率影响，边缘孔可能被裁断，两对端部孔在已确认的 revision9 中相接；网页忠实保留该方案，没有擅自挪孔或缩孔。这是当前成型态的展示模型，不是生产打孔或裁切文件。

## 重新导出

在 Blender 后台加载上述 revision9 源文件，执行 `scripts/export-revision9.py`，然后用 Blender Python 执行 `scripts/compress-glb-revision9.py`。两者不保存源模型。运行 `node scripts/verify-revision9.mjs` 验证导出。

网页适配位于 `lib/revision9-holes.ts`、`lib/perforation.ts`、`lib/product-assets.ts` 和 `lib/product-materials.ts`。中心图采用 float32 RGBA、最近邻采样、不做颜色转换或缩放量化；关闭打孔后切回普通皮面材质。
