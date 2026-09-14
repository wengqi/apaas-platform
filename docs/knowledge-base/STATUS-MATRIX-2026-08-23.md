# aPaaS 平台功能完成度矩阵 — 2026-08-23（代码审查校准版）

> 基于 2026-08-22 矩阵更新，并经 2026-08-23 全面代码审查（后端/前端/飞书对齐三维度）校准。
> 新增：Phase 7 运营报表 + 仪表盘 E2E + E2E 补齐 + TD-17 租户隔离 + Phase 10.4 Demo + 代码审查整改（R1 安全修复 / R2 缺陷修复 / R3 对齐校准）。

## 总体完成度

**代码工程完成度约 90%**（测试/安全/发布链路完整：19 spec / 459 单元测试 + 10 E2E spec / ~47 E2E 测试全部通过）。
**飞书功能对齐度约 68%**（按 A-K 功能清单逐项核对，详见下方对齐度表 — 此前 ~97% 声明系口径错误）。

当前最大风险：功能覆盖度缺口（连接器 35% / 仪表盘 60% / 流程引擎缺 5 节点）+ 覆盖率基线 39% 距 60% 目标差距 + Phase 10.5 部署文档待启动。

---

## 本轮变更摘要（2026-08-23）

### Phase 7 运营报表（Task 7.7）

**核心改进：前端直连后端聚合引擎（消除死代码）**

原架构中后端 `ChartDataService` 聚合引擎已完整实现，但前端从未调用 — 图表在客户端对 ≤100 行数据聚合或显示 mock 数据。本次实现前端直连后端聚合 API，同时新增三大运营报表原语：

| 原语 | 实现方式 | 文件 |
|------|---------|------|
| 指标卡 | 增强 `statistic` 组件，`MetricCard` 调用后端标量聚合 API | `runtime-ui/src/runtime/ComponentRenderer.tsx` |
| 趋势图 | `chart` + `timeGranularity`（day/week/month），后端时间分桶 | `chart-data.service.ts` + `chart-options.ts` |
| 后端聚合直连 | `AggregationChart` 调用 `getChartData` API，`buildChartOptionFromAggregated` | `runtime-ui/src/runtime/ComponentRenderer.tsx` |

**后端增强（`chart-data.service.ts`）：**
- `categoryField` 可选 — 省略时返回标量聚合值（指标卡用）
- 时间分桶 day/week/month + 时间排序
- `filter` 字段实现（json-logic-js apply）
- `count` 聚合不要求 `valueField`
- `take: 10000` 防御性上限

**新增测试：**
- `chart-data.service.spec.ts` — 21 单元测试（聚合函数 + 标量聚合 + 时间分桶 + filter + 数据源）
- `05-dashboard.spec.ts` 重写 — 7 E2E 测试（模板验证 + 布局更新 + 聚合 API + 时间分桶 + 标量聚合 + 图表配置预览 + UI）

### Phase 7 仪表盘 E2E（Task 7.8）

E2E 测试从 3 个增加到 7 个，覆盖：
- 后端聚合 API（sum/count/avg）
- 时间分桶（day 粒度 + 排序验证）
- 指标卡标量聚合（无 categoryField）
- 图表配置 + 发布 + 运行时预览验证

### TD-17 租户隔离 $extends 重构

**三层防御体系 Layer 2 — Prisma 自动注入 tenantId**

原架构租户隔离完全依赖手动约定（~94 个 service 方法逐层传递 tenantId），遗漏即跨租户泄露。本次实现 Prisma `$extends` 查询扩展，基于 AsyncLocalStorage 自动注入 tenantId 到所有白名单模型的查询 where/data 中：

| 组件 | 文件 | 说明 |
|---|---|---|
| ALS 上下文 | `packages/db/src/tenant-context.ts` | `runWithTenant()` / `runAsSystem()` / `getTenantId()` |
| 注入逻辑 | `packages/db/src/tenant-injection.ts` | `decideInjection()` + `injectToWhere/Data/Upsert()` 纯函数 |
| 模型白名单 | `packages/db/src/tenant-models.ts` | 24 个有 tenantId 列的模型 |
| $extends 扩展 | `packages/db/src/index.ts` | 11 操作类型自动注入 + fail-open warn |
| HTTP 拦截器 | `apps/gateway/src/common/tenant-context.interceptor.ts` | 从 req.user.tenantId 设 ALS |

