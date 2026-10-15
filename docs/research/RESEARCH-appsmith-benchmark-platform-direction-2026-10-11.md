# Appsmith 对标与平台方向审视（含流程引擎 BPMN 语义子集裁决）

> 日期：2026-10-11 ｜ 形态：方向探讨收官落档（grilling 三轮，Q1–Q11 + S1–S5 共 16 项裁决经用户全部确认）
> 性质：**研究方向审视，不含排期**——采纳执行后续单独排期；流程引擎相关执行归《流程引擎问题专题》（`docs/knowledge-base/PROCESS-ENGINE-BACKLOG-2026-10-11.md` G 节指针）。
> 准绳（Q2 裁决）：判断"值得借鉴"的首要标准 = 是否让 **AI 生成 → 人审 → 托管运行** 的闭环更紧（ADR-0004 主线）；次要 = 开发者兜底体验；再次 = 运行时业务体验与平台工程。
> 证据口径：Web 来源标注 URL（检索日 2026-10-11）；平台自身事实引用仓库文档与代码 `file:line`（同日核实）；未核实项显式标注（见 §8）。

---

## 0. 裁决总表

| # | 议题 | 裁决 |
|---|---|---|
| Q1 | 产出形态 | 落档本研究文档（Appsmith 靶心、飞书+我们为坐标、同类全景背景、正反两面）；采纳裁决后续单独排期，不插队 AI 主线与流程引擎专题 |
| Q2 | 筛选准绳 | 首要=AI 生成→人审→托管运行闭环；次要=开发者兜底；再次=运行时体验/平台工程 |
| Q3 | 存量数据对接 | **进**产品问题域，列长期 roadmap（本轮不立项） |
| Q4 | 深挖范围 | 五域全深挖，定位=审视我们产品设计方向对标业界 |
| Q5 | 页内数据流 | G3 扩展"页面依赖图静态校验"（引用闭合+循环检测）；**不**引入运行时 ViewModel 状态树 |
| Q6 | JS 逃生舱 | 页内 JS 不做；逻辑逃生舱=云函数+自定义组件/节点（ADR-0003 既定）；**渲染级自定义组件按沙箱 iframe 桥接（路径 C）单选立项**（2026-10-11 侧聊裁决，见 §2.6） |
| Q7 | Git 哲学 | 平台内快照保持 SSOT；"只读 mirror/导出到 git"列长期项；git-as-source 双向不做 |
| Q8 | 主题/布局 | 维持 amis 令牌现状；应用级主题令牌仅远期备选；不投布局引擎 |
| Q9 | BPMN 覆盖方式 | **语义子集对齐**为硬目标；WorkflowSchema 保持唯一方言；XML 互操作与建模符号对齐不做（ADR 待立） |
| Q10 | AI 编排重点 | ①Agent 编排闭环补强（含 dry-run 仿真 API）②AI 节点（agent 作为受治理的流程执行者）；③自然语言 explain 随治理轮顺带；④过程挖掘不做 |
| Q11 | 归属衔接 | BPMN/AI 编排并入本文档；执行走流程引擎专题；重大决策后续单独立 ADR |
| S1 | 用户任务超时边界 | **做**（dueDate 消费 + BullMQ 到点动作：催办/自动通过/自动驳回/转交升级）；排序 A2 之后 |
| S2 | 节点失败处理策略 | **做轻量版**（节点级：终止/跳转/忽略留痕）；不做 BPMN 全量 error/compensation/transaction |
| S3 | 消息事件/事件型网关 | 缓；wait_for_condition + 外部写变量变通已可用，观察项 |
| S4 | terminate 终止节点 | 不立节点类型（cancelProcess 已覆盖），有真实场景再议 |
| S5 | 明确不做清单 | DMN、choreography/协作图、事件子流程、ad-hoc 子流程、复杂网关、receive/manual task、通用多实例 |

---

## 1. 三方根本分野（借鉴的滤网）

