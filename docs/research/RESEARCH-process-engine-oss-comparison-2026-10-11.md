# 流程引擎开源对比与 Temporal 借鉴裁决（2026-10-11）

> **状态**：已裁决（用户确认，2026-10-11 grilling 收官；本文档为对话结论的权威落档）。
> **关联**：`docs/knowledge-base/PROCESS-ENGINE-BACKLOG-2026-10-11.md`（专题台账，本文裁决在台账 H 节有执行摘要）/ `RESEARCH-appsmith-benchmark-platform-direction-2026-10-11.md`（BPMN 语义定案 S1-S5）/ ADR-0003 / ADR-0004。
> **方法**：主会话 WebSearch 直查（引擎协议与 2026 现状）+ 代码逐项核实（文件:行号当日有效）+ grilling 一轮五问（决策拆解→归因→复杂度预算→借鉴范围→轮子原则）。

---

## 1. 结论摘要（五条裁决）

| # | 裁决 | 内容 |
|---|---|---|
| R1 | **引擎路线维持自研，不翻案** | WorkflowSchema 保持唯一方言（与 2026-10-11 BPMN 定案一致）；开源引擎作"语义字典 + 代码参考"，不换内核 |
| R2 | **Temporal 不引入为运行组件** | 781 行手写异步协调代码 vs 新增 4 服务 + DB；设引入触发条件（§8.3），命中才重评 |
| R3 | **健壮性事故归因 = 契约漂移** | C1-C4/A2 全部根因是编辑器↔引擎↔校验器契约不一致，无一例是执行丢失/等待不可靠；对症药 = 契约一致性测试，非新基建 |
| R4 | **模式借鉴降级：3 做 3 不做** | 做三件十行级小事（§8.1）；砍掉三个框架（§8.2）——重放式回归框架 / saga 自动补偿 / 声明式重试 policy |
| R5 | **"不造轮子"选型原则（提案，待升格 ADR）** | 新内部基建优先成熟 OSS，自研仅限业务差异化本体；存量自研不批量翻案、逐个按 ROI 评估；"自研模块 × 可替换开源组件盘点"另立专题 |

---

## 2. 自研引擎现状快照（2026-10-11 当日核实）

### 2.1 节点执行器面（21 个，`apps/gateway/src/process/node-executor.registry.ts`）

start / end / trigger / assign / condition / parallel / inclusive / delay / object-operation / user-task / notification / http-request / sub-process / block / cloud-function / loop / break / continue / wait-for-condition / batch-operation。

### 2.2 已具备的语义

- 审批：会签/或签/依次聚合 + 加签 / 转办（`process.service.ts:789` delegateTask）/ 撤回 / 定向驳回（rejectToNodeId）/ 回写（writeback）/ 抄送三态（USER/ROLE/ORG，`process-engine.ts:1566-1594`）；
- 控制流：XOR/AND/OR 网关 + 严格汇聚 + 循环 + 子流程 + 等待条件（带 timeout 语义，`process-engine.ts:1050-1105`，24h 默认、timeout 出边否则 FAILED）；
- 版本：apiName+major 冻结快照（G6）；观测：traceId 全链路 + 效率分析 analytics；重试：BullMQ 作业级 `attempts: 3` 指数退避（`process-engine.ts:43`）。

### 2.3 缺口面（与 BPMN 流派对照，与 G 节/S5 不做清单口径一致）

定时边界事件（审批节点无超时/催办/升级）、错误边界事件、补偿、消息/信号事件、DMN、BPMN XML 互操作、任意跳转、票签、活动级历史查询（变量级"当时是什么"不可查）。

### 2.4 手写异步协调代码体量（Temporal 理论替换面的量化分子）

| 文件 | 行数 | 职责 |
|---|---|---|
| `node-executors/wait-for-condition.executor.ts` | 54 | 条件等待 + BullMQ delayed job 重调度 |
| `process/loop-utils.ts` | 100 | 循环调度 |
| `process/trigger.service.ts` | 342 | 定时/记录变更触发器调度（jobId=scheduled:<env>:<defId>） |
| `dataset/dataflow-engine.service.ts` | 285 | 数据集物化 + 10 分钟孤儿租约（:66-74） |
| **合计** | **781** | 另有小型 `common/redis/redis-lock.service.ts` |

