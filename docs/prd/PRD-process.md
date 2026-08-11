# PRD — 流程引擎（Phase 3）

> 版本：v1.0 · 日期：2026-07-31 · 负责人：产品经理（主智能体）
> 对标：飞书 aPaaS 流程引擎（150+ 节点 / 触发器 / 变量系统 / 流程监控）
> 关联契约：`packages/shared/src/process/index.ts` · `packages/db/prisma/schema.prisma`
> 关联调研：`docs/research/RESEARCH-feishu-apaas-full.md`（D 节流程引擎）· `docs/research/RESEARCH-flowgram-ai.md`
> 验收闸门：Phase 3 产品闸门（ `ROADMAP.md` 任务 3.0 ）

---

## 1. 模块概述

### 1.1 定位

流程引擎是 aPaaS 低代码平台的**逻辑中枢**——平台核心模块。它让搭建者通过可视化画布编排"触发器
→ 数据操作 → 分支 → 审批 → 通知 → 结束"的业务流程，由执行引擎自动运行，提供代码级逻辑表达能力，
而无需编写后端代码。

流程引擎向下消费对象建模（Phase 1）的记录数据，向上为页面搭建器（Phase 2）的按钮事件提供"触发流程"
动作，并向权限模块（Phase 4）提供流程级权限控制对象：

```
对象建模(P1) ──记录增删改──▶ 流程触发器
页面搭建器(P2) ──按钮点击──▶ 流程触发器
流程引擎(本模块) ──人工任务/通知──▶ 终端用户
流程引擎(本模块) ──流程权限──▶ 权限模块(P4)
```

### 1.2 价值

| 角色 | 价值 |
|---|---|
| 搭建者 | 像画流程图一样编排业务逻辑（审批/通知/数据流转），无需写代码。 |
| 业务用户 | 人工任务自动派发到个人待办，审批/填报在线完成，流程进度可追踪。 |
| 开发者 | 节点执行器可扩展注册；WorkflowSchema 为 SSOT，前后端同构，无翻译损耗。 |
| 平台 | 自研引擎 TS 全栈进程内集成，与 aPaaS 零摩擦；BullMQ 保障异步可靠执行。 |

### 1.3 架构决策（与 ARCHITECTURE.md 对齐）

**放弃 Camunda 8，选择自研**。决策背景：Camunda 8 为 Java 引擎 + 4 个独立服务 + 跨语言 gRPC + 翻译层
脆弱点；自研（类飞书思路）与 aPaaS 零摩擦集成。三层架构：

```
┌─────────────────────────────────────────────────────────────┐
│ 层3 流程编辑器 UI                                           │
│ flowgram.ai fork · Fixed Layout                             │
└──────┼──────────────────────────────────────────────────────┘
┌──────▼──────────────────────────────────────────────────────┐
│ 层2 同源中介                                                │
│ WorkflowSchema (SSOT, JSON 节点图)                          │
│ flowToWorkflowSchema (零翻译)                               │
└──────┼──────────────────────────────────────────────────────┘
┌──────▼──────────────────────────────────────────────────────┐
│ 层1 执行内核 (process-svc · NestJS)                         │
│ 自研状态机引擎 (token 流) + BullMQ 异步队列                 │
│ NodeExecutor 注册表 · 流程实例生命周期                      │
└─────────────────────────────────────────────────────────────┘
```

**核心原则**：
1. **WorkflowSchema 为 SSOT**：内部执行格式统一为 WorkflowSchema JSON，自研引擎原生消费。
2. **零翻译**：流程编辑器直接产出/消费 WorkflowSchema。
3. **类型契约先行**：`packages/shared/src/process/index.ts` 为前后端对接边界（SSOT）。

---

## 2. 核心概念

| 概念 | 定义 | 类比 |
|---|---|---|
| **WorkflowSchema** | 节点图 JSON（nodes + edges + groups + globalVariable），自研引擎的核心执行格式，流程编辑器直接产出。 | flowgram.ai 内部格式 / 飞书流程定义 |
| **IFlowValue（四态值）** | 节点输入值的四种绑定形态：constant / ref / expression / template，是变量系统与节点数据绑定的桥梁。 | 表达式绑定 |
| **流程变量作用域链** | 全局变量（流程级）+ 节点变量（局部输出），按节点层级链式查找。 | 作用域链 |
| **NodeExecutor（节点执行器）** | 每种节点 type 注册一个执行器，实现执行契约（输入→输出），引擎按 type 路由分发。 | 策略模式 |

### 2.1 WorkflowSchema（SSOT）

自研引擎的核心执行格式，数据结构与 flowgram.ai 对齐（确保流程编辑器零翻译）：

```ts
interface WorkflowSchema {
  nodes: WorkflowNode[];        // 节点列表
  edges: WorkflowEdge[];        // 连线列表
  groups?: WorkflowGroup[];     // 分组（画布区域划分）
  globalVariable?: IJsonSchema; // 全局变量定义（JSON Schema）
}

interface WorkflowNode {
  id: NodeId;
  type: SimplifiedNodeType | string;  // aPaaS 业务类型名
  meta: WorkflowNodeMeta;             // 画布坐标
  data: WorkflowNodeData;             // 业务配置 + 输入输出
  blocks?: WorkflowNode[];            // 嵌套子节点（循环/条件分支内）
  edges?: WorkflowEdge[];             // 复合节点内部连线
}
```

> `WorkflowNode.data` 同时承载 `inputsValues`（四态绑定值）、`inputs`/`outputs`（JSON Schema 定义）
> 及节点类型特定配置字段（如 `triggerType`/`operation` 等）。

### 2.2 IFlowValue 四态值

节点输入参数值统一用四态表达，对齐 flowgram.ai，是变量绑定的统一抽象：

