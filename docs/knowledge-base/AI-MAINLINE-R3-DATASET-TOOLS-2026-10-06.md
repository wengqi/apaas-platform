# AI 主线第三轮：数据集工具面（跨对象报表腿打通）— 2026-10-06

> 方法论：先实测后修缺。实测载体：采购分析应用（app `cmuvelwpb0001udq05o4g4hmo`，
> v0.1.0 已发布，含供应商/采购单双对象 join 数据流 + 数据集图表），留作回归夹具。

## 一、交付：数据集工具面全链路

**AI 现在能生成跨对象 join 的数据集报表**：`submit_dataset_draft`（单提）+
`submit_app_drafts` 的 datasets 数组（单波）+ `list_datasets`（读）+
`validate_schema kind="dataset"`（G3 第四校验器）+ `get_dialect_guide kind="dataset"`。

实测：单波生成供应商×采购单应用（双对象 join → groupBy+sum 聚合 → 数据集 →
看板柱状图），人审批准后数据集物化（3 组供应商金额/单数精确吻合），
**运行时跨对象图表渲染验证通过**。DSL 不发明新语言——直接复用 shared
`DataFlowConfig` 结构化 JSON，校验器做结构一致性（别名引用闭合/枚举值域/护栏）。

治理轨道扩展：`ReviewModule` 加 `DATASET`（快照=apiName/name/description/config），
拓扑序 对象→**数据集**→页面→流程；批准落地时解析 config 内 `@ref:object:` 令牌、
落 ACTIVE 并**立即 execute 物化数据集**（同步建 Dataset 行供 `@ref:dataset:` 解析，
行数据 BullMQ 异步物化）；页面 schema 的 `@ref:dataset:<数据流apiName>` 令牌落地时解析为数据集 ID。

## 二、实测挖出的三个真 bug（全部修复）

1. **治理基线未归一化 → 同资源二次 AI 提交漂移必然误报**（系统性，OBJECT/PAGE/PROCESS 同病）：
   提交快照存 `@ref:` 令牌，批准落地解析成真实 ID 写活表；第二次提交的漂移检查
   "活表(真实 ID) ≠ 基线(令牌)"必然失败。修复：applyApproved 落地成功后重新
   extractLive 回写 row.snapshot（**基线=落地形态**）。
2. **dataflow-sql join 分支双重别名 → PG 42601**（G5 遗留，join 分支在 SQL 下推后
   从未被真实执行）：sourceSqls 已含 `AS q_<alias> (data)` 表别名，旧实现又叠加
   `l`/`r` 短别名。修复：直接引用 `q_<alias>.data`；spec 断言从旧错误形态更新为新形态
   （测试意图不变——COALESCE 键规范化+右表前缀聚合）。
3. **聚合分支行键与数据集列契约不一致**：聚合行键=groupBy 原样键+指标别名，
   而数据集列定义/图表取数按 outputFields.alias——图表 categoryField 取不到显示
   "未知"。修复：runPipeline 聚合分支统一投影重命名（projectAggRows，source 解析
   与 SQL outputValueExpr 同规则）；buildColumns 聚合分支优先 outputFields。

## 三、引擎字段键契约（方言指南核心语料，已入指南）

- **join 合并行的键**：左表字段保持裸键（`amount`）；右表字段自动加
  `{rightAlias}_` 前缀（右表别名 suppliers 的 name → `suppliers_name`）。
- **aggregation.groupBy / metrics.field 引用合并行键——不支持点路径**
  （实测踩坑：`suppliers.supplier_name` 被 G5 字段键守卫拒绝）；校验器现已
  静态拒绝并给出前缀键建议。
- **outputFields.source 支持点路径**（`alias.field` 自动映射前缀键/裸键）；
  聚合场景直接写分组键或指标别名。数据集对外行键/列名 = outputFields.alias。

## 四、实测过程记录（诚实账）

- 提交失误两次：宿主 MCP 工具清单缓存不含新工具（gateway 重启后需重连/直连 HTTP 端点，
  curl JSON-RPC tools/call 即可）；两笔占位对象误提交（审核中心驳回清理，演练了驳回链路）。
- 跨批次依赖限制：页面 `@ref:dataset:` 依赖同批数据流先落地——分两批提交时页面批准
  会失败（部分成功语义，错误信息明确指向缺失数据集）。**单波提交把 datasets 放进同一
  submit_app_drafts 即无此问题**（正确姿势已写入指南）。
- REST POST records 扁平契约再次踩坑（造数时误用 {"data":{}} 包裹 → join 键取不到
  → 笛卡尔积 18 行的假象）；python 重造扁平数据后聚合正确。
- 反馈环断言：驳回→writeback 驳回值回写 ✓（status=rejected 实测）；业务通知依赖
  流程配 notification 节点（AI 生成流未配）——仍是业务用户旅程轮的"自动通知默认链路"遗留。
- **反馈环 e2e（Playwright）本轮未写**：本轮实测已做 API 级断言（回写+物化+图表），
  但 e2e 代码欠账延续至下轮——本轮修了三个引擎/治理 bug，需要先让这批修复沉淀。

## 五、下轮建议

1. 权限工具面（submit_permission_rule_draft + list_permission_rules）；
2. 反馈环 e2e（驳回分支+回写+通知断言，含本轮数据集夹具）；
3. 审批弹窗数据域映射 UX、自动通知默认链路（业务用户旅程轮）。

关联 [[ai-mainline-r2-dashboard]] [[batch-submit-2026-10-03]] [[review-followup-2026-10-05]] [[g5-dataset-sql-2026-10-01]]。