**结论**：替换面不足 1000 行、均已在真实主线验证、无已知执行可靠性事故。

### 2.5 健壮性事故归因（R3 的证据）

| 事故 | 根因 | 类型 |
|---|---|---|
| C1 决策双层契约断裂（R5.5） | 决策变量仅存节点命名空间，指南边条件 `{"var":"decision"}` 恒 undefined | 契约漂移 |
| C2 条件分支路由断裂（零知识 R3） | edge label 契约缺失，降级"第一条出边"碰巧全绿 | 契约漂移 |
| C4 对象操作契约断裂（零知识 R2） | UI 写 fieldMapping、引擎读 inputsValues | 契约漂移 |
| A2 审批人三类型未接线（R2 实测） | UI 把组织编码/字段名写进 assignee 当用户 ID 字面消费 | UI 谎报契约 |

**无一例是"执行丢失 / 等待不可靠 / 进程崩溃丢状态"**——后者才是 Temporal 类 durable 基建治愈的问题域。

---

## 3. 三流派对比

### 3.1 BPMN 流派（Camunda / Flowable / Activiti / jBPM）

最直接参照系。BPMN 定案已判明：控制流内核达 BPMN 核心子集水位，缺口集中事件面与失败处理面（§2.3）。它们强在：事件语义完备（定时/消息/信号/错误边界/补偿）、DMN、历史查询深度（变量级历史表）、bpmn.io 建模生态。**我们强在它们没有的**：多租户/ABAC 行级权限引擎内建、对象操作走记录写内核（校验/公式/触发器全生效）、审批页绑定 amis 页面、AI/MCP 生成 + 人审治理闭环——"引擎+平台"的耦合价值。

### 3.2 Durable Execution 流派（Temporal / Cadence / Conductor OSS）

范式正交：代码即工作流、事件溯源重放，可靠性天花板高，但**无人工任务语义**（审批人/候选组/会签全自建）、要求开发写代码，与低代码"模型驱动+人审治理"冲突。我们的 wait-for-condition + BullMQ delayed job 已是简化版 durable 等待。

### 3.3 自动化/集成流派（n8n / Windmill / Node-RED）

触发器与连接器生态远强，但是"集成自动化工具"非"审批治理引擎"——无任务分发/审批语义/治理闸门。借鉴价值在连接器生态思路（已有 http-request + 云函数逃生舱），非引擎本体。

### 3.4 国产轻量（Warm-Flow / FlowLong）

JSON 模型 + 仿钉钉设计器，审批操作面广（任意跳转/转办/票签/加减签）。Warm-Flow 仅 7 张表，是**中文审批语义参考价值最高的免费代码库**（Apache 2.0）。

---

## 4. 可免费商用 + 可二开的开源引擎清单（2026-10 核实）