| 态 | content 类型 | 含义 | 示例 |
|---|---|---|---|
| `constant` | `string\|number\|boolean` | 字面量常量 | `{ type:'constant', content: 100 }` |
| `ref` | `string[]` | 引用其它变量路径（节点输出/全局变量） | `{ type:'ref', content:['trigger_0','output','recordId'] }` |
| `expression` | `string` | 表达式求值 | `{ type:'expression', content:'amount > 1000' }` |
| `template` | `string` | 模板字符串插值（`{{变量路径}}`） | `{ type:'template', content:'订单 {{order.no}} 已提交' }` |

> 四态统一存于 `WorkflowNodeData.inputsValues[key]`，执行引擎在节点执行前先解析四态为具体值。

### 2.3 流程变量作用域链

```
全局变量 (globalVariable, 流程级)
  └─ 触发器输出 (trigger.outputs → 注入全局)
      └─ 节点 A 输出 (nodeA.outputs, 局部)
          └─ 节点 B 输出 (nodeB.outputs, 局部)
              └─ 循环体/条件分支内 (block 作用域, 私有)
```

- **全局变量**：流程级，定义于 `WorkflowSchema.globalVariable`（JSON Schema），实例启动时初始化，全流程可读写。
- **节点变量（局部）**：节点执行后产出，存于 `NodeExecution.output`，后续节点可通过 `ref` 引用。
- **作用域隔离**：复合节点（循环/条件）内部的 `blocks` 形成私有作用域（`isNodeChildrenPrivate`），内部变量不泄漏到外层。
- **变量传递**：节点输出 → 经引擎写入变量上下文 → 下一节点的 `inputsValues` 通过 `ref` 路径读取。

### 2.4 节点执行器（NodeExecutor 模式）

引擎为每种 `type` 注册一个执行器，统一执行契约：

```ts
interface NodeExecutor<TData = WorkflowNodeData> {
  type: string;                              // 对应 SimplifiedNodeType
  execute(ctx: NodeExecContext): Promise<NodeExecResult>;
}

interface NodeExecContext {
  node: WorkflowNode;                        // 节点定义
  inputs: Record<string, unknown>;           // 已解析四态后的输入值
  variables: VariableScope;                  // 变量作用域（读写）
  instance: ProcessInstance;                 // 流程实例
  services: EngineServices;                  // 注入的领域服务（对象CRUD/通知/HTTP）
}
```

引擎按 `node.type` 从注册表查找执行器并调用；执行器返回输出 + 出边令牌，引擎推进状态机。

---

## 3. 触发器类型

流程入口，定义流程"何时自动执行"。对应 `TriggerConfig` / `TriggerType`。

| 触发类型 | TriggerType | 描述 | 配置项 | 优先级 |
|---|---|---|---|---|
| 记录创建 | `RECORD_CREATED` | 指定对象的记录被创建时触发 | `objectId` + `condition?`（触发条件表达式） | P0 |
| 记录更新 | `RECORD_UPDATED` | 指定对象的记录被更新时触发（可限字段） | `objectId` + `condition?` + `fieldIds?` | P0 |
| 定时触发 | `SCHEDULED` | 按 Cron 表达式定时触发 | `cron`（标准 5/6 段 Cron） | P0 |
| API 触发 | `API` | 外部系统通过 OpenAPI 调用触发 | 输入参数 Schema（Start 节点 outputs） | P1 |
| 手动触发 | `MANUAL` | 用户在界面手动启动流程 | 输入参数 Schema | P0 |
| 按钮点击 | `BUTTON_CLICK` | 页面按钮事件触发流程（对接 Phase 2 事件系统） | 页面组件 + 记录上下文 | P1 |

> ⚠️ **命名对齐**：当前 `shared/src/process/index.ts` 的 `TriggerType` 枚举值为 `record_event`/`schedule`/
> `manual`/`button_click`，与 Prisma `trigger_type` 注释及表单元数据（`RECORD_CREATED` 等）不一致。
> **Phase 3 需统一为上表的大写枚举值**，并将 `record_event` 拆分为 `RECORD_CREATED`/`RECORD_UPDATED`，
> 补充 `API` 触发（见第 10 节）。

**触发上下文**：触发时将触发来源信息注入流程变量，供后续节点引用：
```jsonc
{
  "triggerType": "RECORD_CREATED",
  "triggeredByUser": "usr_xxx",
  "recordId": "rec_xxx",        // 记录事件触发时
  "objectId": "obj_xxx",
  "inputs": { /* API/手动触发的入参 */ }
}
```

**触发条件**：记录事件触发可配 `condition`（表达式），仅满足条件才启动流程实例，避免无谓执行。

---

## 4. 节点类型清单

对齐飞书 aPaaS 150+ 节点，但 MVP 先实现核心节点。本平台 `SimplifiedNodeType` 枚举定义 18 种，
Phase 3 MVP 实现 P0 全部 + P1 关键节点。飞书的代码处理节点（云函数）归属 Phase 8，不在本阶段。

> **节点 type 命名对齐**：当前 flowgram 节点注册表使用 camelCase（`objectOperation`/`userTask`/`httpRequest`），
> 与 `SimplifiedNodeType` 的 snake_case（`object_operation`/`user_task`/`http_request`）不一致。
> **Phase 3 需统一为 snake_case**（以 shared 枚举为准），见第 10 节。

### 4.1 触发与起止

#### 4.1.1 Trigger（触发器）`trigger`
- **定位**：流程入口节点，定义触发条件（见第 3 节）。每流程仅一个。
- **配置项**：`triggerType` / `objectId`（记录事件）/ `condition`（触发条件）/ `cron`（定时）。
- **输入参数**：无（自身即入口）。
- **输出**：触发上下文（`recordId`/`triggeredByUser`/`inputs`）。
- **执行逻辑**：不主动执行，由触发器监听器在事件发生时创建流程实例并注入触发上下文。
- **优先级**：P0

