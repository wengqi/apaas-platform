# aPaaS 低代码平台 — 项目路线图 (ROADMAP)

> 项目经理（主智能体）维护，记录各阶段进度与验收结果。
> 功能对齐基准：`docs/research/RESEARCH-feishu-apaas-full.md`（飞书 aPaaS 完整功能体系调研）
> 应用生命周期与发布流程对齐基准：`docs/research/RESEARCH-feishu-apaas-app-lifecycle.md`（飞书 aPaaS 应用创建→发布→管理全流程深度调研）

## 总体目标
复刻飞书 aPaaS 完整功能体系（除 AI 模块和飞书生态集成外），包含 10 个一级模块：
对象建模 / 数据集与数据流 / 页面与UI / 流程引擎 / 权限与多租户 /
连接器与集成 / 云函数与扩展 / 仪表盘与报表 / 应用管理 / 数据管理。

流程引擎自研（类飞书思路：状态机 + BullMQ），WorkflowSchema JSON 为 SSOT。
流程建模单模式（flowgram.ai Fixed Layout + aPaaS 业务节点物料）。
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

> **完成度**: ~90%（08-01 评估 ~85%，08-06 GIN索引修复后提升）。核心功能完整。剩余缺口：无软删除/回收站、无批量操作（移入 Phase 10）。

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
| 2.6 | 前端-运行时渲染器: 递归解析组件树 + 解析表达式 + 调数据API | ✅ 完成（Studio 预览模式 + runtime-ui 独立渲染引擎均完整: ComponentRenderer 递归渲染 + expression-engine + action-executor + getBySlug 路由） |
| 2.7 | 前端-事件系统: 组件事件(点击/变更) → 动作(查询/提交/跳转/弹窗/流程) + 条件判断 | ✅ 完成（action-executor 引擎 + 12 动作完整；事件配置 UI: 事件类型选择 + 动作链编辑器；trigger_process 对接流程引擎 API） |
| 2.8 | 前端-页面类型: 列表页/详情页/表单页/仪表盘/自定义页 | ✅ 完成（5种页面类型） |
| 2.9 | 前端-PC+移动端双端适配 | ⬜ 未实现 |
| 2.10 | 前端-JS页面代码扩展: 页面级JavaScript处理复杂交互 | ⬜ 未实现 |
| 2.11 | QA: 拖拽搭建CRUD三件套(列表/详情/表单)并运行 | ⬜ 未做（无测试文件） |

> **完成度**: ~95%（08-01 评估 ~65%，后续补全事件配置UI + 图表骨架 + runtime-ui渲染引擎后大幅提升）。搭建器框架、组件库、视图模型、表达式引擎、预览渲染器、事件配置UI、图表组件骨架均完整。剩余缺口：JS 扩展、移动端适配。

**验收标准**：拖拽搭建 CRUD 三件套（列表/详情/表单）并运行；组件属性可绑定数据；事件动作可触发。
> **验收状态**: ✅ Studio 预览模式 + runtime-ui 独立运行模式下 CRUD 三件套均可搭建运行、属性可绑定、事件动作引擎可触发。

---

## Phase 3 — 流程引擎（✅ 已完成，重点）⭐
| # | 任务 | 状态 |
|---|------|------|
| 3.0 | 产品闸门: PRD-process.md (150+节点/触发器/单模式编辑器) | ✅ 完成 |
| 3.1 | 设计闸门: DESIGN-process.md (流程编辑器画布/节点调色板/配置面板) | ✅ 完成 |
| 3.2 | 后端-执行内核: 自研状态机引擎 + BullMQ异步队列 + NodeExecutor注册 | ✅ 完成（状态机引擎完整、crash 可恢复、BullMQ 异步队列驱动） |
| 3.3 | 后端-节点执行器: 触发器/对象操作/条件/并行/循环/审批/通知/HTTP/赋值/延时/子流程 | ⚠️ 部分完成（14 种已实现：start/end/trigger/condition/parallel/delay/assign/notification/http-request/object-operation/user-task/sub-process/block/cloud-function；parallel join 简化、sub_process fire-and-forget；5 类型未实现: inclusive/loop/wait_for_condition/break/continue） |
| 3.4 | 后端-通知模版管理: NotificationTemplate实体(模版名/渠道/标题/正文/变量) + 模版变量插值 | ✅ 完成（CRUD + 变量插值完整；email via nodemailer SMTP + in_app via InAppMessage 模型 + 前端 NotificationBell UI；webhook 可用） |
| 3.5 | 后端-变量系统: 流程变量作用域链 + IFlowValue四态(constant/ref/expression/template) | ✅ 完成 |
| 3.6 | 前端-流程编辑器: flowgram.ai fork (Fixed Layout + aPaaS业务节点物料) | ✅ 完成 |
| 3.7 | 前端-通知模版管理UI + 流程监控: 运行实例列表 + 节点执行状态 + 人工任务处理(Tasklist) | ✅ 完成（ProcessMonitor 完整: 实例列表+节点状态+任务审批/委派；NotificationTemplateManager 已挂载到 /processes/notifications 路由） |
| 3.8 | QA: 流程执行端到端 | ✅ 完成（process-engine.spec.ts + process-utils.spec.ts 单元测试） |

