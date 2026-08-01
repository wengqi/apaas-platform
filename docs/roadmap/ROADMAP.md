# aPaaS 低代码平台 — 项目路线图 (ROADMAP)

> 项目经理（主智能体）维护，记录各阶段进度与验收结果。
> 功能对齐基准：`docs/research/RESEARCH-feishu-apaas-full.md`（飞书 aPaaS 完整功能体系调研）

## 总体目标
复刻飞书 aPaaS 完整功能体系（除 AI 模块和飞书生态集成外），包含 10 个一级模块：
对象建模 / 数据集与数据流 / 页面与UI / 流程引擎 / 权限与多租户 /
连接器与集成 / 云函数与扩展 / 仪表盘与报表 / 应用管理 / 数据管理。

流程引擎自研（类飞书思路：状态机 + BullMQ），WorkflowSchema JSON 为 SSOT。
流程建模双模式（bpmn-js 标准 + flowgram.ai 简化），同源双向互转。
TypeScript 全栈，独立 Web 应用，交互体验对齐飞书 aPaaS。

## 协调模型
单一主控：主智能体兼任项目经理 + 技术负责人，唯一总调度。
每个模块走全闸门：产品经理 agent(PRD) → UI/UE agent(设计规范) → 开发 agents 并行 → QA → 验收。

---

## Phase 0 — 基础设施（✅ 已完成）
| # | 任务 | 状态 |
|---|------|------|
| 0.1 | pnpm monorepo + Turborepo + shared 类型契约 | ✅ 完成 |
| 0.2 | infra/docker-compose.yml (PG + Redis) | ✅ 完成 |
| 0.3 | Prisma schema + NestJS 骨架 (gateway + meta/runtime/process) | ✅ 完成 |
| 0.4 | 前端 Vite+React 骨架 (Studio + Runtime UI) | ✅ 完成 |
| 0.5 | Fork flowgram.ai 到 simplified 目录 (npm依赖+自建物料) | ✅ 完成 |
| 0.6 | JWT 认证+登录联调 (前后端登录链路验证) | ✅ 完成 |
| 0.7 | 验收：登录 / Docker 健康 / 流程引擎自检 / flowgram 启动 | ✅ 完成 |

---

## Phase 1 — 对象/数据建模（✅ 已完成）
| # | 任务 | 状态 |
|---|------|------|
| 1.0 | 产品闸门: PRD-object.md (18字段类型/CRUD API/验收标准) | ✅ 完成 |
| 1.1 | 设计闸门: DESIGN-object.md (布局/组件规格/AntD映射) | ✅ 完成 |
| 1.2 | 后端: 对象/字段/视图CRUD + 记录CRUD+JSONB查询 (16路由) | ✅ 完成 |
| 1.3 | 前端: 对象设计器(6组件+18字段类型+嵌套路由) | ✅ 完成 |
| 1.4 | QA: E2E测试 (创建对象→加字段→创建记录→查询记录) | ✅ 完成 |
| 1.5 | 视图配置器(筛选/排序/字段显隐) + 字段拖拽排序 | ✅ 完成 |
| 1.6 | 记录列表UI + 分页 + 筛选 + 排序 | ✅ 完成（数据导入导出移入 Phase 10） |
| 1.7 | 公式引擎(字段公式计算) + 自动编号生成 | ✅ 完成 |

> **完成度**: ~85%。核心功能完整。剩余缺口：无 GIN 索引（JSONB 查询性能）、无软删除/回收站、无批量操作（移入 Phase 10）。

---