#### 4.1.2 Start（开始）`start`
- **定位**：流程逻辑起点，定义流程输入参数 Schema。
- **配置项**：`outputs`（输入参数 JSON Schema，描述 API/手动触发时需传入的参数）。
- **输入参数**：外部传入（API/手动触发时按 Schema 校验）。
- **输出**：流程输入参数（注入全局变量）。
- **执行逻辑**：校验输入参数 → 写入全局变量 → 令牌流向下一节点。
- **优先级**：P0

#### 4.1.3 End（结束）`end`
- **定位**：流程逻辑终点，可定义输出结果。可有多个（多终点）。
- **配置项**：`outputs`（流程最终输出，可选）。
- **输入参数**：可选输出值（`ref` 引用变量）。
- **输出**：流程最终输出。
- **执行逻辑**：标记流程实例完成，记录输出 → 终止该分支令牌（若无活跃令牌则实例 COMPLETED）。
- **优先级**：P0

### 4.2 数据操作

#### 4.2.1 ObjectOperation（对象操作）`object_operation`
- **定位**：对 aPaaS 对象记录执行 CRUD，是流程与数据建模的桥梁。
- **配置项**：`operation`（CREATE/UPDATE/DELETE/QUERY/UPSERT）/ `objectId`（目标对象）/
  `fieldMapping`（字段映射：流程变量 → 对象字段）/ `queryFilter`（查询/更新/删除筛选条件）/
  `resultVariable`（查询结果映射到的变量名）。
- **输入参数**：`fieldMapping` 的值（四态绑定，引用上游变量）。
- **输出**：
  - CREATE：`recordId`（新建记录 ID）
  - UPDATE/DELETE：`affectedCount`（影响行数）
  - QUERY：`records`（记录数组）/ `record`（单条）
- **执行逻辑**：解析字段映射 → 调用 runtime-svc 记录 CRUD API → 返回结果写入变量。
- **优先级**：P0

#### 4.2.2 Assign（赋值/设置变量）`assign`
- **定位**：设置或更新流程变量，用于中间计算与变量传递。
- **配置项**：`variableName`（变量名）/ `value`（值，四态绑定）。
- **输入参数**：`value`（常量/引用/表达式/模板）。
- **输出**：无（副作用：写入变量作用域）。
- **执行逻辑**：解析四态 value → 写入 `variables[variableName]`。
- **优先级**：P0

### 4.3 流程控制

#### 4.3.1 Condition（条件分支 IF/ELSE）`condition`
- **定位**：二分或多分条件分支，根据条件表达式选择执行路径。
- **配置项**：`conditions`（条件分支数组 `ConditionBranch[]`，含 `label` + `condition`；末分支 `condition` 为空 = else）。
- **输入参数**：条件表达式中的变量（`ref`）。
- **输出**：无。
- **执行逻辑**：依次求值各分支 condition，首个满足的分支获得令牌；无满足则走 else 分支。
- **出边**：每分支一条出边，`label` 对应分支名。
- **优先级**：P0

#### 4.3.2 Switch（多分支选择）`inclusive`
- **定位**：包容分支/多条件分支，多个条件可同时满足则并行执行（区别于 Condition 的互斥）。
- **配置项**：`branches`（`{ label, condition }[]`，满足条件的分支均执行）+ `defaultBranch`（无匹配时）。
- **输入参数**：条件表达式变量。
- **输出**：无。
- **执行逻辑**：求值所有分支 condition，所有满足的分支并行获得令牌；汇聚处等待全部分支完成。
- **优先级**：P1

#### 4.3.3 Parallel（并行分支 AND）`parallel`
- **定位**：所有分支并行执行，汇聚处等待全部完成。
- **配置项**：`branches`（分支数，无 condition）。
- **输入参数**：无。
- **输出**：无。
- **执行逻辑**：分裂令牌到所有出边分支并行执行；在汇聚节点等待全部分支令牌到达后合并。
- **优先级**：P1

#### 4.3.4 Loop（循环）`loop`
- **定位**：遍历集合，对每个元素执行循环体内的 `blocks`。
- **配置项**：`collection`（引用流程变量路径，集合）/ `itemVariable`（当前元素变量名）/
  `indexVariable?`（当前索引变量名）/ `parallel`（是否并行遍历，P2）。
- **输入参数**：`collection`（四态 ref，指向数组变量）。
- **输出**：`loopResult`（可选，聚合结果）。
- **执行逻辑**：取集合 → 对每个元素设 `itemVariable` → 执行 blocks → 全部完成后令牌流出。
- **优先级**：P1（`Break`/`Continue` 控制节点同 P1）

#### 4.3.5 Delay（延时）`delay`
- **定位**：流程暂停指定时长后继续。
- **配置项**：`duration`（数值）/ `unit`（SECONDS/MINUTES/HOURS/DAYS）。
- **输入参数**：无。
- **输出**：无。
- **执行逻辑**：调度 BullMQ 延时任务，到点后恢复令牌。
- **优先级**：P0

### 4.4 业务操作

#### 4.4.1 UserTask（人工任务/审批）`user_task`
- **定位**：流程暂停，等待人工处理（审批/填报），是流程引擎与终端用户的交互点。
- **配置项**：`assigneeType`（USER/ROLE/ORG/SUPERVISOR/FORM_FIELD）/ `assigneeId`（审批人/角色 ID）/
  `approvalMode`（SINGLE 单人 / COUNTERSIGN 会签 / OR_SIGN 或签）/ `taskForm`（任务表单 JSON Schema，可选）/
  `taskName` / `dueDate?`（截止时间）。
- **输入参数**：审批上下文（`ref` 引用流程变量，如表单数据、申请人）。
- **输出**：`decision`（APPROVED/REJECTED）/ `formData`（审批人填写的表单）/ `comment`（审批意见）/
  `assignee`（实际处理人）。
- **执行逻辑**：创建 `ProcessTask` 记录 → 流程实例进入 `WAITING_USER_TASK` → 用户审批后写入决策 →
  按决策（APPROVED 走通过分支 / REJECTED 走拒绝分支）恢复令牌。
