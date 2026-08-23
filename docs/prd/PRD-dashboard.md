# PRD — 仪表盘与报表（Phase 7）

> 版本：v1.0 · 日期：2026-08-23 · 负责人：产品经理（主智能体）
> 对标：飞书 aPaaS 仪表盘与报表
> 关联契约：`packages/shared/src/page/chart-options.ts` · `packages/shared/src/page/index.ts` · `apps/gateway/src/dataset/chart-data.service.ts`
> 验收闸门：Phase 7 产品闸门（ ROADMAP.md ）
> 状态：✅ 已实现（2026-08-22，回溯编写）

---

## 1. 模块概述

### 1.1 定位

仪表盘与报表是 aPaaS 平台的数据可视化层。搭建者在页面搭建器中拖入图表组件（柱状图/折线图/饼图/漏斗图），绑定数据源（对象记录或数据集），配置分类字段和值字段，平台自动聚合数据并渲染 ECharts 图表。

- **图表组件**：4 种类型（bar/line/pie/funnel），支持标题、分类字段、值字段、聚合方式配置
- **后端聚合**：ChartDataService 在后端执行数据查询 + 分组聚合，返回结构化数据
- **仪表盘网格**：DashboardGrid 组件支持拖拽布局，react-grid-layout 坐标模型

### 1.2 价值

| 角色 | 价值 |
|---|---|
| 搭建者 | 拖拽式图表配置，无需写代码即可可视化数据 |
| 管理者 | 仪表盘汇总关键指标，实时了解业务状态 |
| 平台 | 后端聚合支持大数据量，前端只接收聚合结果 |

### 1.3 简化项（偏离飞书，已说明理由）

| 功能 | 飞书 | 本平台 | 理由 |
|------|------|--------|------|
| 图表类型 | 10+ 种 | ✅ 4 种（bar/line/pie/funnel）| 覆盖 80% 场景 |
| 仪表盘模板 | 支持 | ❌ 空白页搭建 | 模板引擎待后续 |
| 报表导出 | PDF/Excel | ❌ 不实现 | 优先核心图表能力 |
| 联动筛选 | 支持 | ❌ 不实现 | 单图表独立展示，联动待后续 |
| 自定义指标 | 支持 | ❌ 不实现 | 5 种聚合函数够用 |

---

## 2. 功能需求

### 2.1 图表组件

| # | 功能 | 状态 | 说明 |
|---|------|------|------|
| 7.1 | 柱状图（bar） | ✅ | 分类字段 + 值字段 + 聚合方式 |
| 7.2 | 折线图（line） | ✅ | 同上，smooth 曲线 |
| 7.3 | 饼图（pie） | ✅ | 分类字段为标签，值字段为扇区值 |
| 7.4 | 漏斗图（funnel） | ✅ | 转化漏斗可视化 |
| 7.5 | 聚合方式 | ✅ | sum/count/avg/max/min |
| 7.6 | 数据源绑定 | ✅ | 对象记录 or 数据集行 |
| 7.7 | 编辑模式 Mock | ✅ | 无数据时使用 Mock 数据预览 |

### 2.2 仪表盘网格

| # | 功能 | 状态 | 说明 |
|---|------|------|------|
| 7.8 | 网格布局 | ✅ | react-grid-layout，12 列网格，可拖拽/调整大小 |
| 7.9 | 布局持久化 | ✅ | layout JSON 存储在组件节点 props |
| 7.10 | 统计卡片 | ✅ | Statistic 组件（title/value/prefix/suffix）|

### 2.3 后端聚合 API

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | /api/v1/apps/:appId/datasets/chart-data | 图表数据聚合 |

请求体：`{ sourceType: 'object'|'dataset', sourceId, categoryField, valueField, aggregation, filter? }`

响应：`{ data: [{ category, value }], categories: string[], values: number[], totalRecords: number }`

### 2.4 前端 UI

- 图表组件属性面板（chartType/title/categoryField/valueField/aggregation）
- 仪表盘网格容器（DashboardGrid），编辑模式可拖拽
- ECharts 渲染（ReactECharts 组件）
- 统计卡片组件（Statistic）

---

## 3. 数据模型

图表配置存储在页面组件节点 props 中（JSONB）：

```
ChartConfig: { chartType: 'bar'|'line'|'pie'|'funnel', title?, categoryField?, valueField?, aggregation? }
LayoutItem: { i: nodeId, x, y, w, h }  // react-grid-layout 坐标
```

