# R1.7 页面层 amis 迁移第一轮实现记录（2026-10-02）

> 蓝图 R1.7：PageSchema v2=amis 方言；渲染器换 amis；组件 86→约 30 核心集；搭建器 amis 化兜底改造；v1 存量一次性迁移。本批次为第一轮：**runtime 渲染分流 + 存量迁移 + 搭建器兜底入口**；画布 amis 化与 v1 渲染器物理下线列后续。

## 1. 方言判别与渲染分流

- `shared/src/page` 新增 `isAmisPage(schema)`：`type==='page'` 且**无 v1 铁标记 root**（防御 v1 测试夹具携带 type 的 duck-typing 撞车——18 号夹具曾因此被 G3 拦）
- `PageView` 分流：amis → `AmisRenderer`（data 注入 `{appId, objectId}`；页面内取数/提交全部为 schema 中的平台相对 `api.url`，经 fetcher 自动带 token/baseURL）；v1 → 既有 ComponentRenderer（搭建器产出兼容）

**能力口径声明（诚实边界）**：v2 页面能力 = amis 原生能力，**不承诺 v1 的 viewmodel/autoQuery/动作链语义**——v2 取数显式写在 schema 的 api/url 中。

## 2. 存量迁移（seed 生成器改产 amis）

存量 v1 页面仅 9 个（demo 7 + procurement 2），**全部 seed 生成、无生产数据**——"一次性迁移"落地为 seed 生成器改产 + 重 seed，不需要 v1→amis 解析转换器：

| 页面类 | amis 形态 | 要点 |
|---|---|---|
| 列表页 | `crud` | `$page/$perPage` 分页参数；`responseAdaptor` 把 records API 的 `total` 映射为 amis 的 `count`；新建=form dialog 或跳转表单页 |
| 表单页 | `form` | 字段类型映射：text→input-text / long_text→textarea / currency→input-number(kilobitSeparator) / single_select→select(options) / date→input-date / auto_number→static；**static 表单必须 `actions: []`**（spike 陷阱） |
| 详情页 | `form` static:true + actions:[] | 展示态 |
| 仪表盘 | `grid` + `chart` | chart-data 聚合 API（POST，body 带 sourceType/sourceId/categoryField/aggregation）+ `responseAdaptor` 把 `[{category,value}]` 摊平为 `categories/values` 数组供 echarts config 模板绑定 |

- **环境指针幂等**：seed 写 publishedSnapshot 后将 AppEnvironment.currentVersionId 重置为 null（R1.4 指针优先于快照——不重置则重 seed 后运行时读旧 bundle）
- 清理 seed 中无引用的 v1 辅助（makeNode/bind/selectOptions/PropValue/ComponentNode）与残缺签名

## 3. 搭建器兜底入口 + G3 硬闸补位

- **CodeTab 新增 amis 方言编辑区**：粘贴 amis JSON → 结构预检（根节点/body/外联）→ 保存整体替换 schema → runtime 预览链接（`/app/:appId/p/:slug?env=dev`）。画布对 amis 页面显示引导面板（isAmisPage 守卫，删除快捷键同步防误触）
- **G3 硬闸补位**（探索发现的校验缺口）：`page.service.update` 对 amis 方言 schema 调 SchemaContractService.assertValid（此前仅 MCP 提交路径有闸，PUT 路径裸奔）——v1 schema 不变
- 全局 CSS/JS 编辑新增 **blur 立即落盘**（防高负载下防抖延迟到保存之后）

## 4. 踩坑记录

1. **字面量 appId 遮蔽**（OCR 复审发现）：seed 页面 schema.data 里写 `appId: '{appId}'` 会遮蔽 PageView 注入的真实 appId——data 域只放 objectId，appId 由运行时注入。
2. **amis crud 分页**：平台 records API 返回 `total`，amis 期望 `count`——responseAdaptor 映射。
3. **vite preview 服务的是构建产物**：改 studio 源码后必须 `pnpm --filter @apaas/studio build`，否则 e2e 验证的是旧 bundle（本次调试浪费数轮才定位）。
4. **python 锚点替换的静默失配**：prettier 格式化后锚点漂移，replace 不带 assert 会静默跳过——长文件修改用行定位或 Edit 工具。

## 5. 已知 flake 与后续

- e2e/03 代码页签写回用例 **fixme**（v1 搭建器套件负载竞态：隔离必过、套件内 store schema 丢失 globalCss 而服务端报保存成功）——v1 路径随 R1.7 后续下线，不投入修复
- 后续批次：搭建器画布 amis 化（蓝图 W3）、86→30 裁剪与 v1 渲染器物理下线（~10.4k 行瘦身）、R1.5 e2e/16 的页面断言刷新