- **优先级**：P0

#### 4.4.2 Notification（发送通知）`notification`
- **定位**：通过邮件/站内信/Webhook 发送通知，支持选择通知模版。
- **配置项**：`channel`（EMAIL/IN_APP/WEBHOOK）/ `recipient`（收件人，支持变量）/ `subject`（标题）/
  `body`（正文，支持变量插值）/ `templateId?`（选择通知模版，见第 7 节）。
- **输入参数**：`recipient`/`subject`/`body` 可四态绑定上游变量。
- **输出**：`messageId`（发送回执）/ `success`（是否成功）。
- **执行逻辑**：若选模版则加载模版并插值 → 调用通知渠道发送 → 记录回执。
- **优先级**：P0

#### 4.4.3 HttpRequest（HTTP 请求/连接器）`http_request`
- **定位**：调用外部 API（Phase 5 连接器的前置形态），打通外部系统。
- **配置项**：`method`（GET/POST/PUT/PATCH/DELETE）/ `url` / `headers`（JSON）/ `body`（JSON，支持变量插值）/
  `responseMapping?`（响应字段 → 变量名映射）。
- **输入参数**：`url`/`headers`/`body` 可四态绑定。
- **输出**：`statusCode` / `responseBody`（响应体）/ 按 `responseMapping` 映射的字段。
- **执行逻辑**：发送 HTTP 请求 → 校验状态码 → 解析响应 → 按映射写入变量。
- **优先级**：P0

#### 4.4.4 SubProcess（子流程调用）`sub_process`
- **定位**：调用另一个已发布流程，实现流程复用与分层。
- **配置项**：`subProcessKey`（子流程 key）/ `inputMapping`（输入参数映射）/ `sync`（是否同步等待结果）。
- **输入参数**：子流程入参（按子流程 Start 节点 Schema）。
- **输出**：子流程最终输出（End 节点 outputs）。
- **执行逻辑**：启动子流程实例 →（同步）等待完成取输出 /（异步）触发后继续 → 写入变量。
- **优先级**：P1

### 4.5 节点清单总览

| 节点 | type | 分类 | 优先级 |
|---|---|---|---|
| 触发器 | `trigger` | 触发起止 | P0 |
| 开始 | `start` | 触发起止 | P0 |
| 结束 | `end` | 触发起止 | P0 |
| 对象操作 | `object_operation` | 数据操作 | P0 |
| 赋值 | `assign` | 数据操作 | P0 |
| 条件分支 | `condition` | 流程控制 | P0 |
| 多分支选择 | `inclusive` | 流程控制 | P1 |
| 并行分支 | `parallel` | 流程控制 | P1 |
| 循环 | `loop` | 流程控制 | P1 |
| 延时 | `delay` | 流程控制 | P0 |
| 人工任务 | `user_task` | 业务操作 | P0 |
| 通知 | `notification` | 业务操作 | P0 |
| HTTP 请求 | `http_request` | 业务操作 | P0 |
| 子流程 | `sub_process` | 业务操作 | P1 |

> 飞书另有：批量操作、等待条件、跳出/继续循环、代码处理（云函数）、注释等。其中等待条件（`wait_for_condition`）、
> 跳出/继续循环（`break`/`continue`）类型契约已保留，归 P2；代码处理节点归 Phase 8 云函数；注释节点归 P2。

---

## 5. 流程编辑器

### 5.1 flowgram.ai Fixed Layout

- **内核**：fork 的 flowgram.ai `@flowgram.ai/fixed-layout-editor`（MIT，已就绪于 `simplified/` 目录）。
- **形态**：自上而下的固定布局，节点拖入指定位置，飞书风格表单式配置，支持分支/循环复合节点。
- **产物**：flowgram 内部格式 `FlowDocumentJSON`，经 `flowToWorkflowSchema` 序列化为 WorkflowSchema（零翻译）。
- **节点物料**：基于 `createInjectMaterial` 自建 aPaaS 业务节点物料（10 个已定义 form-meta），替换 flowgram 默认节点。
- **适用人群**：业务搭建者，无需写代码。
- **能力边界**：仅支持 `SimplifiedNodeType` 集合内的节点（18 种）。

---

## 6. 变量系统

### 6.1 变量分类

| 类型 | 作用域 | 定义位置 | 读写 |
|---|---|---|---|
| **全局变量** | 流程级，全流程可见 | `WorkflowSchema.globalVariable`（JSON Schema） | 可读可写（Assign 节点） |
| **触发器输出** | 流程级，启动时注入 | Trigger 节点输出 | 只读 |
| **节点输出** | 局部，节点执行后产生 | `WorkflowNode.data.outputs`（JSON Schema） | 只读（下游引用） |
| **循环变量** | block 作用域私有 | Loop 节点 `itemVariable`/`indexVariable` | 循环内只读 |

### 6.2 IFlowValue 四态绑定

节点输入参数（`inputsValues`）统一用四态绑定到变量（见 2.2）。变量引用路径为数组形式：

```jsonc
// 引用 trigger_0 节点输出的 recordId
{ "type": "ref", "content": ["trigger_0", "output", "recordId"] }

// 引用全局变量 amount
{ "type": "ref", "content": ["global", "amount"] }

// 模板插值
{ "type": "template", "content": "订单 {{trigger_0.output.orderNo}} 已通过审批" }
```

### 6.3 变量传递链路

```
触发器事件 → 注入触发上下文到全局变量
  → 节点 A 执行（inputsValues 经四态解析读取上游变量）
    → 节点 A 输出写入 NodeExecution.output + 变量作用域
      → 节点 B inputsValues.ref 引用节点 A 输出
        → ... 直至 End
```