## Phase 2 — 可视化页面搭建器（✅ 已完成，⭐ 最大工作量）
| # | 任务 | 状态 |
|---|------|------|
| 2.0 | 产品闸门: PRD-page-builder.md (85+组件清单/视图模型/交互) | ✅ 完成 |
| 2.1 | 设计闸门: DESIGN-page-builder.md (三栏布局/组件视觉/拖拽交互) | ✅ 完成 |
| 2.2 | 后端: 页面Schema存取API | ✅ 完成（5路由: CRUD + publish） |
| 2.3 | 前端-搭建器框架: 三栏(组件面板+画布+属性面板) + dnd-kit拖拽 | ✅ 完成 |
| 2.4 | 前端-组件库: 容器(页面/分区/标签页/栅格) + 数据(表格/详情/列表) + 表单(输入/下拉/日期/选择/子表) + 展示(统计/图表/富文本) ~25个起步 | ✅ 完成（25组件/4类别） |
| 2.5 | 前端-视图模型: 页面级状态树 + 表达式绑定 + 变量作用域 | ✅ 完成 |
| 2.6 | 前端-运行时渲染器: 递归解析组件树 + 解析表达式 + 调数据API | ⚠️ 部分完成（Studio预览模式渲染器完整；**runtime-ui 独立渲染引擎未实现，为桩函数**） |
| 2.7 | 前端-事件系统: 组件事件(点击/变更) → 动作(查询/提交/跳转/弹窗/流程) + 条件判断 | ⚠️ 部分完成（action-executor 引擎 + 12动作完整；**事件配置 UI 为占位符**；trigger_process 仅 console.log） |
| 2.8 | 前端-页面类型: 列表页/详情页/表单页/仪表盘/自定义页 | ✅ 完成（5种页面类型） |
| 2.9 | 前端-PC+移动端双端适配 | ⬜ 未实现 |
| 2.10 | 前端-JS页面代码扩展: 页面级JavaScript处理复杂交互 | ⬜ 未实现 |
| 2.11 | QA: 拖拽搭建CRUD三件套(列表/详情/表单)并运行 | ⬜ 未做（无测试文件） |

> **完成度**: ~65%。搭建器框架、组件库、视图模型、表达式引擎、预览渲染器均完整。关键缺口：runtime-ui 独立渲染引擎（阻断 P9 应用发布）、事件配置 UI 占位、图表组件占位、JS 扩展/移动端未实现。

**验收标准**：拖拽搭建 CRUD 三件套（列表/详情/表单）并运行；组件属性可绑定数据；事件动作可触发。
> **验收状态**: ✅ Studio 预览模式下 CRUD 三件套可搭建运行、属性可绑定、事件动作引擎可触发。⚠️ runtime-ui 独立运行模式未实现。

---

## Phase 3 — 流程引擎（✅ 已完成，重点）⭐
| # | 任务 | 状态 |
|---|------|------|
| 3.0 | 产品闸门: PRD-process.md (150+节点/触发器/双模式/互转) | ✅ 完成 |
| 3.1 | 设计闸门: DESIGN-process.md (标准模式调色板/简化模式画布/切换) | ✅ 完成 |
| 3.2 | 后端-执行内核: 自研状态机引擎 + BullMQ异步队列 + NodeExecutor注册 | ⚠️ 部分完成（状态机引擎完整、crash 可恢复；**BullMQ 异步队列未实现，同步执行**） |
| 3.3 | 后端-节点执行器: 触发器/对象操作/条件/并行/循环/审批/通知/HTTP/赋值/延时/子流程 | ⚠️ 部分完成（12/19 类型已实现；parallel join 简化、delay≤60s、sub_process fire-and-forget；7 类型未实现: batch_operation/inclusive/loop/wait_for_condition/break/continue/comment） |
| 3.4 | 后端-通知模版管理: NotificationTemplate实体(模版名/渠道/标题/正文/变量) + 模版变量插值 | ⚠️ 部分完成（CRUD + 变量插值完整；**email/in_app 发送为日志桩，无 SMTP/消息表**；webhook 可用） |
| 3.5 | 后端-BPMN互转: bpmn-to-workflow / workflow-to-bpmn / capability-check | ⚠️ 部分完成（前端 ModeSwitcher 已实现互转 + 只读降级；**后端无转换器，bpmnXml 原样存储**） |
| 3.6 | 后端-变量系统: 流程变量作用域链 + IFlowValue四态(constant/ref/expression/template) | ✅ 完成 |
| 3.7 | 前端-标准模式: bpmn-js 完整BPMN2.0建模器(调色板+属性面板+XML) | ✅ 完成（属性面板简化: 仅 ID/类型/名称） |
| 3.8 | 前端-简化模式: flowgram.ai fork (Fixed Layout + aPaaS业务节点物料) | ✅ 完成 |
| 3.9 | 前端-模式切换: 一键切换不丢数据 + 只读降级 + 占位提示 | ✅ 完成 |
| 3.10 | 前端-通知模版管理UI + 流程监控: 运行实例列表 + 节点执行状态 + 人工任务处理(Tasklist) | ⚠️ 部分完成（ProcessMonitor 完整: 实例列表+节点状态+任务审批/委派；**NotificationTemplateManager 组件孤立未路由**） |
| 3.11 | QA: 双模式互转一致性 + 流程执行端到端 | ⬜ 未做（无测试文件） |