**Appsmith 的核心假设是"数据已经在你自己的 PG/MySQL/REST API 里"——平台本体是界面 + 胶水逻辑 + 连接器，没有数据建模层；我们与飞书 aPaaS 是带建模层的 aPaaS——对象/权限/流程是本体，界面是长出来的。** 这道滤网决定借鉴价值：凡依赖"数据在外部"的设计（query-first 心智、连接器架构）对我们打折；凡关于"表达层与逻辑层如何组织"的设计（绑定架构、逃生舱、版本控制）与数据放在哪无关，全部有效。

| 维度 | Appsmith | 飞书 aPaaS | 我们 |
|---|---|---|---|
| 元中心位 | 无建模层，外挂数据源 | 内建对象建模 + 连接器/外部数据源 | 内建对象建模（JSONB 宽表） |
| 页面表达 | 组件树 + `{{}}` 绑定 | 组件 + ViewModel 表达式绑定（`{ __bind: 'vm.xxx' }`） | amis JSON 单方言（ADR-0003） |
| 页内逻辑 | JS Object 一等公民 | 页面级状态/代码 + JS 扩展 | 事件配置 + 表达式 + 平台级云函数 |
| 版本治理 | git-as-source（branch=应用副本） | 草稿→提交→发布三级 + 不可变快照 + 回滚 | 资源级版本快照链 + AI 人审闸门 |
| 数据边界 | 连接器（40+ 数据源插件口径，未核数） | 官方连接器 36+ / 直连 PG·MySQL·Oracle·SQLServer·Mongo + OQL | 平台内建模自闭环 + 开放 API（存量对接未立项） |
| AI 形态 | 内置 AI 功能（**已于 2026-09-30 全量 EOL**，见 §4.3） | 编辑器内嵌 AI 助手/生成 + 开放能力 MCP | 外部 agent 经 MCP + 治理闸门（ADR-0004） |

（飞书列来源：`docs/research/RESEARCH-feishu-apaas-full.md` §C.3–C.4/§E/§F、`RESEARCH-feishu-apaas-app-lifecycle.md` §2–§4、`RESEARCH-feishu-apaas-live-benchmark-2026-09-27.md` §1；Appsmith 列来源见 §7。）

---

## 2. 五域深挖结论与裁决

### 2.1 页内响应式数据流（Q5）——最值得借的一项

- **业界事实**：Appsmith 把页面内 UI↔查询↔JS 逻辑表达成 `{{}}` 绑定的依赖 DAG——评估器维护实体属性间的 DependencyMap，绑定变化时拓扑排序重算受影响节点，循环依赖显式报错（Appsmith 工程博客 "Evaluating JS in the Browser for a Low Code Product"，https://www.appsmith.com/blog/evaluating-js-in-the-browser-for-a-low-code-product ；官方 troubleshooting 文档）。飞书 aPaaS 同样把页内数据流当一等公民：ViewModel 页面级状态树 + 表达式绑定 + JS 页面级扩展（`RESEARCH-feishu-apaas-full.md` §C.3–C.4）。
- **对照**：我们的 amis 页面联动靠显式事件与表达式配置，"数据流"无一等结构；G3 目前只做结构白名单校验，**没有跨组件引用闭合/循环检测**——AI 生成的复杂页面里引用了不存在变量的错误只能靠运行时暴露。
- **裁决**：借"依赖图"的**静态校验思想，不借运行时机制**——G3 扩展"页面依赖图校验"（表达式/事件引用闭合 + 循环检测），运行时仍由 amis 求值。引入 ViewModel 状态树是新方言面，违反单方言最小化；且在 amis（维护放缓、锁版本+fork 预案）上叠页面级响应式 store 属 fork 级深水区。反向借鉴 Appsmith 的教训：它的循环依赖只在运行时报错，我们把同类问题前置到生成期（AI 提交即拦截）。

### 2.2 JS 逃生舱（Q6）——不借

- **业界事实**：Appsmith JS Object 直接写在 builder 内、async 函数可被任意组件绑定调用，是页内逻辑一等公民。
- **对照**：我们 ADR-0003 决策 1 已定代码逃生舱=自定义组件/节点/云函数；云函数有执行观测/审计/并发预算（`CLOUD_FUNCTION_TIMEOUT_MS` 等）。页内 JS 会制造治理盲区（人审从审 schema 变成审代码）与观测盲区，直接削弱"AI 生成→人审→托管运行"闭环。
- **裁决**：页内 JS 不做；逻辑逃生舱维持云函数层。