- **解析时机**：节点执行前，引擎遍历 `inputsValues`，按四态解析为具体值，传入 `NodeExecContext.inputs`。
- **变量选择器**：流程编辑器提供可视化变量选择器，列出当前可达变量路径（全局 + 已执行节点输出），避免手写路径出错。
- **类型校验**：`ref` 引用的变量类型应与目标输入参数 JSON Schema 匹配，不匹配时编辑器告警。

---

## 7. 通知模版管理

通知模版独立于流程存在（非仅流程内联配置），可在多个流程/通知节点复用。对应 roadmap 任务 3.4。

### 7.1 NotificationTemplate 实体

| 字段 | 说明 | 约束 |
|---|---|---|
| `id` | 模版 ID | cuid |
| `tenantId` | 租户 | 行级隔离 |
| `appId` | 应用（可空=租户级模版） | 可租户级或应用级共享 |
| `apiName` | API 名称 | snake_case，应用内唯一 |
| `name` | 模版名称 | 显示用 |
| `channel` | 通知渠道 | `EMAIL` / `IN_APP` / `WEBHOOK` |
| `titleTemplate` | 标题模版 | 支持 `{{变量名}}` 插值 |
| `bodyTemplate` | 正文模版 | 支持 `{{变量名}}` 插值 |
| `variables` | 变量定义 | JSON 数组 `[{ name, type, description }]` |
| `status` | 状态 | `DRAFT` / `PUBLISHED` |

### 7.2 模版变量插值

- 模版标题/正文中用 `{{变量名}}` 占位，发送时由通知执行器用流程变量上下文插值替换。
- `variables` 定义模版期望接收的变量清单；通知节点选模版时，需为这些变量提供映射（四态绑定到流程变量）。
- 未提供值的变量替换为空字符串，不阻断发送。

```
模版标题: {{applicant}} 的 {{leaveType}} 申请待审批
节点映射: applicant ← ref(start_0.output.applicantName)
          leaveType ← ref(trigger_0.output.recordData.leave_type)
渲染结果: 张三 的 年假 申请待审批
```

### 7.3 流程通知节点与模版关系

- Notification 节点两种使用方式：
  1. **内联配置**：直接在节点配置 `subject`/`body`/`recipient`（适合一次性通知）。
  2. **选择模版**：配置 `templateId` + 变量映射（适合复用通知，推荐）。
- 选模版时，节点的 `subject`/`body` 由模版渲染生成，节点内不再配置正文。
- 通知模版管理入口独立于流程，位于应用管理下的"通知模版"页面。

### 7.4 通知渠道

| 渠道 | 实现 | 优先级 |
|---|---|---|
| `IN_APP` 站内信 | 写入站内消息表，终端用户在消息中心查看 | P0 |
| `EMAIL` 邮件 | 通过 SMTP/邮件服务发送 | P1 |
| `WEBHOOK` | HTTP POST 到指定 URL | P1 |

> ⚠️ **命名对齐**：当前 `shared` 的 `NotificationConfig.channel` 用小写（`in_app`/`email`/`webhook`），
> 表单元数据用大写（`EMAIL`/`IN_APP`/`WEBHOOK`）。Phase 3 统一为大写枚举（见第 10 节）。

---

## 8. 执行引擎设计

### 8.1 状态机模型（token 流）

采用 **token（令牌）流模型**：流程实例持有若干活跃令牌，每个令牌位于某节点；节点执行后产出令牌流向下游。

```
Start ──[token]──▶ 节点A ──[token]──▶ Condition ──┬──[token]──▶ 分支1 ──▶ End
                                                   └──[token]──▶ 分支2 ──▶ End
```

- **令牌位置**：`ProcessInstance.activeNodeIds` 记录当前活跃节点（令牌所在）。
- **分裂与合并**：并行/包容网关分裂令牌到多分支；汇聚节点等待全部分支令牌到达后合并。
- **持久化**：每次令牌推进即更新 `activeNodeIds` + 写 `NodeExecution` 记录，崩溃可从持久化状态恢复。

### 8.2 BullMQ 异步队列

| 能力 | 说明 |
|---|---|
| 异步执行 | 节点执行投递到 BullMQ 队列，工作进程消费，避免阻塞请求线程 |
| 重试机制 | 节点失败按策略重试（默认 3 次，指数退避），`NodeExecution.retries` 记录次数 |
| 超时控制 | 单节点执行超时（默认 60s，可配），超时标记 FAILED |
| 延时调度 | Delay 节点用 BullMQ 延时任务实现，到点恢复令牌 |
| 状态持久化 | 队列任务状态与流程实例状态双向同步，支持实例恢复重跑 |
| 限流 | 按 tenantId 限流，防止流程风暴压垮系统 |

### 8.3 节点执行器注册表

```ts
const NodeExecutorRegistry = new Map<string, NodeExecutor>();

// 注册（process-svc 启动时）
register(new TriggerExecutor());
register(new ObjectOperationExecutor());
register(new ConditionExecutor());
register(new UserTaskExecutor());
// ... 每个 type 一个执行器

// 分发（引擎推进时）
function executeNode(node, ctx) {
  const executor = NodeExecutorRegistry.get(node.type);
  if (!executor) throw new Error(`未注册的节点类型: ${node.type}`);
  return executor.execute(ctx);
}
```

- 执行器通过依赖注入获取领域服务（对象 CRUD / 通知 / HTTP 客户端），保持执行器纯粹。
- 执行器可逐步补全，新增节点类型只需注册新执行器，引擎核心不动。

### 8.4 流程实例生命周期

```
                 ┌──────────────┐
   触发/手动启动 ──▶│  RUNNING     │── 节点全完成 ──▶ COMPLETED
                 └──────┬───────┘
                        │ 遇到 UserTask
                        ▼
                 ┌───────────────────┐
                 │ WAITING_USER_TASK │── 用户审批 ──▶ RUNNING
                 └──────┬────────────┘
                        │ 超时/取消
                        ▼
                 ┌──────────────┐    节点失败(重试耗尽)
                 │  TERMINATED  │◀───────────  FAILED
                 └──────────────┘
```