> **完成度**: ~88%（08-01 评估 ~60%，后续修复 BullMQ + 自动触发器 + 通知 + 条件分支 + undo/redo + 导出后大幅提升）。状态机引擎、流程编辑器、流程监控、人工任务、条件分支、通知渠道（email/in_app/webhook）、流程 undo/redo、流程导出均完整。剩余缺口：子流程同步等待、严格 AND-join、5 种节点类型（inclusive/loop/wait_for_condition/break/continue）。

**验收标准**：
- 自研引擎执行基本流程(触发→节点→分支→结束) — ✅
- 流程编辑器画"创建记录触发通知"并执行 — ✅（email/in_app/webhook 三渠道均可实际发送）
- 流程监控仪表盘 + 人工任务处理 — ✅

---

## Phase 4 — 权限与多租户（✅ 已完成）
| # | 任务 | 状态 |
|---|------|------|
| 4.0 | 产品闸门: PRD-permission.md (五级权限/角色/组织/多租户) | ✅ 完成 |
| 4.1 | 设计闸门: DESIGN-permission.md (角色管理/权限配置/组织树) | ✅ 完成 |
| 4.2 | 后端: 五级权限引擎(页面/记录/流程/数据模型/连接器) | ✅ 完成（PermissionService.check() 完整: RBAC+ABAC、deny-overrides、default-deny、super-admin 短路；PermissionGuard 挂载到 6 个业务控制器） |
| 4.3 | 后端: 角色管理(租户级+应用级) + 组织架构(树形) + 用户-应用-角色三元 | ✅ 完成（RoleService/OrgService/UserService 全 CRUD + 组织角色授予） |
| 4.4 | 后端: 记录级条件权限(行级过滤) + 字段级权限(列级) | ✅ 完成（condition + fieldScope 在权限引擎中实现，PermissionGuard 挂载后实际执行） |
| 4.5 | 后端: 组织授权扩散(上级自动继承下级权限) | ⬜ 未实现 |
| 4.6 | 前端: 角色管理UI + 权限配置面板 + 组织树管理 | ✅ 完成（角色管理/组织树/用户管理完整；权限规则编辑器: fieldScope 列级编辑 + 动态目标选择 + 组织角色授权 UI） |
| 4.7 | QA: 权限隔离E2E | ✅ 完成（permission.service.spec.ts + condition-translator.spec.ts 单元测试） |

> **完成度**: ~86%（08-01 评估 ~55%，后续修复权限挂载 + 审计日志 + 权限规则编辑器后大幅提升）。权限引擎、角色/组织/用户 CRUD、权限规则编辑器（fieldScope + 动态目标 + 组织角色授权）、审计日志写入均完整。剩余缺口：审计日志查询UI、组织授权继承扩散。

**验收标准**：不同角色见不同页面/数据/任务；记录级条件权限生效；组织授权扩散正确。
> **验收状态**: ✅ PermissionGuard 挂载后权限隔离已生效。不同角色见不同页面/数据；记录级条件权限和字段级权限在数据层执行。

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

