# DESIGN — 数据集与数据流（Phase 6）

> 版本：v1.0 · 日期：2026-08-23 · 负责人：架构师（主智能体）
> 对标：飞书 aPaaS 数据集与数据流
> 关联契约：`packages/shared/src/dataset/index.ts` · `apps/gateway/src/dataset/`
> 验收闸门：Phase 6 技术闸门（ ROADMAP.md ）
> 状态：✅ 已实现（2026-08-22，回溯编写）

---

## 1. 架构设计

### 1.1 组件关系图

```
┌─────────────────────────────────────────────────────────┐
│                     Studio 前端                           │
│           DataFlowFormModal (步骤式表单)                  │
│           dataFlowsApi / datasetsApi (axios)             │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP /api/v1/
┌──────────────────────▼──────────────────────────────────┐
│                   Gateway (NestJS)                        │
│                                                          │
│  ┌─────────────────┐  ┌──────────────────┐              │
│  │ DataFlowCtrl    │  │ DatasetCtrl      │              │
│  │ (PermissionGuard)│  │ (PermissionGuard)│              │
│  └────────┬────────┘  └────────┬─────────┘              │
│           │                     │                        │
│  ┌────────▼────────┐  ┌────────▼─────────┐              │
│  │ DataFlowService │  │ DatasetService   │              │
│  │ (CRUD + preview │  │ (CRUD + refresh  │              │
│  │  + execute)     │  │  委托 FlowSvc)   │              │
│  └────────┬────────┘  └────────┬─────────┘              │
│           │                     │                        │
│           │     ┌───────────────▼──────────┐            │
│           │     │ DatasetRowService        │            │
│           │     │ (分页 + JsonLogic 筛选)  │            │
│           │     └──────────────────────────┘            │
│           │                                              │
│  ┌────────▼──────────────────────────┐                  │
│  │       DataFlowEngine              │                  │
│  │  executePipeline():               │                  │
│  │   loadSource → join → filter      │                  │
│  │   → aggregation → mapOutput       │                  │
│  │  executeAndMaterialize()          │                  │
│  │   → 物化到 DatasetRow (batch 500) │                  │
│  └────────┬──────────────────────────┘                  │
│           │                                               │
│  ┌────────▼──────────────────────┐  ┌───────────────┐  │
│  │  DatasetProcessor (Worker)    │  │  BullMQ Queue  │  │
│  │  消费 DATASET_QUEUE            │◄─│  DATASET_QUEUE │  │
│  │  concurrency=3                │  └───────────────┘  │
│  └───────────────────────────────┘                      │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
     PostgreSQL (data_flows / datasets / dataset_rows)
```

### 1.2 数据流

**预览**：前端 → DataFlowController.preview → DataFlowService.preview → DataFlowEngine.preview（执行 pipeline，限制 100 行，不物化）→ 返回 `{ columns, rows, total }`

**执行**：前端 → DataFlowController.execute → DataFlowService.execute → 创建/查找 Dataset → 设置 REFRESHING → 入队 `DATASET_QUEUE` → 返回 datasetId

**异步物化**：DatasetProcessor Worker 消费任务 → DataFlowEngine.executeAndMaterialize → 执行 pipeline → 清空旧行 → 分批写入（BATCH_SIZE=500）→ 更新状态 READY/FAILED

---

## 2. 组件清单

### 2.1 后端（apps/gateway/src/dataset/）

| 组件 | 文件 | 职责 |
|------|------|------|
| DataFlowController | `dataflow.controller.ts` | 数据流 CRUD + preview + execute 端点 |
| DataFlowService | `dataflow.service.ts` | 数据流业务逻辑 + BullMQ 入队 + ChangeLog |
| DataFlowEngine | `dataflow-engine.service.ts` | pipeline 执行引擎：加载→join→filter→aggregation→输出映射→物化 |
| DatasetController | `dataset.controller.ts` | 数据集 CRUD + 行查询 + refresh 端点 |
| DatasetService | `dataset.service.ts` | 数据集 CRUD，refresh 委托 DataFlowService.execute |
| DatasetRowService | `dataset-row.service.ts` | 行分页查询，复用 jsonLogicToPrismaWhere 筛选 |
| DatasetProcessor | `dataset.processor.ts` | BullMQ Worker，消费刷新任务，concurrency=3 |
| DatasetModule | `dataset.module.ts` | 模块注册，forwardRef(QueueModule) |