**后台任务上下文修复**：ProcessProcessor 从实例恢复 tenantId、DatasetProcessor 从 job.data 获取、Webhook 从 connector.tenantId 恢复、Seed 用 runAsSystem 包裹。

**预存 bug 自动修复**：`auto-number.ts` 跨租户记录扫描 — $extends 自动注入 tenantId，无需修改业务代码。

**新增测试**：42 单元测试（ALS 上下文 18 + 注入逻辑 24），gateway 341 测试全部回归通过。

**Schema 修复**：DatasetRow 添加 `@@index([tenantId])` 迁移。

---

## 模块完成度

| 模块 | 完成度 | 主要缺口 |
|------|--------|---------|
| 认证模块 (auth) | 85% | token 刷新, SSO/OAuth, 密码重置/邮箱验证 |
| 对象/数据建模 (object) | 90% | Rollup 聚合计算, lookup 外键约束 |
| 记录模块 (record) | 92% ↑ | ~~批量操作~~ ✅ / ~~数据导入导出~~ ✅ / JSONB 字段排序 |
| 页面模块 (page) | 95% | 页面版本管理（仅 isPublished） |
| 流程引擎 (process) | 88% | 子流程同步等待, 严格 AND-join, 5 节点类型 |
| 权限模块 (permission) | 92% ↑ | ~~租户隔离 $extends~~ ✅ / 组织授权继承扩散 |
| 应用发布 (application) | 96% ↑ | dev/prod 环境隔离运行时切换 |
| 连接器 (connector) | 72% ↑ | 数据库连接器, OAuth2, OpenAPI 导入, 连接器市场 |
| 数据集 (dataset) | 93% ↑ | ~~E2E 测试~~ ✅ / 可视化画布已完成 |
| **仪表盘 (dashboard)** | **85%** | ~~运营报表~~ ✅ / ~~E2E~~ ✅ / 待：管理后台运营指标（Phase 9.9） |
| 云函数 (cloud-function) | 93% ↑ | 自定义组件注册, JS 页面扩展 |
| 队列模块 (queue) | 95% | 队列监控, 重试策略, 死信队列 |
| 全局错误处理 | 100% | — |
| API 文档 | 100% | — |
| Studio 前端 | 96% ↑ | ~~PropertyPanel 拆分~~ ✅ / JS 扩展, 移动端 |
| Runtime-UI | 92% | ~~图表聚合引擎~~ ✅ / 移动端适配 |
| 测试基础设施 | 58% ↑ | 19 spec / 459 测试 / 9 E2E spec ~35 测试 / 覆盖率阈值已启用 39% / TD-17 租户隔离 42 测试 |
| 工程化治理 | 100% | — |
| 数据库 (db) | 96% ↑ | ~~租户隔离 $extends~~ ✅ / DatasetRow 索引 / 种子数据覆盖不完整 |
| 共享类型 + stores | 100% | — |
| 微服务骨架 | 5% | 三服务纯骨架（决策保留） |
| 基础设施 (infra) | 85% | 监控/告警/日志收集 |
| 文档 (docs) | 92% ↑ | ~~Phase 7 PRD/DESIGN 7.7~~ ✅ / ROADMAP 验收状态已同步 |
| **整体** | **~97%** ↑ | Phase 10.5 部署文档 + 覆盖率提升至 60% |

---

## 测试覆盖

| 维度 | 数量 | 说明 |
|------|------|------|
| 后端 spec | 17 | chart-data.service.spec.ts (21 tests) |
| db spec | 2 | tenant-context.spec.ts (18) + tenant-injection.spec.ts (24) |
| 前端 spec | 3 | query-builder-config / custom-logic-parser / jsonlogic-utils |
| 后端测试 | 331 | — |
| db 测试 | 42 | — |
| 前端测试 | 86 | — |
| **总测试** | **459** | — |
| E2E spec | 10 | +1 新增（10-demo-app — 资产管理 Demo 应用验收 12 测试） |
| E2E 测试 | ~47 | +12 新增（Demo 应用 API 验证 + Studio UI 验证） |
| 覆盖率 | 39.25% | 基线已启用（statements 34% / branches 70% / functions 55% / lines 34%） |

---

## 飞书对齐度（2026-08-23 代码审查校准）

> ⚠️ 本表经全面代码审查后校准。此前声明 ~97% 系按代码完成度而非飞书功能清单对照得出，
> 存在虚高。以下为按基准文档 A-K 功能清单逐项核对后的证据值。
> 代码工程质量（测试/安全/架构）与功能覆盖度是两个维度，前者表现优秀，后者仍有明确差距。

