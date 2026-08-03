# aPaaS 平台功能完成度矩阵 — 2026-08-03

> 基于代码实际实现情况梳理，非估算。第一阶段技术债修复后的最新状态。

## 总体完成度

**整体项目完成度约 78%**，Phase 0-4 + Phase 9 核心功能已实现并可用，第一阶段阻断性技术债已修复。Phase 5-8（连接器 / 数据集 / 仪表盘 / 云函数）完全缺失。

---

## 一、后端（apps/gateway）

### 认证模块（auth）：进度 85%
- ✅ JWT 登录（email + password + bcrypt）
- ✅ JwtStrategy 签发/校验 token，注入 AuthenticatedUser（含 tenantId/roleIds/isSuperAdmin）
- ✅ 请求拦截器 + 401 响应处理
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
- ❌ 缺少字段级权限执行（fieldScope 返回但未消费） — ✅ 第一阶段已修复
- ❌ 缺少对象关联完整性校验（如 lookup 外键约束）

### 记录模块（record）：进度 85%（↑5% 第一阶段提升）
- ✅ JSONB 宽表记录 CRUD
- ✅ 动态查询（14 种 FilterOperator、AND/OR 组合、全文搜索）
- ✅ 分页、排序
- ✅ 公式字段自动计算、自动编号字段自动生成
- ✅ **行级权限条件注入**（第一阶段新增）
- ✅ **字段级权限投影**（第一阶段新增）
- ❌ JSONB 自定义字段排序不生效（仅按整体 data 列排序）
- ❌ 缺少批量操作（批量创建/更新/删除）
- ❌ 缺少数据导入/导出

### 页面模块（page）：进度 95%
- ✅ 页面 CRUD + 发布/取消发布
- ✅ getBySlug 运行时查询
- ✅ Schema JSON 存取
- ✅ **ChangeLog 变更追踪**（第一阶段新增）
- ❌ 缺少页面版本管理（仅 isPublished 布尔值）

### 流程引擎模块（process）：进度 78%（↑8% 第一阶段提升）
- ✅ 流程定义 CRUD + 发布
- ✅ 状态机引擎（token 流转、变量作用域、节点执行状态追踪）
- ✅ BullMQ 异步队列（PROCESS_QUEUE + DELAY_QUEUE）
- ✅ 12 种节点执行器
- ✅ 流程实例管理（启动 / 取消 / 轮询状态）
- ✅ 人工任务（待办 / 审批 / 转办）
- ✅ 通知模板 CRUD + 变量插值渲染
- ✅ **定时触发器**（第一阶段新增 — BullMQ repeatable job + cron 表达式）
- ✅ **通知 email 渠道**（第一阶段新增 — MailService + nodemailer SMTP）
- ✅ **通知 in_app 渠道**（第一阶段新增 — InAppMessage 表 + Service + Controller）
- ✅ **ChangeLog 变更追踪**（第一阶段新增）
- ❌ 子流程同步等待未实现（启动后立即继续）
- ❌ 并行汇聚为简化策略（首个 token 到达即执行，非严格 AND-join）
- ❌ 3 种节点类型未实现执行器：inclusive / loop / iterator

### 权限模块（permission）：进度 80%（↑15% 第一阶段提升）
- ✅ 五级权限引擎（RBAC + ABAC，Deny-overrides 策略）
- ✅ PermissionGuard 挂载到 6 个业务控制器
- ✅ 角色 CRUD + 组织树 CRUD + 用户 CRUD
- ✅ 权限规则管理（getRules / setRules）
- ✅ 租户隔离（审计已修复全部漏洞）
- ✅ **行级权限条件在数据层执行**（第一阶段新增 — condition-translator + RecordService 注入）
- ✅ **字段级权限在数据层执行**（第一阶段新增 — fieldScope 投影）
- ✅ **审计日志写入路径**（第一阶段新增 — AuditLogService + PermissionGuard 集成）
- ❌ 审计日志查询 API + 后台展示 UI 缺失
- ❌ 缺少权限规则可视化编辑 UI（前端仅展示列表）
- ❌ 组织授权继承扩散未实现

### 应用发布模块（application）：进度 90%（↑5% 第一阶段提升）
- ✅ 应用 CRUD
- ✅ 发布流水线（快照收集 → 预检 → 版本记录 → 环境隔离）
- ✅ 快照服务 + 预检服务 + 版本管理 + 回滚
- ✅ 变更追踪（ChangeLog 表 + getChangeSet 聚合）
- ✅ **ChangeLog 全模块集成**（第一阶段新增 — Object/Page/Process CRUD 均记录变更）
- ❌ 缺少环境隔离的实际运行时切换（dev/prod 快照隔离逻辑未完整）

### 队列模块（queue）：进度 95%（↑5% 第一阶段提升）
- ✅ BullMQ 队列配置（PROCESS_QUEUE + DELAY_QUEUE）
- ✅ ProcessProcessor 消费流程实例
- ✅ 延迟队列处理（delay 节点）
- ✅ **定时触发 job 处理**（第一阶段新增 — scheduled-trigger job 分支）
- ❌ 缺少队列监控 / 重试策略 / 死信队列处理

---

## 二、前端搭建器（packages/studio）

### 路由与页面框架：进度 100%
- ✅ 15 条路由全部有完整页面实现

