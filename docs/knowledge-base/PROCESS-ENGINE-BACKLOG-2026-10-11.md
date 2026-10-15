# 流程引擎问题专题遗留清单（2026-10-11）

> **来源**：用户裁决——"流程引擎这些问题要单独一个专题解决"；本文档汇总截至目前**全部已知**的流程引擎问题，作为专题的起点与排期依据。
> **口径**：每条带证据（文件:行号，均为 2026-10-11 当日核实）；状态分五类——**确认缺口**（证据充分可排期）/ **待验证**（代码级确认、运行时症状未实测）/ **产品待裁决** / **已修复留档**（防重复排查）/ **工程风险**。
> **维护规约**：新发现引擎问题即时追加；解决后移入"已修复留档"节并注明修复轮次；本清单是专题唯一台账。

---

## A. 确认缺口（专题主体）

> A 节已清偿：A1/A3 → C6/C7（R1）；A2 → C8（R2，裁决选 (a)：ORG/FORM_FIELD 实现、SUPERVISOR 摘除）。

---

## B. 产品语义待裁决

### B1 已办宽口径（候选组他人处理 / 撤回取消任务计入我的已办）

- **现状**：已办查询 = assignee 是我（ID/邮箱）∪ 候选组命中我的角色 ∪ 状态 ∈ {APPROVED, REJECTED, DELEGATED, CANCELLED}（`process.service.ts:539-558`）。
- **含义**：候选组角色内**他人**处理掉的任务、仍在我待办期间实例被**撤回**而取消的任务，都会出现在我的已办；直接指派任务则严格等于"我处理过的"。
- **对照**：与飞书"已办≈我参与的审批"语义基本一致。**倾向维持**，待用户裁决；收窄方案=按任务实际决策操作人过滤。

### B2 审批环节不能填数据（审批绑定页强制只读）

- **现状**：审批绑定页 `makeAmisPageReadonly` 强制只读+物理移除提交按钮（提交路径分离语义，2026-10-07 裁决：页面提交只写记录、流程推进仅任务中心）。
- **差距**：飞书 aPaaS 审批节点支持审批人**填表单**（审批时补录字段值到记录）；当前 `CompleteTaskDto.formData` 通道存在（DTO 有字段、任务中心意见框仅 comment），但审批页 UI 无填写面。
- **建议**：专题内评估是否开放"审批节点可写字段"（writeback 之外的填报），涉及只读渲染策略、字段级权限与审计；若裁决开放，拆独立设计。

---

## C. 已修复留档（防重复排查，不排期）

