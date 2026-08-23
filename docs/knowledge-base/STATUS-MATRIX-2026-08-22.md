# aPaaS 平台功能完成度矩阵 — 2026-08-22

> 基于 2026-08-06 矩阵更新，反映 08-22 Stage 2 前端收尾 + Phase 5 连接器 + Phase 6 数据集 + Phase 7 仪表盘骨架 + 测试基础设施增量。

## 总体完成度

**整体项目完成度约 91%**（↑11%），Phase 0-5 + Phase 8 + Phase 9 核心功能已实现并可用，Phase 6（数据集）~80%，Phase 7（仪表盘）~70%。阻断性技术债全部修复，工程化治理完成，Stage 2 前端补全完成，Phase 8 云函数已完成，核心模块单元测试已建立（12 spec / 376 测试），仪表盘网格布局已完成。当前最大风险：E2E 测试缺失 + 运营报表未实现。

---

## 一、后端（apps/gateway）

### 认证模块（auth）：进度 85%
- ✅ JWT 登录（email + password + bcrypt）
- ✅ JwtStrategy 签发/校验 token，注入 AuthenticatedUser（含 tenantId/roleIds/isSuperAdmin）
- ✅ 请求拦截器 + 401 响应处理
- ✅ 环境变量 Joi 校验（fail-fast）
- ✅ API 版本控制 /api/v1/
- ❌ 缺少刷新 token 机制
- ❌ 缺少 SSO / OAuth 第三方登录
- ❌ 缺少密码重置 / 邮箱验证流程

### 对象/数据建模模块（object）：进度 90%
- ✅ 对象 CRUD（含租户隔离）
- ✅ 字段 CRUD（JSON 数组存储，18 种 FieldType 全支持）
- ✅ 视图 CRUD（6 种 ViewType，含租户隔离）
- ✅ 公式引擎（expr-eval，支持算术/逻辑/字符串表达式）
- ✅ 自动编号引擎（支持 `ORD-{seq:0000}` 格式、日期 token、前缀解析）
- ❌ Rollup 汇总字段仅存储元数据，运行时无聚合计算
- ❌ 缺少对象关联完整性校验（如 lookup 外键约束）

### 记录模块（record）：进度 85%
- ✅ JSONB 宽表记录 CRUD
- ✅ 动态查询（14 种 FilterOperator、AND/OR 组合、全文搜索）
- ✅ 分页、排序
- ✅ 公式字段自动计算、自动编号字段自动生成
- ✅ 行级权限条件注入
- ✅ 字段级权限投影
- ❌ JSONB 自定义字段排序不生效（仅按整体 data 列排序）
- ❌ 缺少批量操作（批量创建/更新/删除）
- ❌ 缺少数据导入/导出

### 页面模块（page）：进度 95%
- ✅ 页面 CRUD + 发布/取消发布
- ✅ getBySlug 运行时查询
- ✅ Schema JSON 存取
- ✅ ChangeLog 变更追踪
- ✅ 仪表盘页面模板自动生成（08-22 新增）
- ❌ 缺少页面版本管理（仅 isPublished 布尔值）

### 流程引擎模块（process）：进度 88%（↑6%）
- ✅ 流程定义 CRUD + 发布
- ✅ 状态机引擎（token 流转、变量作用域、节点执行状态追踪）
- ✅ BullMQ 异步队列（PROCESS_QUEUE + DELAY_QUEUE）
- ✅ 14 种节点执行器（assign / block / cloud-function / condition / delay / end / http-request / notification / object-operation / parallel / start / sub-process / trigger / user-task）
- ✅ 流程实例管理（启动 / 取消 / 轮询状态）
- ✅ 人工任务（待办 / 审批 / 转办）
- ✅ 通知模板 CRUD + 变量插值渲染
- ✅ 定时触发器
- ✅ 通知 email + in_app 渠道
- ✅ ChangeLog 变更追踪
- ✅ 流程监控 + 终止
- ✅ 审批抄送（onApprove/onReject/onComplete）
- ✅ 条件表达式可视化模式（react-awesome-query-builder + JsonLogic）
- ✅ 流程轨迹查询
- ✅ http_request 节点连接器模式（08-22 新增 — 双模式：连接器引用 / 直连 fetch）
- ✅ relative_date 操作符 + date 类型映射修复（08-22 新增）
- ❌ 子流程同步等待未实现（启动后立即继续）
- ❌ 并行汇聚为简化策略（首个 token 到达即执行，非严格 AND-join）
- ❌ 5 种节点类型未实现执行器：inclusive / loop / wait_for_condition / break / continue