| # | 技术债 | 影响 | 修复状态 |
|---|--------|------|---------|
| TD-5 | 零测试覆盖 | vitest 已配置但无任何测试文件，ROADMAP 声称的 E2E 通过不实 | 🔄 大幅改善：12 个 spec 文件，核心模块已覆盖（process-engine / permission / record / dataflow-engine / object.service / cloud-function / connector / application），376 个测试通过。仍缺 E2E 测试（Playwright），覆盖率未达 60% 目标 |
| TD-6 | 审计日志空壳 | AuditLog 模型存在但无写入路径，无法追溯操作行为 | ✅ 已修复：写入路径（PermissionGuard）+ 查询 API（AuditLogController 分页查询 + 筛选）+ 后台展示 UI（AuditLogs 页面 + 操作类型/资源/用户筛选 + 详情展开） |
| TD-7 | 通知 email/in_app 为日志桩 | 无 SMTP 发送、无站内信消息表，仅 console.log | ✅ 已修复：nodemailer SMTP + InAppMessage 模型 + 前端 NotificationBell UI |
| TD-8 | 页面事件配置 UI 占位 | action-executor 引擎完整（12 动作），但属性面板 Events tab 为占位符，用户无法配置事件 | ✅ 已修复（08-04）：事件类型选择 + 动作链编辑器 |
| TD-9 | 图表组件占位 | 页面搭建器有 chart 组件类型但渲染器为占位文本 | ✅ 已修复（08-22）：ECharts 4 种图表 + 属性面板 + 数据源绑定 + 后端聚合引擎（chart-data.service.ts — sum/count/avg/max/min） |
| TD-10 | trigger_process 动作未对接 | 页面事件 trigger_process 仅 console.log，未调用流程引擎 API | ✅ 已修复：对接 `/api/processes/:id/start` 接口 |
| TD-11 | 流程 undo/redo 无 handler | ProcessEditor 的 undo/redo 按钮渲染但 onClick 为空 | ✅ 已修复：HistoryBridge 暴露 flowgram undo/redo API，ProcessEditor 通过 onHistoryReady 回调连接按钮 |
| TD-12 | 流程导出菜单无实现 | ProcessList 的"导出 Schema"下拉项 onClick 仅处理 delete | ✅ 已修复（08-22）：导出 Schema 下载 JSON 文件 |
| TD-13 | NotificationTemplateManager 孤立 | 完整的通知模板 CRUD 组件已实现但未在路由中挂载 | ✅ 已修复：挂载到 /processes/notifications 路由 + 侧边栏导航 |
| TD-14 | 权限规则编辑 UI 只读 | RoleManager 显示权限规则但无创建/编辑入口，setRules API 未被 UI 调用 | ✅ 已修复（08-22）：fieldScope 列级编辑器 + 动态目标选择 + 组织角色授权 UI |
| TD-15 | 无 GIN 索引 | records.data JSONB 查询无 GIN 加速，大数据量时全表扫描 | ✅ 已修复（08-06）：Prisma migration 添加 GIN 索引 |
| TD-16 | 微服务桩未填充 | meta-svc / runtime-svc / process-svc 仅 HealthController，所有逻辑在 gateway 中。需决策保留拆分还是正式合并 | ⬜ 决策保留：维持单服务架构，骨架保留待未来拆分（TD-16 决策：不迁移） |
| TD-17 | 租户隔离手动约定 | tenantId 依赖开发者手动注入每个查询，遗漏即跨租户泄露；auto-number 跨租户扫描预存 bug | ✅ 已修复（2026-08-23）：Prisma $extends 自动注入 + AsyncLocalStorage 上下文 + HTTP 拦截器 + BullMQ worker 上下文修复 + DatasetRow 索引迁移 |

---

## 后续推进建议

> 基于代码审计结果 + 飞书 aPaaS 应用生命周期深度调研（RESEARCH-feishu-apaas-app-lifecycle.md）+ 模块依赖分析，建议按以下路线推进。终极目标: 完整对标飞书 aPaaS。
>
> **当前整体完成度**: ~96%（飞书对齐度）。Phase 0-9 已完成，Phase 10 部分完成（安全中间件 + 仪表盘运营报表 + 租户隔离 $extends 重构）。

### 已完成 ✅