| # | 问题 | 修复轮次 | 要点 |
|---|---|---|---|
| C1 | **引擎决策双层契约断裂**：①决策变量仅存节点命名空间（`<nodeId>.output.decision`），指南边条件 `{"var":"decision"}` 求值恒 undefined → 条件边全不匹配 → 实例 COMPLETED 零回写零通知静默终结；②决策值未规范化（传 `approve` ≠ `APPROVED`） | R5.5（2026-10-09） | completeTask 锁内注入顶层规范别名 canonicalDecision + 值规范化；**回归单测已补**（`process-engine.spec.ts:582` 起断言非规范输入真实路由 + 顶层 `decision` 别名可消费）——R5.5 记录中"单测待补"事项已闭环 |
| C2 | **#17 条件分支路由断裂**：edge label 契约缺失——降级"第一条出边"让两轮验证碰巧全绿，驳回被误写已完成 | 零知识旅程 R3（2026-10-03） | serializer label=title 同源修复；教训=降级路径必须写反向用例 |
| C3 | **#12 仅角色审批无主任务行**：createMany 空数组 → 流程挂起但永无任务 | 零知识旅程 R2（2026-10-03） | 修为无主任务行（assignee=null）+ candidateGroups 匹配角色成员 |
| C4 | **#10 对象操作契约断裂**：UI 写 fieldMapping、引擎读 inputsValues | 零知识旅程 R2（2026-10-03） | serializer 四态转换 + EventBridge extInfo 并入导出 |
| C5 | **触发器 pattern 清理互踩**：多触发器 jobId 冲突 | R1.4（2026-10-01） | jobId=scheduled:<env>:<defId> 随环境隔离 |
| C6 | **A3 MANUAL 启动不注入发起人**：startInstance 仅取显式传入（`req.triggeredByUser ?? null`），studio 只传 {processKey, variables} → 实例无发起人（「我发起的」不可见/兜底通知无收件人/INITIATOR 无发起人可用） | 专题 R1（2026-10-11） | 服务端 `triggeredByUser = req.triggeredByUser ?? callerUserId`（显式优先/用户身份兜底/内部调用 null 兼容，`process.service.ts` startInstance）；三路单测 process-start-instance.spec.ts；OpenAPI 直调 engine.startProcess 不经过此方法，保留服务身份显式语义；TC-173 |
| C7 | **A1「发起人」审批人类型缺失（INITIATOR）**：UI 5 种无发起人选项、执行器无动态解析、G3 硬闸连变通也拦（原 A1 节四件套方案全项落地） | 专题 R1（2026-10-11） | shared 新增 `UserTaskAssigneeType` 契约（UserTaskConfig.assigneeType 显式化，为 A2 三类型接线铺路）+ executor 解析 `instance.triggerContext.triggeredByUser`（缺失报清晰错误，不静默创建无主任务复现 #12）+ G3 放行（isInitiator 短路）+ node-check 同步 + studio 下拉「发起人」免填审批人 + 方言指南补节 + 单测（executor 两路/validator 放行与回归对照/node-check）；TC-174；实现记录 docs/knowledge-base/PROCESS-ENGINE-TOPIC-R1-INITIATOR-2026-10-11.md |
| C8 | **A2 ORG/SUPERVISOR/FORM_FIELD 三类型引擎端未接线**（E2 探针实测：ORG/FORM_FIELD 的编码/字段名被当用户 ID 字面消费→任务挂起无人可见且能过发布预检；SUPERVISOR 无输入→死在发布预检） | 专题 R2（2026-10-11，用户裁决选 (a)） | **ORG**：candidateGroups 语义扩展=角色 ID 或组织 ID（Flowable 同款）——executor 校验组织有成员（无成员报清晰错误防静默挂起）、listTasks/assertTaskMembership/assertInstanceVisible 按「角色∪组织」匹配（顺带清除 candidateUsers 不存在列的死代码读取）；**FORM_FIELD**：executor 从触发记录字段取审批人（仅记录触发；无上下文/字段无效报清晰错误）；**SUPERVISOR 摘除**：schema.prisma 无 manager/supervisor 字段（无数据源），shared 类型收窄 + UI 摘除，待身份层 User.managerId 后恢复；studio ORG 改组织下拉（orgsApi.getTree）；方言指南补 ORG/FORM_FIELD 两节；TC-175/176；实现记录 docs/knowledge-base/PROCESS-ENGINE-TOPIC-R2-DYNAMIC-ASSIGNEE-2026-10-11.md |

---

## D. 工程风险（水平扩展前必查）

- **D1 多副本 Redis 锁未实测**：分布式锁已内置、降级为进程内互斥；多副本部署下锁语义需真实压测确认（AGENTS.md 风险项沿用）。
- **D2 BullMQ / Redis 连接数压测**：水平扩展前评估队列与连接水位。
- **D3 query 节点未接入发起人 ABAC 条件**：流程内 query 节点暂不能按发起人身份过滤（历史残留项）。

---

## E. 验证缺口

- **E1** GUI 二级交互走查（台账部分）——任务中心主体已清（2026-10-11 三页签/错误态/进度弹窗 GUI 走查通过）。
- **E2** ~~A2 三种未接线类型的运行时症状实测~~ **已清偿**（R2 探针实测三类型各一用例，证据固于 C8 与实现记录）。

---

## F. 边界外相关（非引擎，一句话防丢）

- `explain()` 不过滤 rule.appId（权限调试工具缝隙，R5 遗留，单独修）；
- BUTTON_CLICK 枚举未接线（页面事件层，非引擎）；
- 台账 mapping 存量 schema 缺配置（已裁决暂不处理）。

---

## G. BPMN 语义子集对齐（2026-10-11 方向探讨新增）

> 来源：Appsmith 对标与平台方向审视（`docs/research/RESEARCH-appsmith-benchmark-platform-direction-2026-10-11.md`，Q9/S1–S5 已裁决）；本节为台账指针，论证不在此重复。盘点结论：控制流内核已达 BPMN 核心子集水位（XOR/AND/OR+严格汇聚/循环/调用活动/默认流全齐），缺口集中事件面与失败处理面。

| # | 事项 | 裁决 | 状态 |
|---|---|---|---|
| S1 | 用户任务超时边界（timer boundary：dueDate 消费+BullMQ 到点动作——催办/自动通过/自动驳回/转交升级） | **做**，排序 A2 之后 | 待排期 |
| S2 | 节点失败处理策略（error boundary 工程化简化：终止/跳转/忽略留痕） | **做轻量版** | 待排期 |
| S3 | 消息事件/事件型网关 | 缓——wait_for_condition+外部写变量变通已可用，观察项 | 不立项 |
| S4 | terminate 终止节点 | 不立节点类型（cancelProcess 已覆盖） | 不立项 |
| S5 | DMN/choreography/事件子流程/ad-hoc 子流程/复杂网关/receive·manual task/通用多实例 | **明确不做** | 落 ADR 待办 |