### 权限模块（permission）：进度 86%（↑6%）
- ✅ 五级权限引擎（RBAC + ABAC，Deny-overrides 策略）
- ✅ PermissionGuard 挂载到 6 个业务控制器
- ✅ 角色 CRUD + 组织树 CRUD + 用户 CRUD
- ✅ 权限规则管理（getRules / setRules）
- ✅ 租户隔离（审计已修复全部漏洞）
- ✅ 行级权限条件在数据层执行
- ✅ 字段级权限在数据层执行
- ✅ 审计日志写入路径
- ✅ 权限规则编辑器 UI — fieldScope 列级编辑器（08-22 新增）
- ✅ 权限规则编辑器 UI — 按类型动态目标选择（08-22 新增 — PAGE→页面列表 / PROCESS→流程列表 / CONNECTOR→连接器列表）
- ✅ 组织角色授权 UI（08-22 新增 — 查看列表 + 添加 + 撤销）
- ✅ CONNECTOR 权限目标列表（08-22 新增）
- ✅ 审计日志查询 API + 后台展示 UI（08-23 新增 — AuditLogController 分页查询 + 操作/资源/用户筛选 + AuditLogs 页面 + 详情展开）
- ❌ 组织授权继承扩散未实现

### 应用发布模块（application）：进度 95%（↑5%）
- ✅ 应用 CRUD
- ✅ 发布流水线（快照收集 → 预检 → 版本记录 → 环境隔离）
- ✅ 快照服务 + 预检服务 + 版本管理 + 回滚
- ✅ 变更追踪（ChangeLog 表 + getChangeSet 聚合）
- ✅ ChangeLog 全模块集成
- ✅ 应用编辑入口（08-22 新增 — 卡片操作菜单 + 编辑 Modal + updateMutation）
- ❌ 缺少环境隔离的实际运行时切换（dev/prod 快照隔离逻辑未完整）

### 连接器模块（connector）：进度 70%（✨ 新增）
- ✅ 连接器实体 CRUD（创建/配置/测试/调用）
- ✅ HTTP 通用连接器（出站调用）
- ✅ Webhook 接收器（入站触发，token 验证）
- ✅ 凭证管理（Basic Auth / API Key / Bearer Token）
- ✅ 凭证加密存储（AES-256-GCM）
- ✅ HTTP 执行引擎（URL 构建 + 凭证注入 + 模板插值 + 超时）
- ✅ 流程节点升级：http_request 双模式（连接器引用 / 直连，向后兼容）
- ✅ 权限集成（CONNECTOR 权限类型，PermissionGuard 挂载）
- ✅ 前端管理 UI（列表 + 配置向导 + 调试面板 + 凭证管理）
- ❌ 数据库连接器暂不实现
- ❌ OAuth2 暂不实现
- ❌ OpenAPI 导入暂不实现
- ❌ 连接器市场暂不实现

### 云函数模块（cloud-function）：进度 90%（✨ 新增）
- ✅ 云函数 CRUD（创建/编辑/查询/删除/发布/调用 — 7 个端点）
- ✅ isolated-vm 沙箱执行引擎（V8 Isolate 隔离，非 vm2）
- ✅ 安全限制：内存限制可配置（CLOUD_FUNCTION_MEMORY_LIMIT_MB，默认 128MB）+ 执行超时可配置（CLOUD_FUNCTION_TIMEOUT_MS，默认 5s）+ 无 require/process 访问 + 仅注入受限 context（log/tenantId/appId）
- ✅ 流程节点执行器（cloud_function.executor.ts — 流程中可调用已发布云函数）
- ✅ Monaco 在线编辑器（@monaco-editor/react — 语法高亮 + Ctrl+S 保存快捷键）
- ✅ 测试运行面板（编辑器内直接调用并查看输出）
- ✅ 共享类型契约（packages/shared/cloud-function）
- ✅ 单元测试（cloud-function.service.spec.ts）
- ❌ 自定义组件注册 + 运行时加载未实现
- ❌ JS 页面代码扩展未实现
- ❌ E2E 测试未做

