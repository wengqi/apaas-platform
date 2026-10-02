# 验收应用真实使用打磨（2026-10-02）

> R1.7 迁移完成后的第一轮真实用户路径走查（browser-use 全程实操），修复 5 项 amis 迁移
> 后遗留缺陷——e2e 全绿但真实使用不可用的典型清扫轮。

## 走查路径

runtime：合同台账 → 合同提交表单（真实填写提交）→ 审批页 → 任务中心（审批/批准）→
资产仪表盘四图；studio：发布向导三步真实发布 v1.1.0 → 版本列表/回滚 → 环境指针切换。

## 修复清单

| # | 缺陷 | 严重度 | 根因与修复 |
|---|---|---|---|
| 1 | 表单"审批状态"下拉"未找到任何结果"，**表单无法提交** | 阻断 | seed-procurement 的 amisFieldControl 是简版，single_select 未映射 options；对齐 seed-demo 完整版（config.options → amis options） |
| 2 | 任务中心审批页字段全 "-"（**盲审**） | 高 | 双重根因：① ApprovalPageRenderer 的 `data` prop 被同名 useQuery data **遮蔽**（页面域被换成接口 PageMeta）；② render(schema, data) 第二参在弹窗场景丢失（page 域空）。修复：prop 改名 ctxData + 上下文直接合并进 schema.data（page 渲染器第一优先级数据源） |
| 3 | 仪表盘四图空白 | 高 | fetcher 响应缺 `ok` 字段——Chart 组件**直连 env.fetcher**，不经 amis-core 的 status==0 推导，缺 ok 一律走失败分支；adaptApiResponse 补 ok。另 chartApi 第一图 categoryField 误用 name（实际字段 asset_name） |
| 4 | 台账/供应商编号列全 "-" | 中 | seed 直插 prisma.record 绕过写内核（AutoNumber 不生成）→ 显式补编号（PO-900x 避开计数器区间）；且 makeField 的 autoNumber config 是平铺 `{format}`，平台合同为嵌套 `{autoNumber:{format}}` → 格式读取 undefined |
| 5 | 资产聚合分类全"未知" | 中 | 同 3 的 name/asset_name 误用 |

## amis 集成新增踩坑（本轮实证）

- **fetcher 返回必须带 `ok: boolean`**：amis-core 的 api 层会从 status==0 推导 ok，
  但 Chart 等直连 env.fetcher 的渲染器不经推导——契约以官方 fetcher 文档为准
- **chart 取数的正确形态**：api.adaptor（字符串，参数 payload/response/api/context）返回
  **完整 echarts option（带 series 键）** → 走 renderChart(result.data) 直通分支。
  `responseAdaptor` 是全局适配器注册 API，不是 per-api 字段；config 模板 + replaceChartOption
  （单数，控制 setOption 替换语义，非数据映射开关）路线在弹窗/嵌套域场景不可靠
- **弹窗窄容器**：amis grid 的 columns 只定义 md 断点时，640px 弹窗内整列塌缩隐藏——
  弹窗内 schema 用平铺 body（container/static-text/tpl），不用 grid
- **amis static 家族**：裸 `type:'static'` 不渲染，用 `static-text`；且不进 form 更稳
  （form scope 与弹窗数据注入存在求值时机差异）
- **React prop 同名遮蔽**：组件入参 `data` 与 useQuery 返回的 `data` 同名解构后，
  后者覆盖前者——命名即合同，props 命名避免与 hook 返回撞名

## 验证

- 真实链路：表单提交（下拉可选）→ 记录落库带 PO-0005 自动编号 → 流程自动触发 →
  任务中心审批页合同数据可见 → 批准 → **记录状态回写 APPROVED** → 已办列表
- 仪表盘四图真实数据渲染（分类/趋势/状态分布）
- 发布向导 v1.1.0 真实发布 + prod 指针切换 + runtime 读取
- gateway 656 / studio 103 / runtime-ui 10 / e2e 82/82 全绿
