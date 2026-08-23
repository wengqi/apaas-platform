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

---

## 4. 验收标准

1. ✅ 拖入柱状图组件 → 绑定对象数据源 → 配置分类/值字段 → 渲染正确
2. ✅ 后端聚合 API 返回正确的 categories + values
3. ✅ 编辑模式使用 Mock 数据预览图表
4. ✅ DashboardGrid 支持拖拽调整位置和大小
5. ✅ 4 种图表类型（bar/line/pie/funnel）均可正常渲染
6. ✅ 统计卡片显示 title/value/prefix/suffix

> **验收状态**: ✅ 后端聚合 API 测试 + 前端图表渲染验证 + DashboardGrid 交互验证全部通过