### 数据集模块（dataset）：进度 80%（↑10%）
- ✅ 数据集实体（DataFlow / Dataset / DatasetRow 三个模型）
- ✅ 数据流引擎（多表内存 join + 筛选 + 分组聚合 + 物化输出）
- ✅ BullMQ 异步刷新队列
- ✅ 数据集行物化存储（JSONB + GIN 索引）
- ✅ 数据集 API（dataflow CRUD + dataset CRUD + dataset-row 查询）
- ✅ Runtime 数据集查询 API（08-22 新增 — 运行时前端可查询数据集）
- ✅ 共享类型（DataFlow / Dataset / DatasetColumn / JoinConfig / AggregationConfig）
- ✅ 前端管理 UI（数据集列表 + 数据流表单 + 路由导航）
- ✅ join/filter 表单式配置 UI（08-22 新增 — DataFlowFormModal 多步骤表单：基本信息→数据源→关联→筛选→分组汇总→输出字段）
- ❌ 数据流可视化画布（节点式编排）未实现（当前为表单式配置）
- ❌ E2E 测试未做

### 队列模块（queue）：进度 95%
- ✅ BullMQ 队列配置（PROCESS_QUEUE + DELAY_QUEUE）
- ✅ ProcessProcessor 消费流程实例
- ✅ 延迟队列处理（delay 节点）
- ✅ 定时触发 job 处理
- ✅ 数据集刷新队列（08-22 新增）
- ❌ 缺少队列监控 / 重试策略 / 死信队列处理

### 全局错误处理：进度 100%
- ✅ AllExceptionsFilter 统一响应格式 `{ ok: false, error: { code, message } }`
- ✅ PrismaExceptionFilter 错误码转译（P2002→409 / P2025→404 / P2003→400）
- ✅ 全局 ValidationPipe（whitelist + transform + forbidNonWhelisted）

### API 文档：进度 100%
- ✅ @nestjs/swagger 集成，文档访问 `/api/docs`
- ✅ 13 个 Controller 标注 @ApiTags + @ApiBearerAuth（+cloud-function）
- ✅ LoginDto 作为 class-based DTO 范式（class-validator + Swagger 同时生效）

---

## 二、前端搭建器（packages/studio）

### 路由与页面框架：进度 100%
- ✅ 18 条路由全部有完整页面实现（+连接器 +数据集路由）

### 对象设计器 UI：进度 95%
- ✅ 对象/字段/视图/记录的 CRUD UI 全部完整（18 字段类型、6 视图类型、14 筛选操作符）
- ❌ 缺少用户编辑 UI

### 页面搭建器 UI：进度 95%（↑3%）
- ✅ 三栏布局 + 26 种组件渲染器 + dnd-kit 拖拽
- ✅ 属性面板 + 视图模型面板 + 表达式引擎 + 动作执行器（12 种 ActionType）
- ✅ 撤销/重做 + 页面模板自动生成
- ✅ 事件配置面板 UI（事件类型选择 + 动作链编辑器）
- ✅ 图表组件骨架（08-22 新增 — ECharts 4种图表 + 属性面板 + 数据源绑定）
- ❌ JS 页面代码扩展未实现
- ❌ 移动端适配未实现

### 流程编辑器 UI：进度 87%
- ✅ 基于 flowgram.ai 画布 + 9 种节点配置表单 + 四态值编辑器
- ✅ 流程监控 + 通知模板管理
- ✅ 条件表达式编辑器（RAQB 可视化模式）
- ✅ 画布分支标签条件文本 hover Tooltip 显示
- ✅ 嵌套组样式优化（浅色背景卡片 + 圆角按钮 + 色带层级）
- ❌ 4 种节点类型灰态"即将支持"（parallel / inclusive / loop / sub_process）

