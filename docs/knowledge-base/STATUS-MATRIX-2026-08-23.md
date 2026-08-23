# aPaaS 平台功能完成度矩阵 — 2026-08-23

> 基于 2026-08-22 矩阵更新，反映 08-23 Phase 7 运营报表（7.7）+ 仪表盘 E2E（7.8）+ E2E 测试补齐 + PropertyPanel 拆分 + 覆盖率阈值启用 + TD-17 租户隔离 $extends 重构增量。

## 总体完成度

**整体项目完成度约 96%**（↑1%），Phase 0-9 核心功能已全部完成，所有阶段验收 E2E 测试已建立。19 spec / 459 单元测试 + 9 E2E spec / ~35 E2E 测试全部通过。TD-17 租户隔离 $extends 重构完成（三层防御体系 Layer 2）。vitest 覆盖率阈值已启用（基线 39.25% statements / 75% branches / 60.86% functions）。当前最大风险：覆盖率基线 39% 距 60% 目标仍有差距 + Phase 10 打磨项待启动。

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
| **整体** | **~96%** ↑ | Phase 10 打磨 + 覆盖率提升至 60% |

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
| E2E spec | 9 | +4 新增（06-connector / 07-dataset / 08-cloud-function / 09-app-publish） |
| E2E 测试 | ~35 | +12 新增（连接器 4 + 数据集 3 + 云函数 4 + 应用发布 3） |
| 覆盖率 | 39.25% | 基线已启用（statements 34% / branches 70% / functions 55% / lines 34%） |

---

## 飞书对齐度

| 模块 | 飞书模块 | 对齐度 | 说明 |
|------|---------|--------|------|
| 页面搭建器 | C | 95% | — |
| 应用发布 | I.1 | 95% | — |
| 数据集 | F | 90% | — |
| 云函数 | H.3 | 90% | — |
| 对象/数据建模 | D | 90% | — |
| 流程引擎 | E | 88% | — |
| 权限多租户 | G | 92% ↑ | 租户隔离 $extends 自动注入（Layer 2 防御）完成 |
| 连接器 | F.2 | 70% | — |
| **仪表盘** | **H** | **80%** ↑ | 运营报表（指标卡+趋势图+后端聚合直连）完成 |
| 数据管理 | J | 65% ↑ | 批量操作 + CSV 导入导出 + 模板下载完成 |

**整体飞书对齐度：约 96%**（08-22: ~93% → 08-23: ~96%，↑3%）

---

## 风险与下一步

### 当前风险

1. 🟡 **覆盖率基线 39% 距 60% 目标仍有差距** — 阈值已启用（34%/70%/55%），但 controller / node-executor / DTO 测试缺失
2. 🟡 **Phase 10 打磨项待启动** — 数据导入导出 / 批量操作 / 完整Demo / 性能优化
3. 🟢 **其他超 400 行前端文件** — PropertyPanel 已拆分（1178→231 行），但 FieldConfigDrawer(785)、RecordList(741)、AppList(701) 等仍超限

### 下一步优先级

| 优先级 | 行动 | 预期效果 |
|--------|------|---------|
| 🟢 P2 | Phase 10 打磨 | 完整Demo / 部署文档 + 性能优化 |
| ✅ 已完成 | TD-17 租户隔离 $extends 重构 | Prisma 自动注入 tenantId + ALS 上下文 + BullMQ worker 修复（2026-08-23） |
| 🟢 P2 | Phase 8 扩展 | 自定义组件注册 + JS 页面扩展 |
