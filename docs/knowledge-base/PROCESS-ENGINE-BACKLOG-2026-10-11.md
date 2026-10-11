# 流程引擎问题专题遗留清单（2026-10-11）

> **来源**：用户裁决——"流程引擎这些问题要单独一个专题解决"；本文档汇总截至目前**全部已知**的流程引擎问题，作为专题的起点与排期依据。
> **口径**：每条带证据（文件:行号，均为 2026-10-11 当日核实）；状态分五类——**确认缺口**（证据充分可排期）/ **待验证**（代码级确认、运行时症状未实测）/ **产品待裁决** / **已修复留档**（防重复排查）/ **工程风险**。
> **维护规约**：新发现引擎问题即时追加；解决后移入"已修复留档"节并注明修复轮次；本清单是专题唯一台账。

---

## A. 确认缺口（专题主体）

### A1 「发起人」审批人类型缺失（INITIATOR）

- **现象**：审批人类型仅五种——指定用户/指定角色/指定组织/上级主管/表单字段（`packages/studio/src/components/process/configs/UserTaskConfigForm.tsx:70-76`），**无"发起人"选项**；"发起人确认/申请人回签"类审批（如报销单提交后申请人签收确认）无法正确配置。
- **证据**：
  - 执行器只认三个配置：`data.assignee`（字面用户 ID）/`candidateGroups`/`approveUsers`，无动态发起人解析（`apps/gateway/src/process/node-executors/user-task.executor.ts:39-44`）；
  - G3 硬闸：single 模式要求 assignee 或 candidateGroups 必有其一（`workflow.validator.ts:289-297`）——变通写 inputsValues 变量绑定也会被拦；
  - 画布完整性预检同语义（`packages/shared/src/process/node-check.ts`，要求 assignee+approvalMode 双全）。
- **底座现状（有利条件）**：发起人 ID 已是顶层流程变量——`initialVariables = { ...triggerContext, ...inputs }`（`process-engine.ts:217-219`），记录触发写入 `triggeredByUser`=记录创建人（`trigger.service.ts:310`）；执行器有 `ctx.inputs['assignee']` 兜底通道（executor:40，引擎对每节点 `resolveInputs`，engine:440）。
- **影响**：飞书对齐差距（飞书审批有「发起人本人」节点）；审批回签类真实场景配不出来。
- **建议方案**（四件套，缺一不可）：① UI 类型下拉加 INITIATOR（免填人）；② 执行器解析 `triggerContext.triggeredByUser` 创建任务（取不到报清晰错误，见 A3）；③ G3 校验器放行 INITIATOR 形态；④ node-check.ts 同步 + 方言指南 + 单测（记录触发/手动启动/发起人缺失三路）+ TC 入库。
- **前置依赖**：A3。

### A2 ORG / SUPERVISOR / FORM_FIELD 三种审批人类型引擎端未接线

- **现象**：UI 提供三种动态审批人类型，但 gateway 全代码（非测试）`FORM_FIELD|SUPERVISOR` 解析逻辑 **0 命中**。
- **证据**：执行器无对应分支（`user-task.executor.ts` 全文只处理 assignee/candidateGroups/approveUsers）；配置表单把**组织编码/字段名**写入 `data.assignee`（`UserTaskConfigForm.tsx:254-260`），执行器将其当用户 ID 字面使用 → 创建出 assignee=非法 ID 的任务，流程挂起且无人可见。
- **状态**：**待验证**——代码级确认，运行时症状未实测（需构造用例实测三种类型各一次）。
- **对照**：抄送解析器 `resolveCcRecipients` 已实现 USER/ROLE/ORG 三态（`process-engine.ts:1566-1594`）——审批人侧未对齐。
- **建议**：专题内二选一——**实现解析**（ORG→OrgMember 展开、SUPERVISOR→组织主管、FORM_FIELD→变量求值，参照抄送解析器）或**从 UI 摘除**（删旧优先，零兼容原则）；倾向先实测症状再裁决。

### A3 MANUAL 启动不注入发起人

- **现象**：手动启动的实例 `triggerContext.triggeredByUser` 依赖调用方显式传入，不传即 null（`process.service.ts:288-293` `req.triggeredByUser ?? null`）。
- **证据**：
  - studio 手动启动只传 `{ processKey, variables: {} }`（`packages/studio/src/pages/ProcessList.tsx:106`）→ **UI 启动的实例无发起人**；
  - OpenAPI 同为调用方显式传（`open-api.controller.ts:130` `dto.triggeredByUser ?? null`，服务身份场景合理）。
- **影响**：①「我发起的」视图（`GET /instances/mine` 按 triggeredByUser 过滤）对 UI 手动启动实例不可见；②审批定论兜底通知发起人 `notifyInitiatorDefault`（engine:1603+）无收件人静默跳过；③A1 INITIATOR 节点在此路径无发起人可用。
- **建议**：服务端自动注入——`startInstance` 中 `triggeredByUser = req.triggeredByUser ?? callerUserId`（显式传入优先，内部调用兼容）；OpenAPI 保留显式语义。改动一处，三处受益。

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

---

## D. 工程风险（水平扩展前必查）

- **D1 多副本 Redis 锁未实测**：分布式锁已内置、降级为进程内互斥；多副本部署下锁语义需真实压测确认（AGENTS.md 风险项沿用）。
- **D2 BullMQ / Redis 连接数压测**：水平扩展前评估队列与连接水位。
- **D3 query 节点未接入发起人 ABAC 条件**：流程内 query 节点暂不能按发起人身份过滤（历史残留项）。

---

## E. 验证缺口

- **E1** GUI 二级交互走查（台账部分）——任务中心主体已清（2026-10-11 三页签/错误态/进度弹窗 GUI 走查通过）。
- **E2** A2 三种未接线类型的运行时症状实测（各构造一个用例）。

---

## F. 边界外相关（非引擎，一句话防丢）

- `explain()` 不过滤 rule.appId（权限调试工具缝隙，R5 遗留，单独修）；
- BUTTON_CLICK 枚举未接线（页面事件层，非引擎）；
- 台账 mapping 存量 schema 缺配置（已裁决暂不处理）。

---

## 专题建议排序

1. **A3**（一处改动，解锁 A1 且让「我发起的」覆盖 MANUAL 实例）；
2. **A1**（发起人类型四件套，真实场景+飞书对齐）；
3. **A2**（先实测症状 E2，再裁决实现或摘除）；
4. **B1/B2**（产品语义，用户裁决后动）；
5. **D 系列**（水平扩展前置条件，非当前阻塞）。