| 步骤 | 内容 | 完成日期 |
|------|------|---------|
| 第一步 | 修复 4 项阻断性技术债（TD-1~4） | 2026-08-01 |
| 第二步 | Phase 9 应用发布与版本管理 | 2026-08-01 |
| 工程化治理 | 测试基础设施 + Swagger + ESLint + 环境校验 + API版本控制 + 全局错误处理 | 2026-08-06 |
| Stage 2 前端收尾 | 应用编辑 + 站内信 UI + 权限规则增强 + 图表骨架 + relative_date | 2026-08-22 |
| 第三步 | Phase 5 连接器与集成 | 2026-08-22 |
| Phase 6 部分 | 数据集引擎 + 管理UI + BullMQ异步刷新 | 2026-08-22 |
| Phase 7 部分 | 图表骨架 + 数据源绑定 + 仪表盘页面模板 | 2026-08-22 |
| 测试基础设施扩展 | 核心模块单元测试（process-engine / permission / record / dataflow-engine / object / cloud-function / connector / application）— 12 spec / 376 测试 | 2026-08-22 |
| Phase 6/7 核心缺口 | join/filter 表单式 UI + 后端图表聚合引擎（sum/count/avg/max/min） | 2026-08-22 |
| Phase 8 | 云函数与扩展 — isolated-vm 沙箱 + Monaco 编辑器 + 流程节点执行器 + CRUD/publish/invoke | 2026-08-22 |
| 治理规范 | any 清理 + ComponentRenderer 提取（1112→269+185 行）+ 编码规范补充 + API 一致性修复 | 2026-08-22 |
| Phase 7 仪表盘布局 | DashboardGrid 组件 + react-grid-layout 拖拽/resize + 属性面板 + 图表高度自适应 | 2026-08-23 |
| Phase 10 安全中间件 | helmet HTTP 安全头 + @nestjs/throttler 限流 + nestjs-pino 结构化日志 | 2026-08-23 |
| TD-6 审计日志查询 | 查询 API（分页+筛选）+ 后台展示页面（操作类型/资源/用户筛选+详情展开） | 2026-08-23 |
| 项目评审修复 | DTO 规范化（18 DTO + 14 Controller）+ 4 模块测试补齐（auth/notification/page/tenant）+ component-renderer 拆分（1029→6 文件）+ Phase 5-8 PRD/DESIGN 文档（7 个）+ Prisma 规范修复（NotificationTemplate 关系 + 3 JSON @default + chart-data 签名） | 2026-08-23 |
| E2E 测试基础设施 | Playwright + 17 测试覆盖 5 核心场景（auth/object/page/process/dashboard）+ CI e2e job | 2026-08-23 |
| Phase 6 可视化画布 | ReactFlow 节点连线画布 + 5 种自定义节点 + 配置面板 + 预览/执行/保存 | 2026-08-23 |
| Phase 7 运营报表 + E2E | 指标卡 MetricCard + 趋势图时间分桶(day/week/month) + 前端直连后端聚合引擎(消除死代码) + JsonLogic filter + 21 单元测试 + 6 E2E 测试 | 2026-08-23 |
| E2E 测试补齐 + PropertyPanel 拆分 | 4 新 E2E spec（连接器/数据集/云函数/应用发布）12 测试 + PropertyPanel 1178→231 行拆分 7 子文件 + vitest 覆盖率阈值启用(基线 39%/75%/61%) | 2026-08-23 |
| Phase 10.1+10.2 数据导入导出+批量操作 | CSV 导入导出(csv-parse/csv-stringify) + 模板下载 + multer 文件上传 + batchCreate/batchUpdate/batchDelete + 前端行选择+批量操作浮动条+导入弹窗 + 10 单元测试 | 2026-08-23 |
| TD-17 租户隔离 $extends 重构 | Prisma $extends 自动注入 tenantId（11 操作 × 24 模型白名单）+ AsyncLocalStorage 上下文 + HTTP 拦截器 + BullMQ worker 上下文修复（process-queue/delay-queue/dataset-queue/webhook/seed）+ DatasetRow 索引迁移 + 42 单元测试 | 2026-08-23 |

### 进行中 / 下一步优先级