ChartType 枚举：`'bar' | 'line' | 'pie' | 'funnel'`
ChartAggregation 枚举：`'sum' | 'count' | 'avg' | 'max' | 'min'`
TimeGranularity 枚举：`'day' | 'week' | 'month'`（7.7 新增）

---

## 3.5 运营报表（Task 7.7 — 2026-08-23 新增）

### 需求

仪表盘从"单图表 widget 组合"升级为"运营报表"，增加三大原语：

1. **指标卡（MetricCard）** — 增强现有 `statistic` 组件，支持后端标量聚合（无 categoryField → 返回单值）。配置数据源 + 值字段 + 聚合方式后，运行时自动调用后端聚合 API 获取 KPI 数值。
2. **趋势图（Trend Chart）** — 增强现有 `chart` 组件，新增 `timeGranularity` 配置（day/week/month）。当分类字段为日期时，按时间粒度分桶聚合并按时间排序。
3. **前端直连后端聚合引擎** — 运行时图表/指标卡直接调用 `POST /apps/:appId/datasets/chart-data` 后端聚合 API，消除原客户端 ≤100 行聚合的死代码路径。

### 后端增强

`ChartDataService.aggregate()` 增强：
- `categoryField` 改为可选 — 省略时所有记录归入单组 `_total`，返回标量值（指标卡用）
- 新增 `timeGranularity` 参数 — 按 day/week/month 时间分桶，结果按时间升序排列
- 实现 `filter` 字段 — 用 `json-logic-js` 的 `apply()` 对每条记录求值筛选
- `count` 聚合不要求 `valueField`（统计记录数）
- `loadSourceData` 增加 `take: 10000` 防御性上限

### 前端实现

- `AggregationChart` 组件（runtime-ui）— 替代原 `DatasetChart`，调用后端 API 获取聚合结果
- `MetricCard` 组件（runtime-ui）— 调用后端标量聚合 API，渲染 AntD `<Statistic>`
- `buildChartOptionFromAggregated()` — 从后端聚合结果直接构建 ECharts option
- `StatisticPropsSection`（Studio PropertyPanel）— 指标卡配置 UI（数据源/字段/聚合方式）
- `timeGranularity` Select — 图表属性面板新增时间分桶配置

### 仪表盘模板更新

`generateDashboardSchema()` 从"1 statistic + 3 charts"升级为"2 指标卡 + 1 趋势图 + 1 柱状图 + 1 饼图"运营报表组合。

### 飞书对齐

| 功能 | 飞书 | 本平台 | 对齐度 |
|------|------|--------|--------|
| 指标卡 | Statistic + 聚合绑定 | ✅ MetricCard + 后端标量聚合 | 对齐 |
| 趋势图 | 时间序列折线图 | ✅ timeGranularity 分桶 | 对齐 |
| 后端聚合 | 服务端聚合引擎 | ✅ ChartDataService | 对齐 |
| 时间粒度 | 更细粒度 | day/week/month | 简化 |
| 筛选 | 条件筛选 | ✅ JsonLogic filter | 对齐 |
| 管理后台运营报表 | 活跃用户/存储/流程监控 | ❌ 属 Phase 9.9 范畴 | 不在本次范围 |

---

## 4. 验收标准

1. ✅ 拖入柱状图组件 → 绑定对象数据源 → 配置分类/值字段 → 渲染正确
2. ✅ 后端聚合 API 返回正确的 categories + values
3. ✅ 编辑模式使用 Mock 数据预览图表
4. ✅ DashboardGrid 支持拖拽调整位置和大小
5. ✅ 4 种图表类型（bar/line/pie/funnel）均可正常渲染
6. ✅ 统计卡片显示 title/value/prefix/suffix
7. ✅ 指标卡配置聚合后，运行时从后端获取标量值（7.7 新增）
8. ✅ 趋势图配置 timeGranularity 后，按时间分桶排序渲染（7.7 新增）
9. ✅ 前端图表直连后端聚合 API，不再依赖客户端 ≤100 行聚合（7.7 新增）
10. ✅ filter 筛选条件在聚合时生效（7.7 新增）
11. ✅ E2E 测试：聚合 API + 时间分桶 + 标量聚合 + 图表配置运行时预览（7.8 新增）

> **验收状态**: ✅ 后端聚合 API 21 单元测试 + E2E 6 测试 + 前端图表渲染验证 + DashboardGrid 交互验证全部通过