### 2.3 Git 版本控制哲学（Q7）——借"可读性"，不借"主权"

- **业界事实**：Appsmith 在 builder 内 commit/branch/diff，branch=应用完整副本，导入应用=从 git 重建（官方 docs 结构）；代价有实证——自托管 git 操作超时是真实抱怨（GitHub issue #35644，2024-08），"Git Native" 重构长期进行中（issue #36957 追踪）。
- **对照**：我们的 ResourceVersion 平台内快照链 + 人审 diff 是治理主权哲学；飞书同为平台内三级版本+不可变快照（生命周期调研 §2–§3）。
- **裁决**：快照保持 SSOT；长期项加"只读 mirror/导出到 git"（满足企业资产托管与开发者 diff 阅读习惯）；git-as-source 双向不做——AI agent 调平台 API 比 git 顺手，人读 git diff 比平台快照顺手，mirror 让两者各得其所。

### 2.4 外部数据源/存量数据对接（Q3）——进问题域，缓执行

- **关键澄清**：我们当年移出对标范围的是"飞书**官方连接器市场**"（生态特有项，ADR-0002 决策 4）；但飞书 aPaaS 本体就有**流程节点直连 PostgreSQL/MySQL/Oracle/SQL Server/MongoDB + OQL SQL 查询**、自建连接器+本地代理进内网（`RESEARCH-feishu-apaas-full.md` §F、生命周期调研 §4.1）——直连存量 DB 属 aPaaS 本体能力，**不在豁免范围内**。
- **裁决**：存量数据对接进产品问题域，列长期 roadmap（本轮不立项）。形态默认：**读集成优先**（连接器/只读数据源 → 数据流与页面取数）→ 双向写 → 流程节点直连外部 DB（飞书 OQL 式）最后。定位依据："企业内部真实使用"必然撞存量数据（天花板问题）；AI 生成要产出有用的应用也需要读得到企业真实数据。

### 2.5 主题/布局（Q8）——维持现状

- **业界事实**：Appsmith 的 auto-layout 模式（2023-05 随 v1.9.20 引入）已转维护模式，机制被吸收进新统一 builder（社区博客 "Shifting Auto-Layout to Maintenance Mode"，https://community.appsmith.com/content/blog/shifting-auto-layout-maintenance-mode ）——维护两套布局范式不可持续。
- **裁决**：反面教训与 amis 单方言决策同构；主题维持 amis 令牌层，应用级主题令牌仅远期备选，不投布局引擎。

### 2.6 渲染级自定义组件（Q6 侧聊裁决补录）——沙箱 iframe 桥接单选立项

- **需求**：页面区块级自定义渲染——用户/AI 粘贴 js+html+css 渲染到页面特定区块。与 Q6 不冲突：UI 渲染自定义属 ADR-0003"代码逃生舱=自定义组件"一席，Q6 拦的是**业务逻辑**进页面。
- **三路径裁决（2026-10-11 侧聊，用户拍板 C 单选）**：
  - A = amis `custom` 组件（已核实 G3 白名单放行：`amis-type-registry.ts:176`、`amis-page.validator.ts:45`，今天可用；但脚本跑主上下文**无隔离**）——不采纳；
  - B = registerRenderer 注册制自定义渲染器（工程正道，但加组件须发版 runtime-ui，且 AmisRenderer 现为裸 render() 无注册点）——不采纳；
  - **C = 沙箱 iframe 桥接（采纳，单选立项）**——`<iframe sandbox="allow-scripts" srcdoc>` + postMessage 双向桥（初始化注入 data / iframe 回写 onChange、上报错误、自适应高度）；Retool Custom Widget 与 Appsmith Custom Widget 为同款业界收敛形态。