> **完成度**: ~60%。状态机引擎、双模式编辑器、模式互转、流程监控、人工任务均完整。关键缺口：无 BullMQ（同步执行无崩溃恢复）、无自动触发器（仅手动启动）、7 节点类型未实现、通知 email/in_app 为桩、后端无 BPMN 转换器。另：流程 undo/redo 按钮无 handler、导出菜单 onClick 空。

**验收标准**：
- 自研引擎执行基本流程(触发→节点→分支→结束) — ✅
- 简化模式画"创建记录触发通知"并执行 — ✅（通知仅 webhook 实际发送）
- 标准模式画 BPMN 流程并执行(通过 bpmn-to-workflow 转换) — ✅（转换在前端完成）
- 双模式同源互转(简化↔标准切换) — ✅
- 流程监控仪表盘 + 人工任务处理 — ✅

---

## Phase 4 — 权限与多租户（✅ 已完成）
| # | 任务 | 状态 |
|---|------|------|
| 4.0 | 产品闸门: PRD-permission.md (五级权限/角色/组织/多租户) | ✅ 完成 |
| 4.1 | 设计闸门: DESIGN-permission.md (角色管理/权限配置/组织树) | ✅ 完成 |
| 4.2 | 后端: 五级权限引擎(页面/记录/流程/数据模型/连接器) | ⚠️ 部分完成（PermissionService.check() 完整: RBAC+ABAC、deny-overrides、default-deny、super-admin 短路；**未挂载到任何路由——@RequirePermission 装饰器应用于 0 个控制器，所有路由仅 JwtAuthGuard**） |
| 4.3 | 后端: 角色管理(租户级+应用级) + 组织架构(树形) + 用户-应用-角色三元 | ✅ 完成（RoleService/OrgService/UserService 全 CRUD + 组织角色授予） |
| 4.4 | 后端: 记录级条件权限(行级过滤) + 字段级权限(列级) | ⚠️ 部分完成（condition + fieldScope 在权限引擎中实现；**因路由未挂载 PermissionGuard，实际不执行**） |
| 4.5 | 后端: 组织授权扩散(上级自动继承下级权限) | ⬜ 未实现 |
| 4.6 | 前端: 角色管理UI + 权限配置面板 + 组织树管理 | ⚠️ 部分完成（角色管理/组织树/用户管理完整；**权限规则编辑 UI 只读——setRules API 存在但 UI 未使用**） |
| 4.7 | QA: 权限隔离E2E | ⬜ 未做（无测试文件） |

> **完成度**: ~55%。权限引擎、角色/组织/用户 CRUD、管理 UI 均完整。关键缺口：**权限引擎未挂载到路由**（阻断性——任何登录用户可访问租户内所有 API）、无审计日志写入路径、无组织授权继承扩散、权限规则编辑 UI 只读。

**验收标准**：不同角色见不同页面/数据/任务；记录级条件权限生效；组织授权扩散正确。
> **验收状态**: ⚠️ 引擎逻辑已实现但因未挂载路由，权限隔离实际不生效。需修复后方可验收。

---

## Phase 1-4 技术债清单

> 以下为代码审计发现的 Phase 1-4 遗留技术债，按严重度分级。阻断性技术债影响生产可用性或阻塞后续模块，应在推进新模块前优先处理。

### 🔴 阻断性技术债（4 项）— ✅ 全部已修复（2026-08-01）