| 引擎 | 语言 | 协议 | 2026 现状 | 对本平台适配度 |
|---|---|---|---|---|
| **Flowable OSS** | Java | Apache 2.0 ✅ | V7 活跃，BPMN+CMMN+DMN，新增 agent engine | BPMN 语义最全的免费内核；需 Java sidecar，与单方言裁决冲突 |
| **Temporal** | Go 内核 + **TS SDK 一等公民** | MIT ✅✅ | 最活跃（v1.31.x，2026-05 仍发补丁） | 技术栈最亲和，范式正交（§5） |
| **Cadence**（Uber） | Go | Apache 2.0 ✅ | 活跃（Temporal 前身） | 同上 |
| **Conductor OSS** | Java | Apache 2.0 ✅ | Netflix 退出后社区接管 | JSON DSL 定义流程（理念相似），无 human task 层 |
| **Warm-Flow**（dromara） | Java | Apache 2.0 ✅ | 活跃，仅 7 张表 | 中文审批语义参考价值最高 |
| **Activiti** | Java | Apache 2.0 ✅ | 活跃度明显衰退 | 不建议新项目采用 |
| **jBPM / Kogito** | Java | Apache 2.0 ✅ | 红帽系（2026 活跃度未逐一核实） | Drools 生态重，适配成本高 |
| Camunda 7 CE | Java | Apache 2.0，**2025-10 已 EOL** | 终版 7.24（2025-10-14）；社区 fork：EximeeBPMS | 不推荐新项目依赖 |
| Camunda 8 (Zeebe) | Go/Java | ZCL→**生产自托管需商业授权** | 专有化 | 不满足免费商用 |
| n8n | TS | Sustainable Use（fair-code，非 OSI） | 内部用免费，嵌入分发需企业授权 | 参考连接器生态可以，当引擎不行 |
| Windmill | Rust/TS | **AGPLv3**（网络传染） | 内部用免费 | 二开后闭源分发触发传染 |
| FlowLong | Java | AGPL/商业双授权（以仓库为准） | 仿钉钉设计器+JSON 模型 | 同上传染风险 |
| bpmn-engine（npm） | TS | MIT | 轻量嵌入式 BPMN 解释库 | 无 human task/持久化/租户层，仅够当语义参考 |

**换内核成本账（为什么 R1 维持自研）**：换 Flowable = Java 微服务 + BPMN XML 翻译层（违反"WorkflowSchema 唯一方言、零翻译"）+ 任务中心/权限/多租户/审批页绑定/AI 生成工具面全部重做——引擎只解决约 20% 的问题，而那 20% 已经写完且经真实主线验证。

---

## 5. Temporal 深度解析

### 5.1 定位与心智模型

Temporal 不是"流程引擎"，是 **Durable Execution 运行时**：业务流程写成普通 TypeScript 函数，引擎保证函数无论进程崩溃/等待多久最终执行完毕且中间状态不丢。四个概念撑起全部：

1. **Workflow = 确定性函数**：函数内禁副作用（禁直接 IO/随机/时钟），副作用全部封装为 Activity——最硬的纪律；
2. **Event History**：每步决策（活动调度/结果/定时器/信号）追加为事件，唯一事实源；
3. **Replay**：Worker 崩溃后重放历史重建内存状态（毫秒级），代价是确定性约束（违反=重放分叉线上事故）；
4. **Worker = 自己的进程**：引擎 Server 不执行业务代码，`@temporalio/worker` 可嵌进 NestJS，Server/Worker 彻底解耦。

### 5.2 架构与部署

Server 四服务（Frontend gRPC 网关 / History 分 shard / Matching 任务队列 / Worker 内部服务）+ 存储后端（PG/MySQL/Cassandra/SQLite，可见性可接 ES）。自托管 = 4 服务 + 1 DB（或 Temporal Cloud SaaS）。当前版本线 v1.31.x。

### 5.3 与本平台机制对照

| 本平台 | Temporal 对应物 | 差异本质 |
|---|---|---|
| user-task 等待 | `condition()` / Signal 阻塞 | 引擎只管"等"，不管"谁来批" |
| completeTask | Signal（异步）/ Update（请求-响应式，2024 GA） | Update 带校验+同步返回 |
| 查询实例状态 | Query（从历史重放算出） | 免费获得 |
| 驳回/加签/转办/候选组/会签 | **没有**——任务分发/审批人解析/聚合全自建 | 官方文档确认：只保证"workflow 一直开着等"，不记录谁批的、不呈现待办 |
| wait-for-condition 节点 | `condition(() => ..., timeout)` | 原生一等公民 |
| 延时节点 | `sleep('3 days')` durable timer | 崩溃恢复照常走 |
| **实例冻结 schema（G6 major）** | **Workflow Pinning（Worker Versioning，2025-07 公测，v1.32 移除旧实现）** | **概念同构**：新实例新版本、跑着的实例钉死启动版 |
| 定时触发器 | Schedules（声明式 cron + overlap policy） | overlap 语义我们未核实是否有 |
| 跨服务调子流程 | Nexus（背压+版本协商） | 我们 sub-process 是库内调用 |
| —— | Task Queue Fairness（v1.29） | 我们多租户共队列，无公平性保证 |