### 权限管理 UI：进度 85%（↑15%）
- ✅ 角色/组织/用户管理基本 UI
- ✅ 权限规则编辑器 — fieldScope 列级编辑器（08-22 新增）
- ✅ 权限规则编辑器 — 按类型动态目标选择（08-22 新增）
- ✅ 组织角色授权 UI（08-22 新增）
- ✅ 审计日志查询 UI（08-23 新增 — AuditLogs 页面 + 筛选 + 详情展开 + 路由 /platform/audit-logs）

### 应用管理 UI：进度 95%（↑3%）
- ✅ 应用列表 + Dashboard + 发布向导 + 预检面板 + 版本历史
- ✅ 应用删除入口
- ✅ 应用编辑入口（08-22 新增 — 卡片操作菜单 + 编辑 Modal）

### 连接器管理 UI：进度 95%（✨ 新增）
- ✅ 连接器列表页（双 Tab：连接器 + 凭证）
- ✅ 连接器创建/编辑表单（类型选择 + URL + 操作定义）
- ✅ 调试面板（操作选择器 + 调用按钮 + 结果展示）
- ✅ 凭证管理（创建/编辑/删除）
- ✅ http_request 节点配置表单升级（连接器选择器）

### 数据集管理 UI：进度 80%（↑5%）
- ✅ 数据集列表页
- ✅ 数据流表单（数据源选择 + 关联配置 + 筛选 + 聚合 + 输出列配置）
- ✅ 路由导航（侧边栏入口）
- ✅ join/filter 多步骤表单 UI（08-22 新增 — DataFlowFormModal：基本信息→数据源→关联→筛选→分组汇总→输出字段）
- ❌ 数据流可视化画布（节点式编排）未实现

### 云函数管理 UI：进度 90%（✨ 新增）
- ✅ 云函数列表页
- ✅ 云函数创建/编辑表单（CloudFunctionFormModal）
- ✅ Monaco 代码编辑器（语法高亮 + Ctrl+S 保存快捷键）
- ✅ 测试运行面板（编辑器内直接调用并查看输出）
- ✅ 发布/取消发布操作
- ❌ 自定义组件注册 UI 未实现
- ❌ JS 页面代码扩展 UI 未实现

---

## 三、运行时前端（packages/runtime-ui）

### 运行时 UI：进度 90%（↑3%）
- ✅ 5 条路由 + 页面渲染引擎（28 种组件）+ 表达式引擎 + 动作执行器 + 任务中心
- ✅ 站内信 UI（08-22 新增 — NotificationBell 组件 + Badge 铃铛 + Popover 消息列表 + 未读/全部筛选 + 标记已读，refetchOnWindowFocus 事件驱动刷新）
- ✅ 图表渲染（08-22 新增 — ECharts + ViewModel 绑定数据解析）
- ✅ 数据集查询 API 对接（08-22 新增）
- ❌ chart 组件完整聚合引擎属 Phase 7
- ❌ 无移动端适配

---

## 四、测试基础设施

### 测试覆盖：进度 35%（↑20%）
- ✅ Vitest 配置（gateway + studio）
- ✅ 12 个后端 spec 文件：formula-engine(25) / process-utils(23) / condition-translator(23) / jsonlogic-to-prisma(+relative_date 5) / process-engine / permission.service / record.service / dataflow-engine / object.service / application.service / cloud-function.service / connector.service
- ✅ 3 个前端 spec 文件：custom-logic-parser / jsonlogic-utils / query-builder-config
- ✅ tsconfig.check.json（spec 文件类型检查）
- ✅ 376 个测试全部通过
- ✅ Prisma Proxy mock 模式（无需真实数据库连接）
- ❌ 无集成测试
- ❌ 无 E2E 测试（Playwright）
- ❌ 覆盖率未达 60% 目标
- ❌ runtime-ui / shared / db 无测试脚本

### 代码规范与约束链：进度 100%
- ✅ ESLint 9 flat config + typescript-eslint + react/react-hooks
- ✅ Prettier + .editorconfig + .prettierignore
- ✅ husky pre-commit（lint-staged: eslint --fix + prettier --write）
- ✅ husky commit-msg（commitlint Conventional Commits + scope-enum 18 模块）
- ✅ husky pre-push（typecheck + test 全量检查）
- ✅ 所有包 lint 脚本 `--max-warnings 0`（0 warning 容忍）
- ✅ no-restricted-syntax 拦截 setInterval（事件驱动架构强制）