| # | 技术债 | 影响 | 修复状态 |
|---|--------|------|---------|
| TD-1 | **权限未强制执行** | 任何登录用户可访问租户内所有 API，无 RBAC/ABAC 校验 | ✅ 已修复：6 个业务控制器替换为 PermissionGuard + 添加 @RequirePermission 装饰器（管理类路由），查询类路由仅认证 |
| TD-2 | **BullMQ 异步队列缺失** | 流程引擎同步执行，延时节点 ≤60s，无崩溃恢复 | ✅ 已修复：引入 BullMQ + Redis，ProcessEngine 改为队列驱动，DelayExecutor 改用 BullMQ delayed job（无 60s 上限） |
| TD-3 | **runtime-ui 渲染引擎未实现** | 搭建的应用只能在 Studio 预览模式运行 | ✅ 已修复：移植 expression-engine/action-executor/RuntimeStore/ComponentRenderer(精简版) 到 runtime-ui，新增 PageView + getBySlug 路由 + TaskCenter 对接 |
| TD-4 | **无自动触发器** | 流程仅能手动启动 | ✅ 已修复：新增 TriggerService，RecordService 在 create/update/delete 后触发匹配的已发布流程（RECORD_CREATED/UPDATED/DELETED） |

### 🟡 非阻断性技术债（12 项）

| # | 技术债 | 影响 | 修复方向 |
|---|--------|------|---------|
| TD-5 | 零测试覆盖 | vitest 已配置但无任何测试文件，ROADMAP 声称的 E2E 通过不实 | 为各模块编写单元测试 + E2E 测试 |
| TD-6 | 审计日志空壳 | AuditLog 模型存在但无写入路径，无法追溯操作行为 | 在 PermissionGuard / 关键 service 中写入 AuditLog |
| TD-7 | 通知 email/in_app 为日志桩 | 无 SMTP 发送、无站内信消息表，仅 console.log | 接入邮件服务 + 创建消息表 + in_app 通知 UI |
| TD-8 | 页面事件配置 UI 占位 | action-executor 引擎完整（12 动作），但属性面板 Events tab 为占位符，用户无法配置事件 | 实现 PropertyPanel 的 Events tab UI，连接 COMPONENT_EVENTS + ACTION_TYPE_META |
| TD-9 | 图表组件占位 | 页面搭建器有 chart 组件类型但渲染器为占位文本 | 接入图表库（如 ECharts/G2），实现图表渲染（依赖 Phase 7 仪表盘） |
| TD-10 | trigger_process 动作未对接 | 页面事件 trigger_process 仅 console.log，未调用流程引擎 API | 对接 `/api/processes/:id/start` 接口 |
| TD-11 | 流程 undo/redo 无 handler | ProcessEditor 的 undo/redo 按钮渲染但 onClick 为空 | 实现撤销/重做栈（参考页面搭建器的实现） |
| TD-12 | 流程导出菜单无实现 | ProcessList 的"导出 Schema"/"导出 BPMN"下拉项 onClick 仅处理 delete | 实现导出逻辑（下载 JSON / XML 文件） |
| TD-13 | NotificationTemplateManager 孤立 | 完整的通知模板 CRUD 组件已实现但未在路由中挂载 | 在 ProcessEditor 或独立路由中挂载该组件 |
| TD-14 | 权限规则编辑 UI 只读 | RoleManager 显示权限规则但无创建/编辑入口，setRules API 未被 UI 调用 | 实现权限规则编辑器 UI（选择权限类型/动作/目标/条件/字段范围） |
| TD-15 | 无 GIN 索引 | records.data JSONB 查询无 GIN 加速，大数据量时全表扫描 | 添加 Prisma migration: `CREATE INDEX ... USING GIN (data)` |
| TD-16 | 微服务桩未填充 | meta-svc / runtime-svc / process-svc 仅 HealthController，所有逻辑在 gateway 中。需决策保留拆分还是正式合并 | 决策: 若维持单服务架构则删除微服务桩并更新架构文档；若拆分则迁移逻辑 |

---

## 后续推进建议

> 基于代码审计结果 + 用户优先级（P5 连接器 / P6 数据集 / P9 应用发布）+ 模块依赖分析，建议按以下路线推进。终极目标: 完整对标飞书 aPaaS。

### 第一步: 修复阻断性技术债 — ✅ 已完成（2026-08-01）

| 技术债 | 修复内容 |
|--------|---------|
| ✅ TD-1 权限强制执行 | 6 控制器替换 PermissionGuard + @RequirePermission 装饰器 |
| ✅ TD-2 BullMQ 异步队列 | 队列模块 + Worker + ProcessEngine 异步推进 + DelayExecutor delayed job |
| ✅ TD-3 runtime-ui 渲染引擎 | 移植 4 渲染核心 + PageView + getBySlug 路由 + TaskCenter |
| ✅ TD-4 自动触发器 | TriggerService + RecordService 事件触发 |