### 5.4 审批场景的真实写法（官方 Approval Pattern）

```typescript
let decision: 'approved' | 'rejected' | undefined;
setHandler(approveSignal, () => { decision = 'approved'; });
setHandler(rejectSignal,  () => { decision = 'rejected'; });
const approved = await condition(() => decision !== undefined, '48h');
if (!approved) await activities.escalateToManager(req); // 升级/催办全是自己写的 Activity
```

简洁是真的（五行）；但"候选组谁能看到待办、会签三人全批才算过、驳回回哪个节点"五行里完全没有——本平台的任务中心/assignee 解析/聚合语义/驳回路由在 Temporal 世界是"自己用 Signal 堆的应用层"。

### 5.5 AI 编排（对 C7/C8 候选的参照价值）

官方 2025-08 起押注"agent 编排三支柱 = durable + 可见 + human-in-the-loop"：agent 每步工具调用是 Activity（可重试/超时/隔离），人审是 Signal，长等待是 durable timer。社区共识：agent 执行需"活过崩溃、跨小时等待、失败重试"时显著优于纯内存编排；反方（LangChain）认为 agent 编排需图抽象，Temporal 只是耐用层。**启示**：若立项 C7 dry-run 仿真 / C8 AI 节点，其 human-in-the-loop + durable agent 模式是最佳设计参照——即使不引入 Temporal。

### 5.6 运维与心智成本账（R2 的依据）

① 多一套有状态基建（4 服务+DB，比复用 Redis 的 BullMQ 重一个数量级）；② 确定性纪律（团队每人新增心智负担）；③ 事件历史膨胀（高频小步骤）；④ SDK 版本纪律（旧 Worker Versioning 刚被废弃换新，仍在收敛）；⑤ 无低代码入口（一切皆代码，与"一切皆页面"产品形态正交）。

---

## 6. 整平台借鉴分析（原始清单 → §8 降级裁决）

原始提出的借鉴面（完整性留档，执行以 §8 为准）：

- A1 重放式回归测试 + 节点级决策事件日志；
- A2 saga 补偿模式并入 S2；
- A3 重试策略声明化进 shared；
- A4 批量操作心跳分片断点续跑（batch executor 已核实为整批一交无断点，:65-113）；
- A5 定时触发器 overlap policy（触发器服务 grep 无重叠保护，**待核实确认后补**）；
- A6 多租户队列公平性（noisy neighbor）；
- A7 bull-board 队列观测（dev QoL）；
- B 若引入 Temporal 的候选位置：AI 交付流水线底座（最真实）/ 发布·导入导出·批量批准 step pipeline / Nexus 借鉴微服务拆分；
- C 已暗合印证：数据集孤儿租约 ↔ activity lease、实例冻结 schema ↔ Pinning、执行器纯粹性 ↔ 确定性内核。

---

## 7. 裁决过程（grilling 一轮，2026-10-11）

用户准绳：**平台代码要简单、稳定、可扩展，不造轮子，用好业界开源，减少自研不健壮 bug**。五问：Q1 决策拆解（引入组件 vs 借模式 vs 路线翻案，C 已被 BPMN 定案覆盖不重开）→ Q2 健壮性归因（契约漂移 vs 缺 durable，证据 §2.5）→ Q3 复杂度预算（781 行 vs 4 服务+DB）→ Q4 借鉴清单范围 → Q5 轮子原则成文。用户表态"明白了，不需要再讨论"，接受结论框架；随后对 Q4 三模式追加复杂度质询，催生 §8 降级裁决。

---

## 8. 模式借鉴降级裁决（R4，本轮核心产出）

**原则：每项必须是"改一个文件级别"的事，零新基建、零新抽象，且对应一个已发生的事故（不是猜想收益）。**

### 8.1 采纳（3 项）