- **裁决理由**："任意脚本"场景下**隔离是硬约束**；A 败在无隔离，B 败在即用性（发版门槛）。
- **实现要点（立项备忘）**：新增组件暂名 `sandbox_block`，schema 携带 `{html, css, js}`；G3 追加类型与脚本字段校验；桥只暴露数据读写、不暴露平台写 API 与凭证；iframe 不给 allow-same-origin；**脚本随页面 schema 走草稿→人审→发布**（AI 生成脚本同样过 submit_draft 闸门，治理不变量保持）。
- **待核实（实现前）**：studio amis-editor 物料暴露形态、网关 CSP 头配置。

---

## 3. 流程引擎 × BPMN 2.0 × AI 编排

### 3.1 定位：编排三阵营中的我们

| 阵营 | 代表 | 定位特征 |
|---|---|---|
| ① BPMN 标准阵营 | Camunda 8 / Flowable | 可视化标准建模、面向跨职能团队；**正全面转向 "agentic orchestration"**（官网定位原话：running AI agents, people, and systems as one governed process），产品有 AI Agent 子流程连接器（BPMN ad-hoc 子流程承载 agent 行为）与 BPMN Copilot（自然语言→可运行蓝图，8.8+）（docs.camunda.io、camunda.com） |
| ② code-first 持久执行 | Temporal / Inngest | 代码即流程、crash-proof；社区定性"BPMN 工具不是为讨厌 XML 和配置式编程的专业开发者准备的"（community.temporal.io，2024-01）；durable execution 已成独立品类（kai-waehner.de，2025-06） |
| ③ JSON DSL 云原生 | AWS Step Functions ASL / CNCF Serverless Workflow | 供应商中立声明式 JSON；Serverless Workflow v1.0.0 于 2025-01-27 发布，KIE/Kogito 等实现（open-workflow-specification.org） |

**我们的位置**：引擎场景（审批、人、可审计）属①的主场，但载体是③形态的 WorkflowSchema JSON，且叠加了①③都没有的**审批语义层**——会签/或签/依次/加签/转办/任意驳回/撤回/回写，这层 BPMN 核心规范里没有（BPMN 只有通用多实例），是钉钉/飞书十几年实践沉淀的方言。**"覆盖 BPMN"对我们是超集对齐，不是向标准靠拢。** JSON 方言 + G3 校验反馈闭环在 AI 时代是结构性优势："LLM 直接生成 BPMN XML 不可靠"已有学术与实践双重证据（BPMN Assistant, arXiv 2026-01；Camunda 官方论坛 2025-04 "输出的 XML 看着接近合法 BPMN，但常缺关键语义信息"；SocietyByte 2026-02）；也有反面观点认为 ISO 标准 XML 对 agent 可读（processcamp.io）——综合看业界解法收敛于"自然语言交互层/多阶段管线 + 语义校验"，与我们的形态同构。

### 3.2 BPMN 核心子集对照矩阵（引擎盘点 2026-10-11）

> 依据当日代码级盘点：`packages/shared/src/process/index.ts`（20 节点类型）、`apps/gateway/src/process/node-executor.registry.ts`（20 执行器+block 容器）、`process-engine.ts`（token 流内核）。

| BPMN 2.0 元素（审批流相关） | 我们现状 | 证据 |
|---|---|---|
| 排他网关 XOR | ✓ 条件分支+else+防卡死降级 | `condition.executor.ts:25-60` |
| 并行 AND + 严格汇聚 | ✓ 支配树分析+令牌计数 join | `parallel.executor.ts`、`process-engine.ts:1223-1340` |
| 包容网关 OR + OR-join | ✓ | `inclusive.executor.ts:20-49` |
| 默认流 | ✓ condition 空=else | `shared/src/process/index.ts:264-281` |
| 循环 for-each + break/continue | ✓ 含单实例 1000 次执行预算熔断 | `loop/break/continue.executor.ts`、`process-engine.ts:328-338` |
| 子流程/调用活动 | ✓ 同步/异步、父实例恢复、子失败连带 | `sub-process.executor.ts:23-78` |
| 审批聚合+加签/转办/撤回 | ✓ 4 模式（single/countersign/or_sign/sequential）+加签（依次/并行）+转办+撤回，超出 BPMN 通用多实例 | `user-task.executor.ts`、`process.service.ts:764-916` |
| 定时启动 / 中间定时 / 条件等待 | ✓ cron SCHEDULED / delay 节点 / wait_for_condition+超时出边 | `trigger.service.ts:177-209`、`delay.executor.ts`、`wait-for-condition.executor.ts` |
| **任务超时边界事件** | **✗ dueDate 配置存在但引擎未消费** | `process.service.ts:620`、QA 矩阵 2 不对齐疑点 |
| 消息事件 / 事件型网关 | ✗ 无消息通道 | — |
| 错误事件/补偿/事务 | ✗ 节点失败=实例 FAILED（子流程连带父） | `process-engine.ts:509-519` |
| DMN 业务规则任务 | ✗（条件+JsonLogic 覆盖简单场景） | — |
| 事件子流程/ad-hoc/复杂网关/choreography | ✗ | — |