### 对象设计器 UI：进度 95%
- ✅ 对象/字段/视图/记录的 CRUD UI 全部完整（18 字段类型、6 视图类型、14 筛选操作符）
- ❌ 缺少应用编辑/删除/归档 UI
- ❌ 缺少用户编辑 UI

### 页面搭建器 UI：进度 90%
- ✅ 三栏布局 + 26 种组件渲染器 + dnd-kit 拖拽
- ✅ 属性面板 + 视图模型面板 + 表达式引擎 + 动作执行器（12 种 ActionType）
- ✅ 撤销/重做 + 页面模板自动生成
- ❌ 事件配置 Tab 为占位文本（运行时引擎已完整，缺可视化配置 UI）
- ❌ chart 组件为视觉占位

### 流程编辑器 UI：进度 85%
- ✅ 基于 flowgram.ai 画布 + 9 种节点配置表单 + 四态值编辑器
- ✅ 流程监控 + 通知模板管理
- ❌ 4 种节点类型灰态"即将支持"（parallel / inclusive / loop / sub_process）

### 权限管理 UI：进度 70%
- ✅ 角色/组织/用户管理基本 UI
- ❌ 缺少角色成员分配 UI
- ❌ 缺少组织成员管理 UI
- ❌ 缺少权限规则编辑 UI

### 应用管理 UI：进度 90%
- ✅ 应用列表 + Dashboard + 发布向导 + 预检面板 + 版本历史
- ❌ 缺少应用编辑/删除/归档入口

---

## 三、运行时前端（packages/runtime-ui）

### 运行时 UI：进度 85%
- ✅ 5 条路由 + 页面渲染引擎（28 种组件）+ 表达式引擎 + 动作执行器 + 任务中心
- ❌ chart 组件为占位 UI
- ❌ 无移动端适配

---

## 四、基础设施与支撑

### 数据库（packages/db）：进度 90%
- ✅ Prisma schema 完整（18 model + 8 enum，第一阶段新增 InAppMessage + ProcessDef.cron）
- ✅ 5 个迁移文件 + GIN 索引
- ❌ 种子数据仅覆盖 5/18 表

### 共享类型契约（packages/shared）：进度 100%
- ✅ 7 个模块完整类型定义

### 微服务骨架（meta-svc / process-svc / runtime-svc）：进度 5%
- ✅ NestJS bootstrap + 健康检查端点
- ❌ 三个服务均为纯骨架，业务全在 gateway（TD-16 决策：保留骨架待拆分）

### 基础设施（infra）：进度 70%
- ✅ Docker Compose + 多阶段 Dockerfile + Nginx
- ❌ 无 CI/CD 配置
- ❌ 无监控 / 告警 / 日志收集

### 文档（docs）：进度 65%
- ✅ PRD + DESIGN 覆盖 Phase 1-4 + Phase 9
- ✅ 架构总览 + 路线图 + 飞书调研
- ✅ **知识库目录**（本次新增 `docs/knowledge-base/`）
- ❌ 缺少 Phase 5-8 的 PRD/DESIGN

---

## 五、总体进度汇总

| 模块 | 进度 | 关键缺口 |
|------|------|----------|
| 认证模块 | 85% | 缺 token 刷新、SSO、密码重置 |
| 对象/数据建模 | 90% | 缺 Rollup 聚合计算 |
| 记录模块 | 85% | 缺 JSONB 字段排序、批量操作、数据导入导出 |
| 页面模块 | 95% | 缺页面版本管理 |
| 流程引擎 | 78% | 缺子流程同步、严格 AND-join、3 种节点类型 |
| 权限模块 | 80% | 缺审计日志查询 UI、权限规则编辑 UI |
| 应用发布 | 90% | 缺环境隔离运行时切换 |
| 队列模块 | 95% | 缺队列监控、重试策略 |
| Studio 前端 | 85% | 缺事件配置 UI、图表组件、4 种流程节点 |
| Runtime-UI | 85% | 缺图表组件、移动端适配 |
| 数据库 | 90% | 缺种子数据覆盖 |
| 共享类型 | 100% | 完整 |
| 微服务骨架 | 5% | 三个服务纯骨架 |
| 基础设施 | 70% | 缺 CI/CD、监控 |
| 文档 | 65% | 缺 Phase 5-8 PRD |
| **整体** | **~78%** | Phase 5-8 完全缺失 |

---

## 与飞书 aPaaS 对齐度

| 模块 | 飞书对应 | 当前对齐度 | 备注 |
|------|----------|-----------|------|
| 对象/数据建模 | A | 90% | 缺 Rollup、批量操作、数据导入导出 |
| 页面搭建器 | C | 85% | 缺事件配置 UI、图表、JS 扩展、移动端 |
| 流程引擎 | D | 78% | 缺子流程同步、3 节点类型、流程模板 |
| 权限多租户 | E | 80% | 缺审计日志查询、规则编辑 UI、组织授权扩散 |
| 应用发布 | I | 90% | 缺环境隔离运行时切换 |
| 连接器 | F | 5% | 仅 http_request 节点 |
| 数据集 | B | 0% | 完全缺失 |
| 仪表盘 | H | 5% | 仅占位 |
| 云函数 | G | 5% | 仅类型定义 |
| 数据管理 | J | 40% | 缺批量操作、导入导出、软删除 |
| 飞书生态集成 | K | N/A | 独立平台，不依赖飞书 |