| 状态 | 含义 |
|---|---|
| `RUNNING` | 正在执行，有活跃令牌 |
| `WAITING_USER_TASK` | 等待人工任务处理（暂停） |
| `COMPLETED` | 正常结束（到达 End 节点） |
| `FAILED` | 节点失败且重试耗尽 |
| `TERMINATED` | 用户手动终止 |

> ⚠️ **状态对齐**：`shared` 的 `ProcessInstanceState` 有 7 态（含 `Pending`/`Waiting`/`Cancelled`），
> Prisma `ProcessInstanceStatus` 仅 5 态。Phase 3 统一为上表 5 态（移除 Pending/Cancelled，
> `Waiting` 细化为 `WAITING_USER_TASK`），见第 10 节。

---

## 9. API 设计

> 约定：所有路由经 gateway，JWT 保护，`tenantId` 从 token 提取。
> 响应统一 `{ ok: true, data }` / `{ ok: false, error }`。
> 流程定义 CRUD 路由到 **meta-svc**；流程实例/执行/人工任务路由到 **process-svc**。

### 9.1 流程定义 CRUD（meta-svc）

| 方法 | 路径 | 说明 | 优先级 |
|---|---|---|---|
| GET | `/apps/:appId/processes` | 列出应用下流程定义 | P0 |
| GET | `/processes/:processDefId` | 获取流程定义（含 workflowSchema） | P0 |
| POST | `/apps/:appId/processes` | 创建流程定义 | P0 |
| PUT | `/processes/:processDefId` | 更新流程定义（schema） | P0 |
| DELETE | `/processes/:processDefId` | 删除流程定义（草稿可删，已发布需先归档） | P0 |
| POST | `/processes/:processDefId/publish` | 发布流程（版本自增，状态→PUBLISHED） | P0 |
| POST | `/processes/:processDefId/validate` | 校验流程 Schema（节点/连线/变量引用完整性） | P1 |

**创建流程请求体**：
```jsonc
{
  "apiName": "leave_approval",
  "name": "请假审批流程",
  "workflowSchema": { "nodes": [], "edges": [] },
  "triggerType": "RECORD_CREATED"
}
```

### 9.2 流程实例（process-svc）

| 方法 | 路径 | 说明 | 优先级 |
|---|---|---|---|
| POST | `/processes/:processKey/start` | 启动流程实例（传输入变量） | P0 |
| GET | `/process-instances` | 查询实例列表（按流程/状态/时间筛选分页） | P0 |
| GET | `/process-instances/:instanceId` | 获取实例详情（含节点执行状态报告） | P0 |
| GET | `/process-instances/:instanceId/report` | 获取实例执行报告（`ProcessInstanceReport`） | P0 |
| POST | `/process-instances/:instanceId/cancel` | 取消/终止流程实例 | P1 |
| POST | `/process-instances/:instanceId/retry` | 重试失败节点（从 FAILED 恢复） | P1 |

**启动流程请求体**（对应 `StartProcessRequest`）：
```jsonc
{
  "processKey": "leave_approval",
  "variables": { "applicant": "张三", "days": 3 }
}
```

### 9.3 人工任务（process-svc）

| 方法 | 路径 | 说明 | 优先级 |
|---|---|---|---|
| GET | `/tasks` | 我的待办任务列表（按受理人/候选组筛选，分页） | P0 |
| GET | `/tasks/:taskId` | 获取任务详情（含审批表单） | P0 |
| POST | `/tasks/:taskId/claim` | 认领任务（会签/或签场景） | P1 |
| POST | `/tasks/:taskId/complete` | 完成任务（提交审批决策 + 表单 + 意见） | P0 |
| POST | `/tasks/:taskId/delegate` | 转办任务给他人 | P1 |
| GET | `/process-instances/:instanceId/tasks` | 列出某实例下的全部人工任务及状态 | P0 |

**完成任务请求体**：
```jsonc
{
  "decision": "APPROVED",       // APPROVED | REJECTED
  "formData": { /* 审批人填写的表单 */ },
  "comment": "同意，注意按期返岗"
}
```

### 9.4 通知模版 CRUD（meta-svc）

| 方法 | 路径 | 说明 | 优先级 |
|---|---|---|---|
| GET | `/apps/:appId/notification-templates` | 列出通知模版 | P0 |
| GET | `/notification-templates/:templateId` | 获取模版详情 | P0 |
| POST | `/apps/:appId/notification-templates` | 创建模版 | P0 |
| PUT | `/notification-templates/:templateId` | 更新模版 | P0 |
| DELETE | `/notification-templates/:templateId` | 删除模版（被引用时阻止） | P0 |
| POST | `/notification-templates/:templateId/preview` | 预览模版（传入变量渲染结果） | P1 |

### 9.5 校验与错误约定

- 流程 Key 冲突 → `409 VALIDATION_ERROR`。
- 启动未发布流程 → `409 VALIDATION_ERROR` + 提示需先发布。
- 节点 type 未注册执行器 → `400` + `unsupported_node_type`。
- 变量引用路径不存在 → `400` + `invalid_variable_ref`。
- 任务不属于当前用户 → `403 FORBIDDEN`。
- 重复完成任务 → `409 CONFLICT`。

---

## 10. 数据模型（与现有 Prisma schema / shared 类型映射）

### 10.1 现有模型

`schema.prisma` 已定义三个流程模型（Phase 0 基础层），Phase 3 直接复用并补充：

- `ProcessDef`：流程定义（`workflowSchema` JSON + `version` + `status` + `triggerType`）。
- `ProcessInstance`：流程实例（`triggerContext` + `variables` + `status` + `activeNodeIds`）。
- `NodeExecution`：节点执行记录（`nodeId` + `nodeType` + `status` + `input`/`output` + `retries`）。

### 10.2 映射与差异（需 Phase 3 修正）

#### ProcessDef