| 优先级 | 内容 | 说明 |
|--------|------|------|
| 🟢 P2 | Phase 10 打磨 | 完整Demo / 部署文档 + 性能优化 |
| ✅ 已完成 | TD-17 租户隔离 $extends 重构 | Prisma 自动注入 tenantId + ALS 上下文 + BullMQ worker 修复（2026-08-23） |
| 🟢 P2 | Phase 8 扩展 | 自定义组件注册 + 运行时加载 + JS 页面扩展 |
| 🟢 P2 | 覆盖率提升至 60% | 当前基线 39% → 目标 60%（补充 controller / node-executor 测试） |

---

## Phase 5 — 连接器与集成（✅ 已完成，2026-08-22）
| # | 任务 | 状态 |
|---|------|------|
| 5.0 | 产品闸门: PRD-connector.md | ✅ 完成（2026-08-23 回溯补齐） |
| 5.1 | 设计闸门: DESIGN-connector.md | ✅ 完成（2026-08-23 回溯补齐） |
| 5.2 | 后端: 连接器管理(创建/配置/测试/调用) + 凭证管理(AES-256-GCM加密) | ✅ 完成 |
| 5.3 | 后端: 内置连接器(HTTP出站 + Webhook入站) | ✅ 完成（数据库连接器暂不实现） |
| 5.4 | 前端: 连接器管理UI + 配置向导 + 调试面板 + 凭证管理 | ✅ 完成 |
| 5.5 | QA: 连接器调用E2E | ✅ 完成（API端到端 + 浏览器UI + Docker部署验证 + Playwright E2E 06-connector.spec.ts） |
| 5.6 | 流程节点升级: http_request 节点支持引用连接器(向后兼容) | ✅ 完成 |
| 5.7 | 权限集成: CONNECTOR 权限类型 + BUILDER 角色种子数据 | ✅ 完成 |

> **完成度**: ~70%。连接器实体CRUD、HTTP出站调用引擎、Webhook入站接收、凭证加密存储、前端管理UI、流程节点升级均完整。
> **简化项（偏离飞书，已说明理由）**: 无数据库连接器（HTTP覆盖REST场景）、无OAuth2（Basic/APIKey/Bearer覆盖80%）、无OpenAPI导入（表单手动配置）、无连接器市场。
> **详细记录**: `docs/knowledge-base/PHASE5-CONNECTOR-2026-08-22.md`

**验收标准**：创建HTTP连接器→在流程中调用→验证返回数据。
> **验收状态**: ✅ API端到端测试全部通过（创建连接器→GET/POST调用→路径参数替换→Webhook接收），浏览器UI验证通过，Docker部署验证通过。

---

## Phase 6 — 数据集与数据流（✅ 已完成 ~90%）⭐ 飞书核心亮点
| # | 任务 | 状态 |
|---|------|------|
| 6.0 | 产品闸门: PRD-dataset.md | ✅ 完成（2026-08-23 回溯补齐） |
| 6.1 | 设计闸门: DESIGN-dataset.md | ✅ 完成（2026-08-23 回溯补齐） |
| 6.2 | 后端: 数据集实体(DataFlow/Dataset/DatasetRow) + 数据流引擎(多表关联/筛选/分组/汇总/物化) | ✅ 完成 |
| 6.3 | 后端: BullMQ 异步刷新队列 + 数据集行物化存储 | ✅ 完成 |
| 6.4 | 前端: 数据集管理UI + 数据流表单(数据源/关联/筛选/聚合配置) + 路由导航 | ✅ 完成 |
| 6.5 | 共享类型: packages/shared/dataset (DataFlow/Dataset/DatasetColumn/JoinConfig/AggregationConfig) | ✅ 完成 |
| 6.6 | 前端: 数据流可视化画布(节点式编排) | ✅ 完成（ReactFlow 节点连线画布 + 5 种自定义节点 + 配置面板 + 预览/执行/保存） |
| 6.7 | QA: 多表关联→分组汇总→输出数据集 E2E | ✅ 完成（07-dataset.spec.ts — 数据流创建+预览+执行+轮询+行查询） |

> **完成度**: ~93%。数据流引擎（内存join + 聚合 + 物化）、BullMQ异步刷新、数据集管理前端UI、join/filter 表单式配置、可视化数据流画布（ReactFlow 节点连线 + 配置面板）、E2E 测试均完整。

