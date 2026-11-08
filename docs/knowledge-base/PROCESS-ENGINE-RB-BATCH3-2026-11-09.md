# R-B 批 3 实现记录：functional 波次④⑤ + S-01（2026-11-09）

- 依据：R-B 裁决轮（2026-11-08，◆2=A 实现 condition+摘除 event、◆3=A 监控权限面、◆5=A 做扫描）+ 工单档波次④⑤与横切 S-01
- 范围：functional-06（任务列表契约）+ functional-03（触发条件/事件语义）+ S-01 扫描工具；波次⑥（runtime-ui 加签/撤回/转办入口）留批 4

## 一、交付内容

**functional-06（◆3=A，TC-253）**：
- `GET /tasks` 新增 `processDefId` / `assignee` query 参数（controller 透传，service 消费）；
- 权限面：携带 processDefId 或**他人** assignee 时走 `assertProcessMonitor`——平台超管短路 → 租户级 BUILDER/TENANT_ADMIN 角色校验，否则 403「按流程/受理人筛选任务属流程监控能力」；携带本人 assignee 与无参数路径不触发断言（回归对照锚定）；
- 过滤：processDefId → `where.instance.processDefId`；assignee → `where.OR = [{ assignee }]` 精确匹配（userId/邮箱同存储口径）；pageSize 上限属 PE-24 修法，后续批对齐避免同端点二次踩。

**functional-03（◆2=A，TC-254/255）**：
- **求值**：extractTriggerInfo 提取 `data.condition`（字符串按 JSON 解析，解析失败保留原值由匹配层兜底）→ onRecordEvent 匹配链在 objectId 精确匹配后增加 `isValidJsonLogicRule`（D1 子集）+ `evaluateCondition`（复用 process-utils 的 jsonLogic.apply，与决策边/数据流 filter 同源）——满足才触发；非法条件/求值异常视为不触发 + warn（防存量脏配置静默放行或炸事件管道）；
- **三面校验同源**：①发布闸 = shared node-check trigger 规则（condition 非法 → 不完整，专因「触发条件表达式非法」）；②G3 = workflow.validator trigger 节点校验（INVALID_VALUE，MCP 提交路径）；③运行时 = 匹配层 isValidJsonLogicRule 前置。复用 D1 校验器（新增 shared `isValidJsonLogicRule`：顶层单键操作符节点 + 契约内操作符 + 嵌套递归），不新造表达式解析器；
- **event 摘除**：画布 TriggerConfigForm 移除「触发事件」Radio（引擎仅按 triggerType 匹配，event 全链零消费且可制造 RECORD_CREATED×event=UPDATE 矛盾配置）；condition 入口保留并改 JsonLogic 提示——**顺带修正原 placeholder 教 `amount > 1000` 错误语法**（对抗审查 functional-05 同源问题的事前预防）；存量 node.data.event 无害保留；
- **shared TriggerConfig 死契约处置（PE-30 汇合登记）**：删除无写入方/消费方的嵌套 objectTrigger 形状与 event 字段，改为画布扁平真实契约（triggerType/objectId?/condition?/cron?）；
- **MCP 方言指南补 condition 节**：trigger 节点行新增 condition 语法（与边条件同语法、对触发记录顶层标量字段求值、受支持操作符否则发布校验拒绝）+ SCHEDULED cron 必填说明（补 devil-01 指出的指南缺口）。

**S-01 扫描工具（◆5=A，TC-256）**：
- `packages/db/scripts/scan-process-dirty-configs.ts`（read-only）：扫 DRAFT+PUBLISHED 全量流程节点完整性（直接消费 shared collectNodeIssues——与发布预检同源，规则自动同步），输出脏流程/节点/专因清单，`--json` 可导出；exit 1=有脏配置；
- **dev 库实测（结果可见）**：59 个流程扫出 15 个脏配置——含 judge 对抗审查残留的 **PUBLISHED** 死配置（AUTO_REJECT 无 rejectToNodeId ×1、SCHEDULED 无 cron ×1，即 devil-01 指出的存量面）与多个 bug05 侧栏测试 DRAFT 流程；清单供人工处置。

## 二、验证

- TDD 红→绿：shared node-check +3 例（合法两形态/非法 JSON/超集操作符+多键）、gateway trigger.service +3 例（满足触发/不满足/非法 warn）、process-task-org-matching +6 例（BUILDER 过滤/403 两路/超管短路/本人 assignee 豁免/无参回归）；process 域 247+9=256 全绿。
- `pnpm test` 11/11、typecheck 11/11、e2e 全量 **99/99**。
- S-01 脚本 dev 库实测（上文）。

## 三、踩坑

- **root 无法解析 workspace 包**：`pnpm exec tsx` 不在根依赖；@apaas/db 在根 node_modules 无链接。脚本落位 `packages/db/scripts/`（db 的 node_modules 有 @apaas/shared 符号链接），并用 @prisma/client 直连 + 手读 packages/db/.env 的 DATABASE_URL——**绕开 @apaas/db 的 src barrel**（其内部 `.js` 后缀 ESM 在纯 node 下无法解析，db 包无 dist 产物）。
- node 24 原生执行可擦除类型标注的 .ts（无需 tsx）；MODULE_TYPELESS_PACKAGE_JSON 警告无害。

## 四、批次状态

- functional 波次①②③④⑤ ✅ + S-01 ✅；**余波次⑥**（functional-08：runtime-ui 加签/撤回/转办入口，零后端改动）→ 之后 PE-01~32 七波次（先读 ADR-0007 与波次依赖 ②×③、④×⑤）。
- TC-253~256 入库 TEST-CASES v3.9（Y 节）；QA-PLAN v1.0.24。
- 关联：2026-11-08 全项目对抗审查裁决书中 devil-01（MCP 指南不教 cron/condition）与 functional-05（面板教错误语法）两发现的本批修复面已闭环；correctness-05/functional-03（02b 覆盖缺口）与 devil-02（date 闸门）等其余发现待修复工单排期。