| shared `ProcessDef` 字段 | Prisma `ProcessDef` 列 | 状态 | 处理 |
|---|---|---|---|
| `id` | `id` | ✅ 一致 | — |
| `tenantId` | `tenantId` | ✅ 一致 | — |
| `processKey` | `apiName` | ⚠️ 命名不一致 | **统一**：shared 改用 `apiName`（与对象/页面命名一致），或 Prisma 增 `process_key` 别名。建议统一为 `apiName` |
| `workflowSchema` | `workflowSchema` | ✅ 一致 | — |
| `version` | `version` | ✅ 一致 | — |
| `status` (`ProcessStatus`) | `status` (`ProcessDefStatus`) | ⚠️ 枚举不一致 | shared 有 `Deprecated`，Prisma 为 `ARCHIVED`。**统一为 `ARCHIVED`** |
| `triggerType` | `triggerType` | ✅ 一致 | 枚举值需对齐（见 3 节） |
| — | `appId` | ⚠️ shared 缺失 | shared `ProcessDef` 补 `appId`（流程归属应用） |
| `createdAt/updatedAt` | `createdAt/updatedAt` | ✅ 一致 | — |

#### ProcessInstance / 状态枚举

| shared `ProcessInstanceState` | Prisma `ProcessInstanceStatus` | 处理 |
|---|---|---|
| `Pending` | — | **移除**（启动即 RUNNING，无 Pending） |
| `Running` | `RUNNING` | ✅ |
| `Waiting` | `WAITING_USER_TASK` | **统一为 `WAITING_USER_TASK`**（shared 改名） |
| `Completed` | `COMPLETED` | ✅ |
| `Failed` | `FAILED` | ✅ |
| `Terminated` | `TERMINATED` | ✅ |
| `Cancelled` | — | **移除**（用 TERMINATED 覆盖取消场景） |

#### NodeExecution 状态

| shared `NodeExecutionStatus.state` | Prisma `NodeExecStatus` | 处理 |
|---|---|---|
| `idle` | `PENDING` | 统一为 `PENDING` |
| `processing` | `RUNNING` | 统一为 `RUNNING` |
| `success` | `COMPLETED` | 统一为 `COMPLETED` |
| `fail` | `FAILED` | 统一为 `FAILED` |
| `waiting` | — | **补 `WAITING`**（UserTask 等待中） |
| `skipped` | `SKIPPED` | ✅ |

#### TriggerType 枚举

| shared `TriggerType` | 实际使用（Prisma/form-meta） | 处理 |
|---|---|---|
| `RecordEvent = 'record_event'` | `RECORD_CREATED`/`RECORD_UPDATED` | **拆分**为两个独立值 |
| `Schedule = 'schedule'` | `SCHEDULED` | 统一为 `SCHEDULED` |
| `Manual = 'manual'` | `MANUAL` | 统一为 `MANUAL` |
| `ButtonClick = 'button_click'` | `BUTTON_CLICK` | 统一为 `BUTTON_CLICK` |
| — | `API` | **补 `API`** |

### 10.3 Phase 3 需新增的 Prisma 模型

#### 10.3.1 ProcessDef 补列

```prisma
model ProcessDef {
  // ... 现有字段
  // status 枚举值统一：DRAFT | PUBLISHED | ARCHIVED
  // triggerType 枚举值统一：RECORD_CREATED | RECORD_UPDATED | SCHEDULED | MANUAL | API | BUTTON_CLICK
}
```

#### 10.3.2 ProcessTask（人工任务运行时实例）⭐ 新增

`NodeExecution` 记录节点执行，但人工任务需要独立的任务实体承载受理人/决策/表单/转办。新增模型：

```prisma
model ProcessTask {
  id              String   @id @default(cuid())
  instanceId      String   @map("instance_id")
  nodeId          String   @map("node_id")           // WorkflowSchema 中的 UserTask 节点 ID
  nodeExecutionId String?  @map("node_execution_id") // 关联节点执行记录
  name            String                              // 任务名称
  assignee        String?                             // 受理人（认领后确定）
  candidateGroups String[] @default([]) @map("candidate_groups") // 候选组/角色编码
  assigneeType    String   @map("assignee_type")     // USER | ROLE | ORG | SUPERVISOR | FORM_FIELD
  approvalMode    String   @map("approval_mode")     // SINGLE | COUNTERSIGN | OR_SIGN
  status          String   @default("PENDING")       // PENDING | CLAIMED | COMPLETED | DELEGATED | CANCELLED
  decision        String?                             // APPROVED | REJECTED
  formData        Json?    @map("form_data")         // 审批人填写的表单
  comment         String?                             // 审批意见
  dueDate         DateTime? @map("due_date")
  claimedAt       DateTime? @map("claimed_at")
  claimedBy       String?  @map("claimed_by")
  completedAt     DateTime? @map("completed_at")
  createdAt       DateTime @default(now()) @map("created_at")

  instance ProcessInstance @relation(fields: [instanceId], references: [id], onDelete: Cascade)

  @@index([instanceId])
  @@index([assignee])
  @@index([status])
  @@map("process_tasks")
}
```

#### 10.3.3 NotificationTemplate（通知模版）⭐ 新增

```prisma
model NotificationTemplate {
  id            String   @id @default(cuid())
  tenantId      String   @map("tenant_id")
  appId         String?  @map("app_id")              // 空=租户级模版
  apiName       String   @map("api_name")            // snake_case，应用内唯一
  name          String                               // 模版名称
  channel       String                               // EMAIL | IN_APP | WEBHOOK
  titleTemplate String   @map("title_template")      // 支持 {{var}} 插值
  bodyTemplate  String   @map("body_template")       // 支持 {{var}} 插值
  variables     Json     @default("[]")              // [{ name, type, description }]
  status        String   @default("DRAFT")           // DRAFT | PUBLISHED
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([appId, apiName])
  @@index([tenantId])
  @@map("notification_templates")
}
```

