# AI 主线第二轮：报表腿打通（仪表盘实测 + 方言指南补强）— 2026-10-05

> 方法论：主线纵深打磨（AI 第一公民真实使用驱动）——先实测后修缺，不预建工具。
> 实测载体：销售订单管理应用（app `cmuvc87ze0064125wgq97yfdk`，v0.1.0 已发布），
> 含对象/提交表单/台账/**仪表盘三图表**/审批流（回写 status），保留作回归夹具。

## 一、实测结论：报表腿已通

**AI 用现有 MCP 工具面（create_application + submit_app_drafts 共 2 次调用 + 1 次人审）
生成了"表单+审批+报表"完整应用，仪表盘三图表（柱/折线/饼）在运行时全部正确渲染**，
数据与库内完全吻合（east 13.6 / north 9.1 / south 25 / southwest 3.6；按月 3+3；饼图全 approved）。
首要成功标准"表单+审批+报表"的报表腿自此闭环——AI 生成能力与人工搭建完全对齐。

关键路径事实：
- **图表语法**（此前零文档，靠 get_page 资产仪表盘照猫画虎）：`{"type":"chart"}` +
  `api POST /apps/<appId>/datasets/chart-data` + 载荷 `{sourceId, sourceType:"object",
  aggregation, categoryField, valueField?, timeGranularity?}` + **adaptor JS 字符串**
  （转 ECharts option）；饼图响应形态不同（`payload.data=[{category,value}]`，无 xAxis/yAxis）。
- **@ref 令牌解析比已记录的更广**：`api.data.sourceId` 深层数据域也递归解析
  （此前只记录了 url 子串与 data.objectId）——已补进方言指南。
- G3 对 `chart` 类型/amis 图表 schema 全程放行（白名单覆盖）。

## 二、摩擦点与处置

| # | 现象 | 定性 | 处置 |
|---|---|---|---|
| 1 | amis_page 方言指南零 chart 覆盖，AI 生成报表页首过率无保障 | 指南缺陷（高） | ✅ 补 chart 三连节：chart-data 载荷契约 / 柱折 adaptor 模板 / 饼图差异 + grid 布局 |
| 2 | WorkflowSchema edges 被打回（我写了 source/target） | **流程失误非指南缺陷**——workflow 指南早已写明 sourceNodeID/targetNodeID，但我只读了 amis_page 指南 | ✅ 指南补最小骨架示例降低犯错率；教训：**生成哪类 schema 就先读哪份指南**（工具 hint 本来就强调） |
| 3 | 运行端申请内容区裸露记录 `id` 行 | 小 UX（inputs 过滤不排除 id） | ✅ TaskCenter triggerData 过滤 `key === 'id'` |
| 4 | `POST /objects/:id/records` 请求体是**扁平字段契约**（无 data 包裹层）——手工调用者/AI 走 REST 探索时自然踩坑（我实测踩了，字段被整包存进 `data.data`） | 契约备忘（RecordCreateDto 扁平索引签名；amis 表单天然扁平所以 UI 路径无感） | 知识库记录；MCP 路径不涉及；后续可在 OpenAPI 文档标注 |
| 5 | 数据集/数据流工具面缺失（AI 不能生成跨对象 join 的数据集报表） | 已知缺口（本轮未触发阻塞——单对象 chart-data 聚合已覆盖验收场景） | 留待下一轮：`submit_dataset_draft`（数据流 DSL 是难点：sources/joins/aggregations 结构化表达） |

顺带实证：发布向导"新建应用归入页面组"修复（70953a9 之 H）在 gateway 重启后真实验证通过
——新产生的应用级变更归入独立"应用"分组；历史 PAGE 侧行不回改（零兼容口径）。

## 三、工程坑

- **gateway 跑 dist**：改 mcp 语料/后端服务后必须 rebuild + 重启进程才生效（本轮两处验证都依赖重启）；重启后浏览器 access token 需重登（ALS/JWT 派生密钥）。
- zsh 数组从 1 开始（`$arr[0]` 为空）——批量 curl 脚本首元素静默丢失，用 `${arr[@]:offset:1}` 或注意索引。
- `RecordCreateDto` 是 `[key: string]: unknown` 扁平契约且 Controller 关闭 whitelist——多余包裹层会被当成字段存库，不报错（静默成功），排查时看 record.data 原始结构。

## 四、下轮建议（优先级序）

1. **数据集工具面**（`submit_dataset_draft` + 方言指南 dataset 节）——解锁跨对象报表；数据流 DSL（sources/joins/aggregations）需要一轮 spike 确定最小可校验子集；
2. 权限工具面（`submit_permission_rule_draft` / `list_permission_rules`）——AI 生成应用目前靠种子角色兜底；
3. 反馈环 e2e（驳回分支+回写+通知断言，上上轮遗留）可与数据集轮合并做。

关联 [[ai-first-polish-r1-2026-10-03]] [[batch-submit-2026-10-03]] [[review-followup-2026-10-05]] [[apaas-mcp-dialects]]。