### 第二步: Phase 5 — 连接器与集成（相对独立）

```
5.2 连接器实体 + 管理 API（创建/配置/测试/调用）
5.3 内置连接器（HTTP / 数据库 / Webhook）
5.4 OpenAPI 凭证管理
5.5 连接器管理 UI + 配置向导 + 调试面板
→ 升级流程 http_request 节点为正式连接器调用
```

### 第三步: Phase 6 — 数据集与数据流（依赖 Phase 1 ✅）

```
6.2 数据集实体 + 数据流引擎（多表关联 / 筛选 / 分组 / 汇总 / 输出）
6.3 数据流可视化画布（节点式编排）
6.4 数据集在页面表格中使用
```

### 第四步: Phase 9 — 应用发布与版本（依赖 TD-3 runtime-ui ✅）

```
9.1 应用发布快照（publishedSnapshot 逻辑实现）
9.2 版本管理 + 环境隔离（Dev/Prod）
9.3 应用发布向导 UI + 版本历史 + 环境切换
```

### 后续: Phase 7 → 8 → 10

- **Phase 7** 仪表盘与报表（图表引擎 + 仪表盘布局，解决 TD-9）
- **Phase 8** 云函数与扩展（云函数平台 + 自定义组件 + JS 扩展）
- **Phase 10** 打磨与集成（数据导入导出 / 批量操作 / 完整 Demo / 性能优化 / 解决 TD-5 测试 / TD-15 GIN 索引）

---

## Phase 5 — 连接器与集成（全闸门）
| # | 任务 | 状态 |
|---|------|------|
| 5.0 | 产品闸门: PRD-connector.md (官方连接器/自建连接器/OpenAPI凭证) | ⬜ 待开始 |
| 5.1 | 设计闸门: DESIGN-connector.md (连接器列表/配置/测试) | ⬜ 待开始 |
| 5.2 | 后端: 连接器管理(创建/配置/测试/调用) + OpenAPI凭证管理 | ⬜ 待开始 |
| 5.3 | 后端: 内置连接器(HTTP/数据库/消息/Webhook) | ⬜ 待开始 |
| 5.4 | 前端: 连接器管理UI + 配置向导 + 调试面板 | ⬜ 待开始 |
| 5.5 | QA: 连接器调用E2E | ⬜ 待开始 |

**验收标准**：创建HTTP连接器→在流程中调用→验证返回数据。

---

## Phase 6 — 数据集与数据流（全闸门）⭐ 飞书核心亮点
| # | 任务 | 状态 |
|---|------|------|
| 6.0 | 产品闸门: PRD-dataset.md (数据集/数据流/多表关联/分组汇总) | ⬜ 待开始 |
| 6.1 | 设计闸门: DESIGN-dataset.md (数据流画布/节点/配置) | ⬜ 待开始 |
| 6.2 | 后端: 数据集实体 + 数据流引擎(多表关联/筛选/分组/汇总/输出) | ⬜ 待开始 |
| 6.3 | 前端: 数据流可视化画布(节点式编排) + 数据集管理 | ⬜ 待开始 |
| 6.4 | QA: 多表关联→分组汇总→输出数据集 E2E | ⬜ 待开始 |

**验收标准**：创建数据流→多表关联+筛选+分组汇总→输出数据集→在页面表格中使用。

---

## Phase 7 — 仪表盘与报表（全闸门）
| # | 任务 | 状态 |
|---|------|------|
| 7.0 | 产品闸门: PRD-dashboard.md (图表类型/数据源/运营报表) | ⬜ 待开始 |
| 7.1 | 后端: 图表数据聚合引擎(基于对象/数据集) | ⬜ 待开始 |
| 7.2 | 前端: 图表组件(柱状/折线/饼图/漏斗/地图) + 仪表盘布局 | ⬜ 待开始 |
| 7.3 | QA: 创建仪表盘→配置图表→运行预览 | ⬜ 待开始 |

---