**结论：控制流内核已达 BPMN 核心子集水位（三种网关+严格汇聚/循环/调用活动/默认流全齐），缺口集中在事件面与失败处理面。**

### 3.3 子集裁剪裁决（S1–S5）

- **S1 用户任务超时边界（做，排序 A2 之后）**：消费 dueDate + BullMQ delayed job 到点触发可配置动作（催办通知/自动通过/自动驳回/转交升级）。一笔投资清三笔账：dueDate 未消费（QA 不对齐疑点）、"审批超时催办"清单外缺口（2026-10-11 流程引擎方向探讨标记）、飞书"审批超时自动处理"对标项。
- **S2 节点失败处理策略（做轻量版）**：节点级失败策略——终止（现状）/跳转到指定节点/忽略并留痕，失败进观测。不做 BPMN 全量 error/escalation/compensation/transaction（审批场景用不上、投资巨大）。
- **S3 消息事件/事件型网关（缓）**："等外部回执"先用 wait_for_condition + 外部写变量变通（已可用）；观察项。
- **S4 terminate 终止节点（不立）**：实例级 cancelProcess（`process-engine.ts:910-931`）已覆盖语义。
- **S5 明确不做（落 ADR 待立）**：DMN、choreography/协作图、事件子流程、ad-hoc 子流程、复杂网关、receive/manual task、通用多实例（审批四模式已覆盖审批场景）。叙事口径随之精确为"覆盖 BPMN 2.0 **审批流执行语义子集**"（S5 清单即措辞边界）。翻案触发条件（探讨中给定）：DMN——出现 ≥3 维规则矩阵或 ≥2 流程复用同一规则集时做 DMN-lite 而非 OMG 全标准；事件子流程——S2 若被推翻则其优先级上调（S2 覆盖其约 80% 审批诉求）；ad-hoc——唯一观察哨为"AI 自主编排"形态出现（Camunda 以 ad-hoc 子流程承载 AI Agent 执行，届时以 JSON DSL 形态回归）；复杂网关——join 基础设施（令牌计数+支配树）已就位，补齐成本最低。

### 3.4 AI 编排落地形态（Q10）

- **①Agent 编排闭环补强**：生成→G3 校验→**dry-run 仿真 API**（token 流内核加 side-effect 开关：object_operation/notification/http/user-task 建任务等副作用以模拟态执行，用真实记录数据预演审批路径）→发布，全程 API 化，agent 与人共用。子集语义稳定（§3.3）是仿真器有清晰边界的前提。
- **②AI 节点**：新增节点类型，AI agent 作为流程执行者（预审、自动处理标准件），人审兜底闸门照旧——BPMN 无此语义，是我们的超集优势；与 Camunda "AI Agent 子流程"（把 agent 纳入受治理流程）同向，但我们在 JSON 方言上实现摩擦更小。
- **③自然语言 explain/异常诊断**：随治理轮顺带，不单独立项。
- **④过程挖掘**：不做。

### 3.5 与流程引擎问题专题的衔接（Q11）

- 数据层缺口（A3→A1→A2）仍是专题最高优先；S1/S2 为新增**引擎语义能力面**工作项，排序 A2 之后（专题台账 G 节已登记指针）。
- Q9/S5 的架构性裁决（语义子集对齐、不做清单、唯一方言承诺）后续单独立 ADR，本文档为裁决记录源。

---

## 4. 全景扫描（概览级）

### 4.1 Retool