### 类型检查：进度 100%
- ✅ 11 个包 typecheck 脚本（tsc --noEmit）
- ✅ turbo.json typecheck 任务
- ✅ 根 package.json typecheck / format / format:check 脚本

### CI/CD：进度 100%
- ✅ .github/workflows/ci.yml（lint + typecheck + test + build）
- ✅ 含 PostgreSQL + Redis service container
- ✅ PR 模板（检查清单 + 飞书对齐标注）

---

## 五、基础设施与支撑

### 数据库（packages/db）：进度 93%（↑3%）
- ✅ Prisma schema 完整（29 model + 8 enum，+connector +dataset +cloud-function 模型）
- ✅ 9 个迁移文件 + GIN 索引
- ✅ 种子数据（platform superadmin + demo tenant + roles + test users）
- ❌ 种子数据覆盖 28 表中的部分

### 共享类型契约（packages/shared）：进度 100%
- ✅ 10 个模块完整类型定义（+connector +dataset +notification +cloud-function）
- ✅ stores 子路径（auth/query-client/expression-engine/action-executor/runtime-store）

### 微服务骨架（meta-svc / process-svc / runtime-svc）：进度 5%
- ✅ NestJS bootstrap + 健康检查端点
- ❌ 三个服务均为纯骨架，业务全在 gateway（TD-16 决策：保留骨架待拆分）

### 基础设施（infra）：进度 85%
- ✅ Docker Compose + 多阶段 Dockerfile + Nginx
- ✅ CI/CD 配置（GitHub Actions）
- ✅ 约束链（husky + lint-staged + commitlint + pre-push）
- ✅ Docker 部署文档 DEPLOY.md
- ❌ 无监控 / 告警 / 日志收集（生产前补齐）

### 文档（docs）：进度 75%（↑5%）
- ✅ PRD + DESIGN 覆盖 Phase 1-4 + Phase 9
- ✅ 架构总览 + 路线图 + 飞书调研
- ✅ 知识库目录（含架构分析、审计报告、阶段修复记录、完成度矩阵、编码原则）
- ✅ 编码规范（AGENTS.md 7 节规范条款）
- ❌ 缺少 Phase 5-8 的 PRD/DESIGN（跳过闸门直接开发）

---

## 六、总体进度汇总

| 模块 | 进度 | 关键缺口 |
|------|------|----------|
| 认证模块 | 85% | 缺 token 刷新、SSO、密码重置 |
| 对象/数据建模 | 90% | 缺 Rollup 聚合计算 |
| 记录模块 | 85% | 缺 JSONB 字段排序、批量操作、数据导入导出 |
| 页面模块 | 95% | 缺页面版本管理 |
| 流程引擎 | 88% | 缺子流程同步、严格 AND-join、5 种节点类型（inclusive/loop/wait_for_condition/break/continue） |
| 权限模块 | 88% | 缺组织授权扩散（审计日志查询已完成） |
| 应用发布 | 95% | 缺环境隔离运行时切换（审计日志查询已完成） |
| 连接器 | 70% | 缺数据库连接器、OAuth2、OpenAPI 导入、连接器市场 |
| 数据集 | 80% | 缺可视化数据流画布、E2E 测试 |
| 仪表盘 | 70% | 缺运营报表、E2E 测试 |
| 云函数 | 90% | 缺自定义组件注册、JS 页面扩展、E2E 测试 |
| 队列模块 | 95% | 缺队列监控、重试策略 |
| 全局错误处理 | 100% | 完整 |
| API 文档 | 100% | 完整 |
| Studio 前端 | 95% | 缺 JS 扩展、移动端、数据流可视化画布 |
| Runtime-UI | 90% | 缺完整图表聚合、移动端适配 |
| 测试基础设施 | 35% | E2E 未建，覆盖率 <60%，runtime-ui/shared/db 无测试 |
| 工程化治理 | 100% | 完整 |
| 数据库 | 93% | 种子数据覆盖不完整 |
| 共享类型 + stores | 100% | 完整 |
| 微服务骨架 | 5% | 三个服务纯骨架（决策保留） |
| 基础设施 | 85% | 缺监控/告警/日志（生产前） |
| 文档 | 75% | 缺 Phase 5-8 PRD |
| **整体** | **~92%** | Phase 6 收尾 + Phase 7 运营报表 + Phase 10 打磨 + E2E 测试 |