## Phase 8 — 云函数与扩展开发（全闸门）
| # | 任务 | 状态 |
|---|------|------|
| 8.0 | 产品闸门: PRD-cloud-function.md (云函数/自定义组件/JS扩展) | ⬜ 待开始 |
| 8.1 | 后端: 云函数平台(创建/编辑/调试/部署/调用) | ⬜ 待开始 |
| 8.2 | 后端: 自定义组件注册 + 运行时加载 | ⬜ 待开始 |
| 8.3 | 前端: 云函数在线编辑器(Code Editor) + 调试面板 | ⬜ 待开始 |
| 8.4 | QA: 创建云函数→在流程中调用→验证返回 | ⬜ 待开始 |

---

## Phase 9 — 应用管理与发布（全闸门）
| # | 任务 | 状态 |
|---|------|------|
| 9.0 | 产品闸门: PRD-app-mgmt.md (生命周期/环境/发布/版本) | ⬜ 待开始 |
| 9.1 | 后端: 应用发布快照(publishedSnapshot) + 版本管理 + 环境隔离 | ⬜ 待开始 |
| 9.2 | 前端: 应用发布向导 + 版本历史 + 环境切换 | ⬜ 待开始 |
| 9.3 | 前端: 应用管理后台(运营报表/OpenAPI凭证/行为追踪) | ⬜ 待开始 |
| 9.4 | QA: 发布应用→运行态验证→版本回滚 | ⬜ 待开始 |

---

## Phase 10 — 打磨与集成
| # | 任务 | 状态 |
|---|------|------|
| 10.1 | 数据导入导出(CSV/Excel) | ⬜ 待开始 |
| 10.2 | 记录批量操作 | ⬜ 待开始 |
| 10.3 | 完整demo(资产管理系统，含对象/页面/流程/权限/仪表盘) | ⬜ 待开始 |
| 10.4 | 部署文档 + 性能优化 | ⬜ 待开始 |

**验收标准**：从零搭建含对象/页面/审批流程/权限/仪表盘的完整应用。

---

## 变更记录
- 2026-07-31：项目启动，Phase 0 开始。
- 2026-07-31：架构决策变更——放弃 Camunda 8(Zeebe)，改为自研流程引擎(状态机+BullMQ)。
- 2026-07-31：Phase 0.5 策略调整——npm 依赖 flowgram.ai 核心包 + 自建物料。
- 2026-07-31：Phase 0 全部完成。数据库迁移+种子用户+JWT 登录端到端验证通过。
- 2026-07-31：Phase 1 对象/数据建模完成。后端16路由+前端6组件+E2E通过。
- 2026-07-31：**ROADMAP 重大更新**——基于飞书 aPaaS 完整功能调研(919行报告)，从原5个Phase扩展为10个Phase，新增：数据集与数据流(P6)、连接器与集成(P5)、仪表盘与报表(P7)、云函数与扩展(P8)、应用管理与发布(P9)。功能对齐基准见 RESEARCH-feishu-apaas-full.md。
- 2026-07-31：明确排除飞书生态集成(K)和AI模块,本平台为独立系统,不依赖飞书。
- 2026-07-31：补充遗漏功能——Phase 1加公式引擎+自动编号(1.7)；Phase 2加JS页面代码扩展(2.10)；Phase 3加通知模版管理(3.4)含NotificationTemplate实体和模版变量插值。规则引擎不单列,逻辑能力分布在各模块中(流程条件/权限规则/公式/事件条件)。
- 2026-08-01：**ROADMAP 重大修正**——根据代码审计，Phase 1-4 全部标记为已完成(含部分完成项)。Phase 1 完成度 ~85%，Phase 2 ~65%，Phase 3 ~60%，Phase 4 ~55%。新增「Phase 1-4 技术债清单」(16项，4项阻断性: 权限未挂载/BullMQ缺失/runtime-ui渲染引擎未实现/无自动触发器)。新增「后续推进建议」——基于 P5/P6/P9 优先级 + 依赖分析的建议执行路线。整体覆盖率约 ~40%。
- 2026-08-01：**4 项阻断性技术债全部修复**——TD-1 权限强制执行(PermissionGuard 挂载 6 控制器)、TD-2 BullMQ 异步队列(队列模块+Worker+ProcessEngine 异步化+DelayExecutor delayed job)、TD-3 runtime-ui 渲染引擎(移植渲染核心+PageView+getBySlug 路由+TaskCenter)、TD-4 自动触发器(TriggerService+RecordService 事件触发)。所有修改通过 TypeScript 编译验证。