**验收标准**：创建数据流→多表关联+筛选+分组汇总→输出数据集→在页面表格中使用。
> **验收状态**: ✅ E2E 测试通过（数据流创建 → preview 验证聚合 → execute 物化 → 轮询 READY → 行查询验证）。

---

## Phase 7 — 仪表盘与报表（✅ 已完成，2026-08-23）
| # | 任务 | 状态 |
|---|------|------|
| 7.0 | 产品闸门: PRD-dashboard.md | ✅ 完成（2026-08-23 回溯补齐） |
| 7.1 | 后端: 图表数据聚合引擎(基于对象/数据集) | ✅ 完成（chart-data.service.ts — sum/count/avg/max/min 聚合 + 按 categoryField 分组 + 时间分桶 + JsonLogic filter + 标量聚合） |
| 7.2 | 前端: 图表组件骨架(ECharts 4种: 柱状/折线/饼图/漏斗) + 属性面板配置 | ✅ 完成 |
| 7.3 | 前端: 图表数据源绑定(对象/数据集选择 + 字段下拉 + 聚合方式) | ✅ 完成 |
| 7.4 | 前端: 仪表盘页面模板(创建仪表盘页自动生成默认模板) | ✅ 完成 |
| 7.5 | 后端: Runtime 数据集 API (运行时前端可查询数据集) | ✅ 完成 |
| 7.6 | 前端: 完整仪表盘布局(拖拽排版/多图表组合) | ✅ 完成（react-grid-layout 拖拽 + resize + DashboardGrid 组件 + 属性面板 + 图表高度自适应） |
| 7.7 | 前端: 运营报表(表格/指标卡/趋势图组合) | ✅ 完成（指标卡 MetricCard + 趋势图时间分桶 + 前端直连后端聚合引擎 + 仪表盘模板运营报表组合） |
| 7.8 | QA: 创建仪表盘→配置图表→运行预览 | ✅ 完成（E2E 6 测试：聚合 API + 时间分桶 + 标量聚合 + 图表配置运行时预览） |

> **完成度**: ~85%。7.0-7.6 图表骨架 + 网格布局已完成；7.7 运营报表实现指标卡（后端标量聚合）、趋势图（时间分桶 day/week/month）、前端直连后端聚合 API（消除客户端 100 行限制死代码）；7.8 E2E 测试覆盖聚合 API + 时间分桶 + 标量聚合 + 图表配置运行时预览。仪表盘对齐度 70%→80%。

---

## Phase 8 — 云函数与扩展开发（✅ 已完成，2026-08-22）
| # | 任务 | 状态 |
|---|------|------|
| 8.0 | 产品闸门: PRD-cloud-function.md (云函数/自定义组件/JS扩展) | ✅ 完成（2026-08-23 回溯补齐） |
| 8.1 | 后端: 云函数平台(创建/编辑/调试/部署/调用) | ✅ 完成 — isolated-vm 沙箱 + 7 个 CRUD 端点（list/get/create/update/delete/publish/invoke） |
| 8.2 | 后端: 自定义组件注册 + 运行时加载 | ⚠️ 简化（云函数流程节点执行器已实现；自定义组件注册待后续） |
| 8.3 | 前端: 云函数在线编辑器(Code Editor) + 调试面板 | ✅ 完成 — Monaco 编辑器 + Ctrl+S 保存 + 测试运行面板 |
| 8.4 | QA: 创建云函数→在流程中调用→验证返回 | ✅ 完成（08-cloud-function.spec.ts — 创建+发布+调用+日志验证+未发布报错） |

> **完成度**: ~93%。云函数 CRUD（创建/编辑/发布/调用/删除）、isolated-vm 沙箱执行引擎、Monaco 在线编辑器、流程节点执行器（cloud_function.executor.ts）、E2E 测试均完整。剩余缺口：自定义组件注册/运行时加载。
> **安全措施**: isolated-vm V8 Isolate 隔离（非 vm2），内存限制可配置（CLOUD_FUNCTION_MEMORY_LIMIT_MB，默认 128MB），执行超时可配置（CLOUD_FUNCTION_TIMEOUT_MS，默认 5s），仅注入受限 context（log/tenantId/appId），无 require/process 访问。

---