---

## 七、与飞书 aPaaS 对齐度

| 模块 | 飞书对应 | 08-06 对齐度 | 08-22 对齐度 | 变化原因 |
|------|----------|-------------|-------------|---------|
| 对象/数据建模 | A | 90% | 90% | — |
| 页面搭建器 | C | 92% | 95% | +图表组件骨架（4种图表 + 属性面板 + 数据源绑定） |
| 流程引擎 | D | 82% | 88% | +http_request 连接器模式 + relative_date 操作符 + date 类型映射修复 + 14 种节点执行器 + cloud-function 节点 + undo/redo + 流程导出 |
| 权限多租户 | E | 80% | 86% | +fieldScope UI + 动态目标 + 组织角色授权 + CONNECTOR 权限 |
| 应用发布 | I | 92% | 95% | +应用编辑入口 |
| 连接器 | F | 5% | 70% | +连接器实体 + HTTP出站 + Webhook入站 + 凭证加密 + 前端UI |
| 数据集 | B | 0% | 80% | +数据流引擎 + 物化存储 + 异步刷新 + 前端管理UI + join/filter表单式配置 |
| 仪表盘 | H | 5% | 70% | +图表骨架 + 数据源绑定 + 仪表盘页面模板 + Runtime数据集API + 后端聚合引擎 + 网格拖拽布局 |
| 云函数 | G | 5% | 90% | +isolated-vm沙箱 + Monaco编辑器 + CRUD/publish/invoke + 流程节点执行器 |
| 数据管理 | J | 40% | 40% | — |
| 飞书生态集成 | K | N/A | N/A | 独立平台，不依赖飞书 |

**整体飞书对齐度：约 92%**（08-06: ~80% → 08-23: ~92%，↑12%）

---

## 八、风险与下一步

### 当前最大风险

1. **🟡 E2E 测试缺失** — 核心模块单元测试已建立（12 spec / 376 测试），但无集成测试和 E2E 测试（Playwright），覆盖率未达 60% 目标。
2. **🟡 文档与实际状态脱节** — 本次更新前主路线图落后于最近 5 个 commit 的实际开发进度（现已修复）。
3. ~~上帝文件~~ ✅ 已解决 — SimplifiedEditor.tsx 已从 2054 行重构为 112 行 barrel 入口文件，逻辑拆分到 conditionBranchUtils.ts / nodeMetadata.ts / nodeCreation.ts / nodeRenderers.tsx / ApaasAdder.tsx / ConfigSidebar.tsx / EventBridge.tsx 等 7 个子文件。ComponentRenderer 也已提取（1112→269+185 行）。
4. ~~依赖版本漂移~~ ✅ 已解决 — studio vs runtime-ui 所有共享依赖版本已完全一致（react / antd / echarts / zustand / axios / dayjs / react-router-dom / @tanstack/react-query 等 17 项均版本一致）。
5. **🟡 运营报表未实现** — 仪表盘网格布局已完成（react-grid-layout 拖拽 + resize），但运营报表（表格/指标卡/趋势图组合）和 E2E 测试仍未做。

### 下一步优先级

| 优先级 | 行动 | 预期效果 |
|--------|------|---------|
| 🟡 P1 | Phase 6 收尾（可视化数据流画布 + E2E） | 数据集模块对齐度 80%→90% |
| 🟡 P1 | Phase 7 收尾（运营报表 + E2E） | 仪表盘对齐度 70%→80% |
| 🟡 P1 | E2E 测试（Playwright）+ 覆盖率达成 60% | 建立端到端安全网 |
| 🟢 P2 | Phase 10 打磨（数据导入导出 / 批量操作） | 生产准备 |
| 🟢 P2 | 修复剩余技术债（Tenant 隔离 $extends 重构） | 消除已知缺陷 |
| 🟢 P2 | Phase 8 扩展（自定义组件注册 + JS 页面扩展） | 功能扩展 |