> `NotificationTemplate` 需在 `Tenant` 模型增加反向关系 `notificationTemplates NotificationTemplate[]`。
> `ProcessInstance` 模型增加反向关系 `tasks ProcessTask[]`。

### 10.4 schema-serializer 复用

`packages/studio/features/process/simplified/src/schema-serializer.ts` 已实现 flowgram 内部格式 ↔
WorkflowSchema 双向转换（`flowToWorkflowSchema` / `workflowToFlowSchema`），确保 flowgram 内部格式与
WorkflowSchema 同源一致。

---

## 11. 验收标准（Phase 3 完成闸门）

> 对齐 ROADMAP.md Phase 3 验收标准。

### 功能验收（可验证）

1. **自研引擎执行**：能执行基本流程（触发 → 数据操作 → 条件分支 → 结束），状态机正确推进令牌，节点执行状态可查。
2. **流程编辑器画流程**：在流程编辑器（flowgram fork）画出"创建记录触发通知"流程并保存执行；10 个业务节点可配置。
3. **流程监控**：流程监控仪表盘展示运行实例列表、节点执行状态（PENDING/RUNNING/COMPLETED/FAILED/SKIPPED/WAITING）、变量快照。
4. **人工任务处理**：UserTask 生成待办，用户在 Tasklist 认领/审批（APPROVED/REJECTED）/转办，审批后流程按决策分支继续。
5. **通知模版**：能独立创建/管理通知模版，流程通知节点可选模版并渲染变量插值发送。
6. **变量系统**：节点间变量传递正确；四态值（constant/ref/expression/template）均能解析；变量选择器列出可达变量。
7. **多租户**：A 租户的流程定义/实例/任务对 B 租户不可见。
8. **端到端**：完成典型审批流（请假申请 → 主管审批 → 通过则通知申请人 + 更新记录，拒绝则通知申请人）全流程跑通。

### 技术验收

11. `packages/shared/src/process/index.ts` 类型在前后端全链路使用，无 `any` 逃逸；第 10.2 节所列枚举/命名差异已修正。
12. Prisma schema 完成第 10.3 节所列迁移（`ProcessTask` + `NotificationTemplate`）。
13. process-svc 提供流程定义/实例/人工任务/通知模版全部 P0 API（9.1–9.4）。
14. 节点执行器注册表覆盖 14 个 MVP 节点类型（4.5 总览表 P0+P1），按 type 路由分发。
15. BullMQ 队列提供异步执行/重试/超时/延时调度，实例状态可从持久化恢复。

---

## 12. 非目标（Phase 3 不做）

| 非目标 | 说明 | 归属阶段 |
|---|---|---|
| 飞书 150+ 全部节点 | MVP 仅实现 14 个核心节点（4.5 总览表 P0+P1），其余节点（等待条件/批量操作/注释等）类型契约保留不实现。 | P2 / 后续 |
| 补偿事务 / 事务回滚 | 节点失败不自动回滚已执行的副作用（如已创建的记录）。仅提供重试与失败标记。 | 后续 |
| 事件子流程 (Event SubProcess) | 由事件触发的中断型子流程，流程编辑器暂不支持。 | 后续 |
| 复杂泳道 (Pool/Lane) | 泳道级权限/编排暂不支持。 | 后续 |
| 边界事件 (BoundaryEvent) | 附着在任务边界的事件（超时/错误/取消），流程编辑器暂不支持。 | 后续 |
| 代码处理节点（云函数） | 执行自定义 JS 代码的节点，依赖云函数平台。类型暂不纳入 SimplifiedNodeType。 | Phase 8 |
| 连接器管理 | HTTP 请求节点可调用外部 API，但连接器管理（封装/复用/凭证）不做。 | Phase 5 |
| 流程版本迁移 | 已运行的旧版本实例与新版本定义的兼容迁移。 | 后续 |
| 流程性能监控 | 流程执行耗时统计、瓶颈分析、SLA 监控等运营级监控。 | Phase 7 / 后续 |
| 飞书审批集成 | 对接飞书原生审批流，本平台为独立系统不依赖飞书。 | 不做 |
| 并行循环 | Loop 节点的 `parallel` 并行遍历模式，类型契约保留，P2 实现。 | P2 |
| 任务催办/自动委派 | 人工任务超时自动催办、自动委派给上级等智能调度。 | 后续 |

---

## 附录 A：MVP 节点与执行器交付清单

### P0 节点（必须实现）
- 触发起止：Trigger / Start / End
- 数据操作：ObjectOperation / Assign
- 流程控制：Condition / Delay
- 业务操作：UserTask / Notification / HttpRequest

### P1 节点（尽量实现）
- 流程控制：Switch（inclusive）/ Parallel / Loop（含 Break/Continue）
- 业务操作：SubProcess

### 执行器注册清单（对应 8.3）
| 执行器 | type | 核心依赖服务 |
|---|---|---|
| TriggerExecutor | `trigger` | 触发器监听器（不主动执行） |
| StartExecutor | `start` | 变量上下文 |
| EndExecutor | `end` | 变量上下文 |
| ObjectOperationExecutor | `object_operation` | runtime-svc 记录 CRUD |
| AssignExecutor | `assign` | 变量上下文 |
| ConditionExecutor | `condition` | 表达式引擎 |
| SwitchExecutor | `inclusive` | 表达式引擎 |
| ParallelExecutor | `parallel` | 状态机令牌分裂/合并 |
| LoopExecutor | `loop` | 状态机 + 表达式引擎 |
| DelayExecutor | `delay` | BullMQ 延时任务 |
| UserTaskExecutor | `user_task` | ProcessTask 服务 |
| NotificationExecutor | `notification` | 通知渠道服务 + 模版渲染 |
| HttpRequestExecutor | `http_request` | HTTP 客户端 |
| SubProcessExecutor | `sub_process` | 流程实例服务（递归启动） |