| # | 项 | 体量 | 依据 | 排期 |
|---|---|---|---|---|
| ✅1 | **边走向+条件求值落 NodeExecution.output** | 十几行，零迁移（NodeExecution 表已有 input/output/retries 字段，schema.prisma:616-638） | 引擎拿到 nextNodeIds 直接推进令牌未持久化（process-engine.ts:378-380）；C1 类"静默终结"事故无法事后回答"为什么走这条边"；condition.executor 的"无匹配降级第一条出边"（C2 教训，condition.executor.ts 尾部）至今无持久化痕迹。TraceViewer 进度弹窗已有消费面 | 并入 S1/S2 轮顺手做 |
| ✅2 | **事故 schema fixture 契约测试** | 每事故约半天，纯 Vitest | = 方向探讨已列的"四层契约一致性测试"候选（UI↔G3↔node-check↔执行器），把 C1/C2/C4 事故 schema 固化为 fixture 断言全链路语义（如"decision=APPROVED 走 approve 边"）——不发明新概念，按原候选排期 | 按原排期 |
| ✅3 | **执行器 retryable 标志 + attempts 分类** | 几行 | 全平台唯一重试消费点 `attempts: 3` 一刀切（process-engine.ts:43），确定性失败（参数/校验）也三连重试；HTTP 执行器无自带重试（仅 AbortSignal.timeout）。NodeExecution.retries 现成承接 | 随手，或并入契约轮 |

### 8.2 不做（3 项，防重复提案）

| # | 项 | 理由 |
|---|---|---|
| ❌1 | 重放式回归测试框架 | 引擎非确定性重放架构（每节点有副作用），真做需全套测试替身 mock RecordService/通知/BullMQ——复杂度高且收益被 ✅2 契约 fixture 覆盖 |
| ❌2 | saga 自动补偿 | 每节点逆操作（create→删？update→需写前镜像）+ 补偿幂等 + 不可逆动作排除 = 分布式事务级复杂度；主线"决策→回写"形态中途失败留 FAILED+审计可接受。**S2 维持轻量版本义：错误出口路由**（失败节点路由 error 标签出边，补偿/通知/回写由搭建者显式画节点），自动补偿不做 |
| ❌3 | 声明式重试 policy 框架 | 单消费点 YAGNI；✅3 最小版已覆盖真实痛点，等出现第二个差异化消费点再说 |

### 8.3 Temporal 引入触发条件（命中任一才重评，白纸黑字防"原则性引入"）

1. wait-for-condition 轮询撑不住真实规模；
2. AI 交付流水线常态化卡死无人管；
3. 跨天跨人工闸门的编排成为产品功能。

### 8.4 对既有裁决的影响核对（无推翻，两处印证）

- **S1（审批超时边界）**：设计参照 Temporal `condition+timeout+escalate` 范式（§5.4），不改变 S1 立项范围；
- **G6（major 冻结）**：Temporal Workflow Pinning 与其概念同构，独立收敛到同一解法=印证；扩展 major 策略时参考其 pinned/auto-upgrade 三态与 gradual rollout；
- **S5 不做清单**：不受影响；R1 路线与 BPMN 定案一致，不翻案。

---

## 9. 来源

- [Camunda 7→8 迁移公告（Camunda 7 CE EOL 2025-10，终版 7.24）](https://camunda.com) / [Camunda 授权文档](https://docs.camunda.io)
- [Flowable 官网](https://www.flowable.com) / [Flowable GitHub（Apache 2.0）](https://github.com/flowable/flowable-engine)
- [Temporal Releases（v1.31.x）](https://github.com/temporalio/temporal/releases) / [Worker Versioning 文档](https://docs.temporal.io/production-deployment/worker-deployments/worker-versioning) / [Pin Workflows 博客](https://temporal.io) / [Approval Pattern 官方文档](https://docs.temporal.io) / [Human-in-the-Loop 教程](https://learn.temporal.io)
- [LangGraph vs Temporal 对比](https://www.langchain.com) / [n8n/Windmill 协议对比](https://stacksandflows.com) / [n8n 论坛](https://community.n8n.io)
- [Warm-Flow（dromara，Apache 2.0）](https://gitee.com/dromara/warm-flow) / [FlowLong](https://gitee.com/flowlong)
- 代码证据：文中 `文件:行号` 均为 2026-10-11 工作区实测