### 2.2 前端（packages/studio/src/components/dataset/）

| 组件 | 文件 | 职责 |
|------|------|------|
| DataFlowFormModal | `DataFlowFormModal.tsx` | 步骤式表单：基本信息→数据源→关联→筛选→分组汇总→输出字段 |

### 2.3 共享契约（packages/shared/src/dataset/index.ts）

`DatasetStatus` / `DataFlowStatus` / `AggregateFunction` / `JoinType` / `OutputColumnType` 枚举 · `DataSourceConfig` / `JoinConfig` / `AggregationConfig` / `OutputFieldConfig` / `DataFlowConfig` 配置接口 · `Dataset` / `DataFlow` / `DatasetColumn` 实体接口 · `CreateDataFlowRequest` / `UpdateDataFlowRequest` / `DatasetRowQueryParams` / `DatasetRowListResponse` / `DataFlowPreviewResult` DTO

---

## 3. 关键设计决策

### 3.1 内存聚合而非 SQL 聚合

DataFlowEngine 在应用层执行 join/filter/aggregation，而非下推到数据库 SQL。原因：JSONB 宽表模式下跨对象 join 需要应用层编排，且 json-logic-js 评估与 Prisma where 翻译器各有所长。代价是大数据量时内存压力大，通过预览限 100 行 + 物化分批写入缓解。

### 3.2 物化存储而非视图

数据集使用独立 `DatasetRow` 表物化存储，而非数据库视图。优势：查询性能稳定（无需实时聚合）、支持 GIN 索引筛选、可被图表直接消费。代价：数据有时效性，需手动刷新。

### 3.3 分批物化写入

物化时按 BATCH_SIZE=500 分批 `createMany`，避免单次写入过大。先 `deleteMany` 清空旧行再写入新行。

### 3.4 复用 JsonLogic 生态

筛选条件使用 JsonLogic JSON 格式，行查询复用 `jsonLogicToPrismaWhere` 翻译为 Prisma where，pipeline 内 filter 使用 `json-logic-js` 逐行评估。两套机制各取所长。

### 3.5 异步刷新 + 状态机

数据集状态流转：`EMPTY → REFRESHING → READY/FAILED`。执行入队后立即返回 datasetId，前端轮询状态（或后续可扩展 WebSocket 推送）。

### 3.6 JOIN 字段前缀策略

内存 join 时右表字段以 `{rightAlias}_{field}` 格式合并，避免与左表字段名冲突。输出字段映射支持 `alias.field` 路径解析。

---

## 4. 简化项说明（偏离飞书）

| 功能 | 飞书 | 本平台 | 理由 |
|------|------|--------|------|
| 可视化画布 | 拖拽式 DAG 编辑器 | ❌ JSON 表单配置 | MVP 阶段表单够用，画布待后续 |
| SQL 模式 | 支持 SQL 查询 | ❌ 不实现 | JsonLogic + 内存聚合覆盖核心场景 |
| 增量刷新 | 支持增量更新 | ❌ 全量刷新 | 数据量可控，全量更简单可靠 |
| 定时调度 | 支持 cron | ❌ 手动触发 | 事件驱动优先，定时调度待后续 |
| 数据库下推聚合 | SQL GROUP BY | ❌ 内存聚合 | JSONB 宽表限制，应用层更灵活 |

> **验收状态**: ✅ DataFlowEngine 单元测试 + 前端 UI 验证 + BullMQ 异步刷新验证全部通过