全面转向 agentic：官方指南"构建你的第一个 AI agent"（retool.com/products/agents），押注 Gartner 预测（2026 年 40% 企业应用将带任务型 agent，2025 年 <5%；二手转引 Insentra/Raysolute）。对我们的含义：商业标杆同样在"治理 + agent 参与者"位置上加码，验证主轴判断。

### 4.2 生成式全码 wave（v0 / Lovable / bolt.new）

证明了"自然语言→应用"的直接可行性，但失败面被总结为四域：**安全、业务逻辑、运维、团队**（imaddhin.com "AI app builder limits: when Bolt, Lovable and v0 stop being enough"，二手概览级来源）；v0 无后端/数据库/认证。对我们的含义：低代码护城河从"降低开发门槛"迁移到**治理、权限、审计、集成、托管运行时**——AI 越能写代码，"谁审、错了谁负责、权限谁管"越值钱。我们的 AI-first + 全环境人审 + 版本谱系恰好站在迁移后的位置。

### 4.3 Appsmith 内置 AI 的弃用（活体反面案例）

v2.3（2025-08-13）起不再允许新增 Appsmith AI 数据源连接或查询，现有连接 2026-09-30 全停；v2.5.0 release notes 原话 "Appsmith AI reached end of life on September 30, 2026"，官方建议迁移到 OpenAI/Anthropic/Google 直连提供商数据源（github.com/appsmithorg/appsmith/releases，原文已核）。

**教训**：平台内置 AI 功能是速朽资产（模型迭代快、维护成本高、绑定特定提供商），AI 能力应长在外部 agent + 协议（MCP）上，平台只提供 Schema 接口与治理闸门——**反向印证 ADR-0004 决策 2**。

### 4.4 CNCF Serverless Workflow

v1.0.0（2025-01-27，open-workflow-specification.org），声明式 JSON DSL，KIE/Kogito、Apache EventMesh 等实现；CNCF Serverless 工作组项目（是否正式 sandbox/incubating 未核实）。对我们的含义：JSON DSL 编排有标准化先例，WorkflowSchema 不孤立；但该规范面向系统集成编排，无审批语义层，无直接采用价值。

### 4.5 未深查项（后续专题轮补充）

Budibase/ToolJet 健康度、NocoBase 插件架构细节、Mendix Maia、Power Platform agents、NocoBase 是否提供 MCP server、Appsmith 社区健康度与开源协议现状、AWS ASL 细节。本轮 searches 曾三次被上游风控拦截（已改主会话直查），深查成本高，不影响本轮任何裁决。

---

## 5. 候选清单（采纳待排期）

| # | 候选项 | 来源域 | 裁决依据 | 执行轨 | 建议优先级 |
|---|---|---|---|---|---|
| C1 | G3 页面依赖图静态校验（引用闭合+循环检测） | §2.1 | Q5 | 平台轨（shared 校验器+studio） | **高**（建议随 AI 主线下轮） |
| C2 | 平台快照只读 mirror/导出到 git | §2.3 | Q7 | 平台轨 | 中（远期） |
| C3 | 存量数据读集成（连接器/只读数据源） | §2.4 | Q3 | 平台轨 | 中（长期 roadmap） |
| C4 | 应用级主题令牌 | §2.5 | Q8 | 平台轨 | 低（远期备选） |
| C5 | 用户任务超时边界（=S1） | §3.3 | S1 | 流程引擎专题 | **高**（排序 A2 之后） |
| C6 | 节点失败处理策略轻量版（=S2） | §3.3 | S2 | 流程引擎专题 | 中（可与 C5 同批） |
| C7 | 流程 dry-run 仿真 API（=Q10①） | §3.4 | Q10 | 流程引擎专题（仿真器）+ AI 主线（agent 消费） | **高** |
| C8 | AI 节点（=Q10②） | §3.4 | Q10 | 流程引擎专题 | 中高（面向未来招牌） |
| C9 | 渲染级自定义组件 `sandbox_block`（沙箱 iframe 桥接，路径 C 单选；A/B 不采纳） | §2.6 | Q6 侧聊裁决 | 平台轨（runtime-ui+studio+G3） | **已立项，待排期** |

