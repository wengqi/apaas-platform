# PRD — 数据集与数据流（Phase 6）

> 版本：v1.0 · 日期：2026-08-23 · 负责人：产品经理（主智能体）
> 对标：飞书 aPaaS 数据集与数据流
> 关联契约：`packages/shared/src/dataset/index.ts` · `apps/gateway/src/dataset/`
> 验收闸门：Phase 6 产品闸门（ ROADMAP.md ）
> 状态：✅ 已实现（2026-08-22，回溯编写）

---

## 1. 模块概述

### 1.1 定位

数据集与数据流是 aPaaS 平台的数据加工层。通过数据流定义 pipeline（数据源 → 关联 → 筛选 → 分组汇总 → 输出映射），执行后生成物化数据集。数据集可被图表、报表、页面组件直接消费，无需实时查询原始记录。

- **数据流（DataFlow）**：JSON pipeline 定义，描述数据变换步骤
- **数据集（Dataset）**：物化数据存储，由数据流执行后生成，支持分页查询
- **异步刷新**：通过 BullMQ 队列异步执行 pipeline，避免阻塞请求

### 1.2 价值

| 角色 | 价值 |
|---|---|
| 搭建者 | 跨对象关联 + 分组汇总，无需 SQL |
| 仪表盘 | 数据集为图表提供预聚合数据源 |
| 平台 | 物化存储降低运行时查询压力 |

### 1.3 简化项（偏离飞书，已说明理由）

| 功能 | 飞书 | 本平台 | 理由 |
|------|------|--------|------|
| 可视化画布 | 拖拽式 DAG | ❌ JSON 表单配置 | MVP 阶段表单已够用，画布待后续 |
| SQL 模式 | 支持 | ❌ 不实现 | JsonLogic + 内存聚合覆盖核心场景 |
| 增量刷新 | 支持 | ❌ 全量刷新 | 数据量可控，全量更简单可靠 |
| 定时调度 | 支持 | ❌ 手动触发 | 事件驱动优先，定时调度待后续 |

---

## 2. 功能需求

### 2.1 数据流管理

| # | 功能 | 状态 | 说明 |
|---|------|------|------|
| 6.1 | 数据流 CRUD | ✅ | 创建/查询/更新/删除数据流，含租户隔离 |
| 6.2 | 数据源配置 | ✅ | 多数据源（对象引用 + 别名）|
| 6.3 | 关联（JOIN） | ✅ | left/inner join，内存合并，右表字段加前缀 |
| 6.4 | 筛选条件 | ✅ | JsonLogic 规则，json-logic-js 逐行评估 |
| 6.5 | 分组汇总 | ✅ | groupBy + 聚合指标（sum/count/avg/max/min）|
| 6.6 | 输出字段映射 | ✅ | source → alias 重命名，支持 `alias.field` 路径 |
| 6.7 | 预览 | ✅ | 不物化，限制 100 行 |
| 6.8 | 执行调度 | ✅ | 入队 BullMQ 异步执行，自动创建/更新数据集 |

### 2.2 数据集管理

| # | 功能 | 状态 | 说明 |
|---|------|------|------|
| 6.9 | 数据集查询 | ✅ | 列表/详情，含状态/行数/列定义/最后刷新时间 |
| 6.10 | 数据集行查询 | ✅ | 分页 + JsonLogic 筛选 + 排序 |
| 6.11 | 数据集刷新 | ✅ | 手动触发重新执行关联数据流 |
| 6.12 | 数据集删除 | ✅ | 级联删除 DatasetRow |

### 2.3 API 端点

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | /api/v1/apps/:appId/data-flows | 列出数据流 |
| POST | /api/v1/apps/:appId/data-flows | 创建数据流 |
| GET | /api/v1/data-flows/:flowId | 获取数据流详情 |
| PUT | /api/v1/data-flows/:flowId | 更新数据流 |
| DELETE | /api/v1/data-flows/:flowId | 删除数据流 |
| POST | /api/v1/data-flows/:flowId/preview | 预览数据流结果 |
| POST | /api/v1/data-flows/:flowId/execute | 执行数据流（入队） |
| GET | /api/v1/apps/:appId/datasets | 列出数据集 |
| GET | /api/v1/datasets/:datasetId | 获取数据集详情 |
| DELETE | /api/v1/datasets/:datasetId | 删除数据集 |
| GET | /api/v1/datasets/:datasetId/rows | 查询数据集行（分页） |
| POST | /api/v1/datasets/:datasetId/refresh | 刷新数据集 |

### 2.4 前端 UI

- 数据流创建/编辑表单（步骤式：基本信息 → 数据源 → 关联 → 筛选 → 分组汇总 → 输出字段）
- 数据源选择器（对象下拉 + 别名输入）
- 关联配置（左/右表别名 + 关联类型 + 关联字段）
- 筛选条件（JsonLogic JSON 文本编辑）
- 分组汇总配置（分组字段 + 聚合指标 Form.List）
- 输出字段配置（source/alias/label/type）

---

## 3. 数据模型

```
DataFlow: id, tenantId, appId, apiName, name, description, config(JSON pipeline),
          outputColumns(JSON?), status(DRAFT|ACTIVE), createdBy
Dataset:  id, tenantId, appId, apiName, name, sourceFlowId, status(EMPTY|REFRESHING|READY|FAILED),
          rowCount, columns(JSON), lastRefreshedAt?, lastError?
DatasetRow: id, tenantId, datasetId, data(JSONB), createdAt
```

DataFlowConfig JSON pipeline 结构：
```json
{
  "sources": [{ "objectId": "...", "alias": "orders" }],
  "join": { "leftAlias": "orders", "rightAlias": "customers", "type": "left", "leftField": "customer_id", "rightField": "id" },
  "filter": { ">": [{ "var": "amount" }, 1000] },
  "aggregation": { "groupBy": ["status"], "metrics": [{ "alias": "total", "label": "总额", "field": "amount", "function": "sum" }] },
  "outputFields": [{ "alias": "status", "label": "状态", "source": "status", "type": "string" }]
}
```

BullMQ 队列：`DATASET_QUEUE`，concurrency=3

---

## 4. 验收标准

1. ✅ 创建数据流（含 join + filter + aggregation）→ 预览验证结果正确
2. ✅ 执行数据流 → 数据集状态变为 READY，行数正确
3. ✅ 数据集行分页查询 + JsonLogic 筛选
4. ✅ 数据集刷新（重新执行 pipeline）
5. ✅ 删除数据流时级联删除数据集和行

> **验收状态**: ✅ 后端单元测试（DataFlowEngine.spec.ts）+ 前端 UI 验证全部通过