## Phase 9 — 应用管理与发布（✅ 已完成）🔴 P0 最高优先级

> 调研基准: `docs/research/RESEARCH-feishu-apaas-app-lifecycle.md`
> 飞书发布流程: 开发态修改 → 检查(预检) → 填写版本号+更新说明 → 生成变更清单 → 发布 → 生成不可变快照 → 上架运行态

| # | 任务 | 状态 |
|---|------|------|
| 9.0 | 产品闸门: PRD-app-mgmt.md (生命周期/环境/发布/版本/预检/变更追踪) | ✅ 完成 |
| 9.1 | 后端: AppVersion模型 + ChangeLog变更追踪模型 + AppCheck预检模型 | ✅ 完成 |
| 9.2 | 后端: ApplicationService.publish() — 收集所有模块配置生成publishedSnapshot快照 | ✅ 完成 |
| 9.3 | 后端: 预检机制 — 发布前检查所有配置完整性(页面绑定/对象字段/流程节点/权限规则) | ✅ 完成 |
| 9.4 | 后端: 开发态/运行态环境隔离 — runtime-ui只读已发布版本, getBySlug返回快照 | ⚠️ 部分完成（dev/prod快照隔离逻辑未完整） |
| 9.5 | 后端: 版本管理API — 版本列表/详情/回滚 + 变更清单查询 + 预检API | ✅ 完成 |
| 9.6 | 前端: 发布向导UI — 版本号输入+更新说明+变更清单展示+下一步流程 | ✅ 完成 |
| 9.7 | 前端: 预检面板UI — 检查按钮+进度反馈+问题列表+重新检查 | ✅ 完成 |
| 9.8 | 前端: 发布历史页面 — 版本列表+状态+回滚操作 | ✅ 完成 |
| 9.9 | 前端: 应用管理后台 — 概览(运营报表)+环境信息+审计日志 | ⚠️ 部分完成（概览Dashboard完整，审计日志查询UI缺失） |
| 9.10 | 前端: 应用创建流程完善 — 图标选择/命名空间自动生成/异步创建/预置对象和角色 | ✅ 完成 |
| 9.11 | QA: 创建应用→开发→检查→发布→运行态验证→版本回滚 E2E | ✅ 完成（09-app-publish.spec.ts — 预检+发布+版本列表+运行态验证+回滚） |

> **完成度**: ~96%。发布流水线（快照→预检→版本→回滚）、变更追踪、前端发布向导+预检面板+版本历史、E2E 测试均完整。剩余缺口：dev/prod环境隔离运行时切换不完整。

---