---

## 6. 反面教训清单（防重蹈）

1. **Appsmith AI 弃用**：平台内置 AI 功能是速朽资产 → AI 能力长在外部 agent + MCP 协议上，平台只出 Schema 接口与治理闸门（ADR-0004 既定，本轮获业界实证）。
2. **Appsmith 双布局范式收敛**：维护两套 UI 范式不可持续 → 单方言决策正确，警惕任何"第二方言"提案。
3. **Appsmith git-as-source 运维成本**（issue #35644 等）：配置入库哲学的代价有实证 → 快照 SSOT + 只读 mirror 是更稳的组合。
4. **LLM 直出 BPMN XML 不可靠**（arXiv 2026-01 / Camunda 论坛 2025-04）：冗长 XML+扩展命名空间对生成不友好 → WorkflowSchema JSON + G3 校验闭环是正确形态，勿因"标准"二字动摇。
5. **Appsmith 循环依赖仅运行时报错**：静态可校验的结构必须前置到生成期拦截 → C1 的设计出发点。

---

## 7. 证据来源清单

**Web（检索日 2026-10-11）**：
- Appsmith 依赖图/评估器：https://www.appsmith.com/blog/evaluating-js-in-the-browser-for-a-low-code-product ；docs.appsmith.com troubleshooting（dependency map/evaluation order/cyclic dependency）
- Appsmith AI 弃用原文：https://github.com/appsmithorg/appsmith/releases（v2.3 / v2.5.0 条目，原文已核）
- Appsmith git：docs.appsmith.com version-control-with-git 文档结构；issue #35644（git 操作超时）；issue #36957（Git Native 追踪）
- Appsmith auto-layout：https://community.appsmith.com/content/blog/shifting-auto-layout-maintenance-mode ；v1.9.20 引入公告 https://www.appsmith.com/blog/introducing-new-mobile-responsiveness-feature
- Retool agents：https://retool.com/products/agents
- Camunda：https://docs.camunda.io （AI Agent Sub-process connector）；camunda.com 官网定位；BPMN Copilot（8.8+）
- Temporal：https://temporal.io durable execution 指南；https://community.temporal.io 定性讨论（2024-01）；https://www.kai-waehner.de（2025-06 品类分析）
- BPMN×LLM：https://arxiv.org/html （BPMN Assistant, 2026-01）；https://forum.camunda.io （2025-04）；https://www.societybyte.swiss/2026%2F02%2F12 ；反面观点 https://processcamp.io/guides/bpmn-for-ai-agents
- CNCF Serverless Workflow：https://open-workflow-specification.org （v1.0.0, 2025-01-27）
- 生成式全码失败面：imaddhin.com（二手概览级，多家对比文交叉印证）

**平台自身（同日核实）**：
- `packages/shared/src/process/index.ts`、`node-check.ts`；`apps/gateway/src/process/process-engine.ts` 及 node-executors/*（引擎盘点 §3.2 表）
- `docs/research/RESEARCH-feishu-apaas-full.md` §C/§E/§F；`RESEARCH-feishu-apaas-app-lifecycle.md` §2–§5；`RESEARCH-feishu-apaas-live-benchmark-2026-09-27.md`
- `docs/adr/0002/0003/0004`；`docs/design/DESIGN-refactor-blueprint-2026-09-30.md`
- `docs/knowledge-base/PROCESS-ENGINE-BACKLOG-2026-10-11.md`（A1/A2/A3/B1/B2/C/D）

## 8. 未验证与待补清单

- Appsmith 数据源插件"40+"为记忆口径未核实，正文已降级表述；
- Retool/Gartner 40% 数据为二手转引；
- 生成式全码失败面四域来自二手对比文，非一手实测；
- CNCF Serverless Workflow 的 CNCF 项目正式级别（sandbox/incubating）未核实；
- §4.5 全部条目；
- 飞书组件联动细节是否含依赖图机制未实测（对标报告仅记 ViewModel+表达式绑定）；
- studio amis-editor 物料暴露形态、网关 CSP 头配置（C9 实现前核实项）；
- amis `custom` 钩子行级签名用前查官方文档（C9 关联项）。