> Q9 架构裁决：WorkflowSchema 保持唯一方言，BPMN 按**语义子集**对齐；XML 互操作与建模符号对齐**不做**——重大架构决策，后续单独立 ADR（裁决记录源=研究文档 §3）。

---

## H. 开源引擎对比与 Temporal 借鉴裁决（2026-10-11，grilling 收官）

> 来源：开源引擎对比 + Temporal 深度调研（全文与来源见 `docs/research/RESEARCH-process-engine-oss-comparison-2026-10-11.md`）；用户准绳="简单稳定可扩展、不造轮子、用好业界开源、少自研不健壮 bug"。本节只留执行摘要。

### H1 新发现缺口（并入 S1/S2 轮执行）

| # | 缺口 | 证据 | 最小修法 |
|---|---|---|---|
| H1-a | **边走向+条件求值未持久化**——C1 类静默终结事故无法事后回答"为什么走这条边"；condition 执行器"无匹配降级第一条出边"（C2 教训）无持久化痕迹 | 引擎推进令牌不落路由（process-engine.ts:378-380）；NodeExecution 表已有 input/output/retries 字段（schema.prisma:616-638） | advance 时把路由结果写进源节点 NodeExecution.output，十几行零迁移 |
| H1-b | **确定性失败被重试 3 次**——全平台唯一重试消费点 attempts:3 一刀切，参数/校验类错误也三连重试 | process-engine.ts:43；HTTP 执行器无自带重试（仅 AbortSignal.timeout） | 执行器结果加 retryable 标志→attempts 分类（1 vs 3），几行 |

### H2 Temporal 裁决

- **不引入为运行组件**。量化依据：理论可替换的手写异步协调代码仅约 781 行（wait-for-condition 54+loop-utils 100+trigger.service 342+dataflow 租约 285），均经真实主线验证、无已知执行可靠性事故；新增 4 服务+DB 违反"简单稳定"准绳。
- **引入触发条件**（命中任一才重评，白纸黑字防"原则性引入"）：① wait-for-condition 轮询撑不住真实规模；② AI 交付流水线常态化卡死无人管；③ 跨天跨人工闸门编排成为产品功能。
- **健壮性归因**：C1-C4/A2 全部为契约漂移（编辑器↔引擎↔校验器），无一例执行丢失/等待不可靠——对症药=契约一致性测试，Temporal 类 durable 基建对本类 bug 无疗效。

### H3 模式借鉴降级裁决（3 做 3 不做）

- ✅ **做**：①H1-a 边走向落库（并入 S1/S2 轮）；②事故 schema fixture 契约测试（=方向探讨已列"四层契约一致性测试"候选，C1/C2/C4 事故 schema 固化为 fixture 断言全链路语义，每事故约半天，按原排期）；③H1-b retryable 分类（随手或并入契约轮）。
- ❌ **不做（防重复提案）**：①重放式回归框架（引擎非确定性重放架构，需全套测试替身，收益被契约 fixture 覆盖）；②saga 自动补偿（逆操作+补偿幂等+不可逆排除=分布式事务级复杂度；主线"决策→回写"中途失败留 FAILED+审计可接受；**S2 维持轻量版=错误出口路由，补偿由搭建者显式画节点**）；③声明式重试 policy 框架（单消费点 YAGNI）。

### H4 开源引擎选型速查（详表见研究文档 §4）

- 可免费商用+可二开：Flowable OSS（Apache 2.0）/ Temporal（MIT）/ Cadence / Conductor OSS / Warm-Flow（Apache 2.0）/ jBPM·Kogito（Apache 2.0，活跃度未逐一核实）；
- 不可用于生产或受限：Camunda 7 CE（2025-10 EOL）/ Camunda 8（生产自托管收费）/ n8n（Sustainable Use）/ Windmill·FlowLong（AGPL 传染）；
- 结论：**自研+抄语义**（Flowable/Warm-Flow 当语义字典、Temporal 当范式参照），与 G 节 Q9 裁决一致不翻案；S1 设计参照 Temporal condition+timeout+escalate 范式；G6 major 冻结与 Temporal Workflow Pinning 概念同构（印证）。

---

## 专题建议排序

1. **S1/S2**（BPMN 语义补齐两件，见 G 节；S1 一笔投资清三笔账——A 系数据层缺口已全数清偿：A1/A3→C6/C7、A2→C8；**顺带 H1-a/H1-b 两个最小件**——边走向落库+retryable 分类，各十几行）；
2. **B1/B2**（产品语义，用户裁决后动）；
3. **D 系列**（水平扩展前置条件，非当前阻塞）。