| 模块 | 飞书模块 | 对齐度 | 证据与缺口 |
|------|---------|--------|-----------|
| 页面搭建器 | C | 65% | ✅ 29 组件/12 动作类型/事件配置/仪表盘网格；❌ 飞书 130+ 组件、页面版本管理（仅 isPublished）、移动端、JS 页面扩展、自定义组件、组件市场 |
| 应用发布 | I | 85% | ✅ 预检/发布快照/版本回滚/环境标识完整；❌ 模板市场（60+ 模板）、应用包导出、审批门禁 |
| 数据集 | B | 85% | ✅ 数据流引擎/物化/异步刷新/可视化画布；❌ Excel 导出、更多数据源类型 |
| 云函数 | G | 80% | ✅ isolated-vm 沙箱/Monaco/流程节点/CRUD+publish+invoke；❌ npm 依赖、定时执行、市场分发 |
| 对象建模 | A | 70% | ✅ 18 字段类型定义/公式引擎(9函数)/视图配置；❌ Rollup 零计算（死类型）、Lookup 无外键约束、看板/日历/画廊视图未渲染、字段加密 |
| 流程引擎 | D | 65% | ✅ 14 执行器/条件分支/并行/延时/子流程/定时触发/回退跳转；❌ loop/break/continue/wait_for_condition/inclusive 5 节点、子流程同步等待、严格 AND-join、API/BUTTON_CLICK 触发器 |
| 权限多租户 | E | 80% ↑ | ✅ RBAC+ABAC/行级 $extends 注入/字段级 scope/TenantAdminGuard；❌ 组织授权继承扩散、规则优先级确定性（首个 ALLOW 命中） |
| 连接器 | F | 35% | ✅ HTTP 出站/Webhook 入站/凭证 AES 加密；❌ OAuth2、数据库连接器、OpenAPI 导入、连接器市场（飞书 28+ 官方连接器 vs 2 种类型） |
| 仪表盘 | H | 60% | ✅ 聚合 API(sum/count/avg/max/min)/时间分桶/网格布局；❌ 地图图表、管理后台运营报表（用户/存储/应用监控） |
| 数据管理 | J | 65% | ✅ CSV 导入导出/批量操作/模板下载；❌ Excel 格式、列映射 UI、软删除/回收站、异步大文件导入 |
| 飞书生态 | K | 0% | 按项目决策排除（独立系统，不依赖飞书） |

**整体飞书对齐度：约 68%**（按上表加权平均；08-22 旧口径 ~93% 系未逐项对照功能清单的估计值）

**未列入任何缺口清单但缺失的功能（审查补录）**：实时协作（多人编辑）、应用模板市场、软删除/回收站、
Excel 导入、API/BUTTON_CLICK 触发器、字段级加密、移动端适配（部分文档已列）。

---

## 风险与下一步

### 当前风险

1. 🔴 **功能覆盖度与飞书清单存在真实差距** — 连接器 35%、仪表盘 60%、流程引擎缺 5 种节点、Rollup 死类型、无移动端/模板市场/实时协作（详见对齐度表证据列）
2. 🟡 **覆盖率基线 39% 距 60% 目标仍有差距** — controller / node-executor / DTO 测试缺失
3. 🟢 **17 个前端文件超 400 行** — PropertyPanel 已拆分（1178→231 行），RecordList(836)、FieldConfigDrawer(785)、AppList(701) 等待拆
4. ✅ **代码审查 HIGH 缺陷已全部修复（R1）** — ABAC 写操作执行、凭证/云函数授权、delegateTask 校验、流程引擎竞态/幂等/循环预算/WAITING 重复、onLoad 死循环、渲染错误边界、XSS 消毒

### 下一步优先级

| 优先级 | 行动 | 预期效果 |
|--------|------|---------|
| 🟢 P2 | R4 功能补全第一批：运行时页面导航菜单 + 5 种流程节点执行器 | UX 最大缺口 + 流程引擎对齐度 65%→80% |
| 🟢 P2 | R4 第二批：子流程同步等待 + Rollup 计算 + Lookup 完整化 | 建模 70%→80%，流程 80%→88% |
| 🟢 P2 | R4 第三批：连接器扩展（OAuth2/数据库/OpenAPI） | 连接器 35%→60%+ |
| 🟢 P2 | Phase 10.5 部署文档 + 性能优化 | 交付闭环 |
| 🟢 P2 | 覆盖率提升至 60% | 质量保障 |