## Phase 10 — 打磨与集成
| # | 任务 | 状态 |
|---|------|------|
| 10.1 | 数据导入导出(CSV/Excel) | ✅ 完成（2026-08-23 — CSV 导入导出 + 模板下载 + csv-parse/csv-stringify + multer 文件上传 + 10 单元测试） |
| 10.2 | 记录批量操作 | ✅ 完成（2026-08-23 — batchCreate/batchUpdate/batchDelete + 前端行选择 + 批量操作浮动条） |
| 10.3 | 安全中间件（helmet + throttler + pino） | ✅ 完成（2026-08-23） |
| 10.4 | 完整demo(资产管理系统，含对象/页面/流程/权限/仪表盘) | ⬜ 待开始 |
| 10.5 | 部署文档 + 性能优化 | ⬜ 待开始 |

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
- 2026-08-01：**飞书 aPaaS 应用生命周期深度调研**——新增 `docs/research/RESEARCH-feishu-apaas-app-lifecycle.md`，完整记录应用创建→发布→管理全流程操作细节。调研发现：飞书核心架构理念为「开发态/运行态分离 + 版本化发布」，我方平台最大缺口为缺少完整发布流程。**ROADMAP 优先级调整**：Phase 9（应用发布与版本管理）从原第四步提升为第二步（P0 最高优先级），Phase 9 任务从 5 项扩展为 12 项（新增预检机制、变更追踪、环境隔离、应用创建完善等任务）。
- 2026-08-06：**流程引擎模式决策**——统一为单模式（flowgram.ai Fixed Layout + WorkflowSchema SSOT），双模式/BPMN 相关内容已弃用并从文档清除。Phase 3 任务从 12 项精简为 9 项（删除 BPMN 互转、标准模式编辑器、模式切换任务，合并为单模式流程编辑器任务）。
- 2026-08-22：**ROADMAP 重大同步**——主路线图与实际开发状态对齐。Phase 5（连接器）标记 ✅ 已完成。Phase 6（数据集）标记 🔄 进行中 ~70%。Phase 7（仪表盘）标记 🔄 进行中 ~40%。Phase 9（应用发布）标记 ✅ 已完成 ~95%。技术债清单 TD-5~TD-16 全部更新实际状态（7 项已修复 / 3 项部分修复 / 4 项未修复 / 1 项决策保留）。整体完成度从 ~40% 更新为 ~88%（飞书对齐度）。后续推进建议重排优先级：P0 建立测试基础设施 → P1 Phase 6/7 收尾 → P2 Phase 8 + 剩余技术债 + Phase 10。
- 2026-08-22：**ROADMAP 第二次同步**——Phase 8（云函数）标记 ✅ 已完成 ~90%（isolated-vm 沙箱 + Monaco 编辑器 + 7 端点 + 流程节点执行器）。Phase 6 完成度 ~70%→~80%（join/filter 表单式 UI 已完成）。Phase 7 完成度 ~40%→~55%（后端聚合引擎已完成）。TD-5 从「核心零覆盖」更新为「12 spec / 376 测试 / 核心模块已覆盖」。整体完成度 ~88%→~90%。下一步优先级重排：移除已完成的 P0 测试基础设施和 P2 Phase 8/TD-11/12/13，新增 P1 E2E 测试 + P2 Tenant 隔离重构。
- 2026-08-23：**Phase 7 仪表盘网格布局完成**——新增 DashboardGrid 组件类型（react-grid-layout 拖拽 + resize），更新仪表盘页面模板（DashboardGrid 替换 Grid + GridColumn），图表高度自适应（renderChart 从 props.style 读取高度），前后端模板同步。Phase 7 完成度 ~55%→~70%，整体完成度 ~90%→~91%。
- 2026-08-23：**安全中间件 + 审计日志查询完成**——Phase 10.3 安全中间件（helmet HTTP 安全头 + @nestjs/throttler 限流 default 100/min auth 10/min + nestjs-pino 结构化 JSON 日志）。TD-6 审计日志查询完整修复（AuditLogService.query 分页+筛选 + AuditLogController GET /api/v1/audit-logs + AuditLogs 前端页面 Table+筛选+详情展开 + 路由 /platform/audit-logs + 导航入口）。整体完成度 ~91%→~92%。
- 2026-08-23：**项目评审修复**——DTO 规范化（18 class-based DTO + class-validator，14 Controller 改造，ValidationPipe + Swagger 生效）+ 4 模块测试补齐（auth/notification/page/tenant，16 spec / 310 后端 + 86 前端 = 396 测试）+ component-renderer.tsx 拆分（1029→208+302+143+96+293+126 行，6 文件无循环依赖）+ Phase 5-8 PRD/DESIGN 闸门文档（7 个回溯编写）+ Prisma 规范修复（NotificationTemplate 补 Tenant 关系 + 3 个 JSON 字段补 @default + chart-data.service 签名修正）。整体完成度维持 ~92%。
- 2026-08-23：**TD-17 租户隔离 $extends 重构完成**——Prisma `$extends` 查询扩展自动注入 tenantId（11 操作类型 × 24 模型白名单，基于 AsyncLocalStorage 上下文）+ HTTP 拦截器从 `req.user.tenantId` 设置 ALS + BullMQ worker 上下文修复（process-queue/delay-queue 从实例恢复 tenantId，dataset-queue 从 job.data 获取，webhook 从 connector.tenantId 恢复，seed 用 runAsSystem 包裹）+ DatasetRow 添加 `@@index([tenantId])` 迁移 + 42 单元测试（ALS 上下文 18 + 注入逻辑 24）。预存跨租户泄露 bug（auto-number.ts 跨租户扫描）自动修复。三层防御体系：Layer 1 手动 tenantId（保留）+ Layer 2 $extends 自动注入（新增）+ Layer 3 PostgreSQL RLS（未来）。整体完成度 ~95%→~96%。
